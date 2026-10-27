/**
 * 1000m x 1000m World Builder for BGMI
 * Heavily optimized for older laptops using InstancedMesh, low draw calls,
 * vertex-colored terrain, and modular low-poly compounds.
 */

import * as THREE from 'three';
import { getTerrainHeight, getTerrainNormal, isNearRoad, MAP_SIZE, WATER_HEIGHT } from './terrain';
import { MAP_POIS, WeaponId, AmmoType, ConsumableType } from './types';

export interface LootItem {
  id: string;
  type: 'weapon' | 'ammo' | 'consumable' | 'armor' | 'helmet' | 'backpack';
  itemId: WeaponId | AmmoType | ConsumableType | string;
  name: string;
  amount: number;
  position: THREE.Vector3;
  mesh?: THREE.Group;
  level?: number;
}

export interface BuildingCollider {
  box: THREE.Box3;
  type: 'wall' | 'building' | 'fence' | 'rock' | 'crate';
}

export interface VehicleInstance {
  id: string;
  type: 'UAZ' | 'Buggy';
  position: THREE.Vector3;
  rotation: THREE.Euler;
  mesh: THREE.Group;
  speed: number;
  health: number;
  maxHealth: number;
  isOccupied: boolean;
  wheels: THREE.Mesh[];
  shadowMesh?: THREE.Mesh;
}

export class WorldBuilder {
  public scene: THREE.Scene;
  public terrainMesh!: THREE.Mesh;
  public colliders: BuildingCollider[] = [];
  public lootItems: LootItem[] = [];
  public vehicles: VehicleInstance[] = [];
  public houseSpawnPoints: THREE.Vector3[] = [];
  public buildingBounds: THREE.Box3[] = [];
  public airdropCrates: { mesh: THREE.Group; position: THREE.Vector3; hasLanded: boolean; loot: LootItem[] }[] = [];
  public waterMesh!: THREE.Mesh;

  // Instanced foliage
  private pineTrees!: THREE.InstancedMesh;
  private oakTrees!: THREE.InstancedMesh;
  private bushes!: THREE.InstancedMesh;
  private rocks!: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public async buildWorld(): Promise<void> {
    this.createTerrain();
    this.createWater();
    this.createFoliageInstances();
    this.createPOIsAndBuildings();
    this.createBridges();
    this.spawnInitialLoot();
    this.spawnVehicles();
  }

  /**
   * 1. 1000m x 1000m Terrain with Vertex Colors
   */
  private createTerrain(): void {
    const segments = 120; // 120x120 vertices = ~14,000 vertices, lightweight for older laptops
    const geometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors: number[] = [];

    const sandColor = new THREE.Color(0xdfba82); // warm golden desert sand (Miramar)
    const grassLight = new THREE.Color(0xe0b980); // light desert sand dust
    const grassDark = new THREE.Color(0xcca268);  // dark rich orange-tinted sand
    const rockColor = new THREE.Color(0xab734b);  // terracotta/red sandstone canyon rock
    const roadColor = new THREE.Color(0x4a433a);  // rustic dark cracked asphalt/dirt roads

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = getTerrainHeight(x, z);
      positions.setY(i, y);

      const vertexColor = new THREE.Color();
      if (isNearRoad(x, z, 3.5)) {
        vertexColor.copy(roadColor);
      } else if (y < WATER_HEIGHT + 1.8) {
        vertexColor.copy(sandColor);
      } else if (y > 28) {
        // High mountain rock
        vertexColor.copy(rockColor);
      } else {
        // Sloped grass variation
        const normal = getTerrainNormal(x, z);
        const slope = 1 - normal.y; // 0 = flat, 1 = vertical cliff
        if (slope > 0.42) {
          vertexColor.copy(rockColor);
        } else {
          const grassBlend = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.5 + 0.5;
          vertexColor.lerpColors(grassLight, grassDark, grassBlend);
        }
      }

      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  /**
   * 2. Ocean water plane
   */
  private createWater(): void {
    const waterGeo = new THREE.PlaneGeometry(4000, 4000);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x2190c7,
      transparent: true,
      opacity: 0.85,
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = WATER_HEIGHT;
    this.scene.add(this.waterMesh);
  }

  /**
   * 3. Instanced Foliage: 4,000+ trees, bushes, and rocks in ONLY 4 DRAW CALLS
   */
  private createFoliageInstances(): void {
    // 3a. Pine Tree geometry (Trunk + 2 Cones)
    const pineTrunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3.5, 5);
    const pineFoliageGeo = new THREE.ConeGeometry(2.4, 6.0, 5);
    pineFoliageGeo.translate(0, 4.5, 0);

    const pineCombinedGeo = new THREE.BufferGeometry();
    // simple single low poly tree geometry
    const treeGeo = new THREE.ConeGeometry(2.2, 7.5, 5);
    treeGeo.translate(0, 3.75, 0);

    const pineMat = new THREE.MeshLambertMaterial({ color: 0x4c6a43 }); // Dusty Cactus Green (Miramar Saguaro cacti)
    const oakMat = new THREE.MeshLambertMaterial({ color: 0xc4af8a });  // Dry Golden Tumbleweed/Shrub
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x7b8764 }); // Dusty Sagebrush / desert shrubs
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xb58055 }); // Reddish-orange canyon rocks

    const pineCount = 1400;
    this.pineTrees = new THREE.InstancedMesh(treeGeo, pineMat, pineCount);
    this.pineTrees.castShadow = false;
    this.pineTrees.receiveShadow = false;

    // 3b. Oak Tree geometry (Dodecahedron foliage on trunk)
    const oakFoliageGeo = new THREE.DodecahedronGeometry(3.0, 0);
    oakFoliageGeo.translate(0, 5.0, 0);
    const oakCount = 1000;
    this.oakTrees = new THREE.InstancedMesh(oakFoliageGeo, oakMat, oakCount);

    // 3c. Bushes
    const bushGeo = new THREE.DodecahedronGeometry(1.2, 0);
    bushGeo.scale(1.4, 0.9, 1.4);
    const bushCount = 1200;
    this.bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);

    // 3d. Rocks
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 0);
    rockGeo.scale(1.3, 0.8, 1.1);
    const rockCount = 700;
    this.rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

    const dummy = new THREE.Object3D();

    // Populate Pines
    let pineIdx = 0;
    for (let i = 0; i < pineCount; i++) {
      const rx = (Math.random() - 0.5) * 880;
      const rz = (Math.random() - 0.5) * 880;
      const y = getTerrainHeight(rx, rz);

      // Avoid water and roads
      if (y > WATER_HEIGHT + 2.0 && !isNearRoad(rx, rz, 8) && !this.isInsidePOI(rx, rz, 15)) {
        dummy.position.set(rx, y, rz);
        const scale = 0.8 + Math.random() * 0.6;
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        this.pineTrees.setMatrixAt(pineIdx++, dummy.matrix);

        // Add trunk collision box
        if (pineIdx % 4 === 0) { // sparse colliders to keep laptop physics light
          this.colliders.push({
            box: new THREE.Box3().setFromCenterAndSize(
              new THREE.Vector3(rx, y + 2, rz),
              new THREE.Vector3(1.0, 4.0, 1.0)
            ),
            type: 'wall',
          });
        }
      }
    }
    this.pineTrees.count = pineIdx;
    this.pineTrees.instanceMatrix.needsUpdate = true;
    this.scene.add(this.pineTrees);

    // Populate Oaks
    let oakIdx = 0;
    for (let i = 0; i < oakCount; i++) {
      const rx = (Math.random() - 0.5) * 860;
      const rz = (Math.random() - 0.5) * 860;
      const y = getTerrainHeight(rx, rz);
      if (y > WATER_HEIGHT + 2.0 && !isNearRoad(rx, rz, 8) && !this.isInsidePOI(rx, rz, 12)) {
        dummy.position.set(rx, y, rz);
        const scale = 0.75 + Math.random() * 0.5;
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        this.oakTrees.setMatrixAt(oakIdx++, dummy.matrix);
      }
    }
    this.oakTrees.count = oakIdx;
    this.oakTrees.instanceMatrix.needsUpdate = true;
    this.scene.add(this.oakTrees);

    // Populate Bushes
    let bushIdx = 0;
    for (let i = 0; i < bushCount; i++) {
      const rx = (Math.random() - 0.5) * 880;
      const rz = (Math.random() - 0.5) * 880;
      const y = getTerrainHeight(rx, rz);
      if (y > WATER_HEIGHT + 1.0 && !isNearRoad(rx, rz, 4)) {
        dummy.position.set(rx, y + 0.3, rz);
        const scale = 0.7 + Math.random() * 0.6;
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        this.bushes.setMatrixAt(bushIdx++, dummy.matrix);
      }
    }
    this.bushes.count = bushIdx;
    this.bushes.instanceMatrix.needsUpdate = true;
    this.scene.add(this.bushes);

    // Populate Rocks
    let rockIdx = 0;
    for (let i = 0; i < rockCount; i++) {
      const rx = (Math.random() - 0.5) * 880;
      const rz = (Math.random() - 0.5) * 880;
      const y = getTerrainHeight(rx, rz);
      if (y > WATER_HEIGHT + 1.5 && !isNearRoad(rx, rz, 5)) {
        dummy.position.set(rx, y + 0.4, rz);
        const scale = 0.7 + Math.random() * 0.8;
        dummy.scale.set(scale, scale * 0.8, scale);
        dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
        dummy.updateMatrix();
        this.rocks.setMatrixAt(rockIdx++, dummy.matrix);

        // Rock collider for cover
        if (scale > 1.0) {
          this.colliders.push({
            box: new THREE.Box3().setFromCenterAndSize(
              new THREE.Vector3(rx, y + 1.0, rz),
              new THREE.Vector3(2.2 * scale, 2.0 * scale, 2.2 * scale)
            ),
            type: 'rock',
          });
        }
      }
    }
    this.rocks.count = rockIdx;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rocks);
  }

  private isInsidePOI(x: number, z: number, padding = 0): boolean {
    for (const poi of MAP_POIS) {
      if (Math.hypot(x - poi.x, z - poi.z) < poi.radius + padding) {
        return true;
      }
    }
    return false;
  }

  /**
   * 4. Build Cities, Military Compounds, Shipping Docks, and Ruins
   */
  private createPOIsAndBuildings(): void {
    // Shared materials to minimize GPU state changes
    const wallWhiteMat = new THREE.MeshLambertMaterial({ color: 0xdfb48c }); // Warm clay adobe beige (Miramar)
    const wallBrickMat = new THREE.MeshLambertMaterial({ color: 0xcc7252 }); // Terracotta Orange concrete
    const wallMilitaryMat = new THREE.MeshLambertMaterial({ color: 0xa89684 }); // Sandy military concrete
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xba4e32 }); // Bright desert clay roof tiles
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x6e5c50 }); // Dark rustic stone
    const containerColors = [0xb83828, 0x2b578c, 0xc78a1a, 0x2d7a46];

    // 4a. PECADO METROPOLIS (Central sprawling city: houses, boxing arena, casino)
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        if (row === 0 && col === 0) continue; // leave central square open
        if (row === 0 && col === -1) continue; // leave room for casino next to arena
        const bx = col * 32 + (Math.sin(row) * 4);
        const bz = row * 32 + (Math.cos(col) * 4);
        this.buildHouse(bx, bz, 4, wallWhiteMat, roofMat, floorMat);
      }
    }
    // Pecado Boxing Arena (Stadium) in the center
    this.buildPecadoArena(0, 0, wallWhiteMat, wallBrickMat);
    // Pecado Casino next to it
    this.buildPecadoCasino(-36, 0, wallBrickMat, roofMat);

    // 4b. MILITARY BASE (Radar dome, long barracks, bunkers)
    const mbX = 220;
    const mbZ = 280;
    // 3 Long Barracks
    this.buildBarracks(mbX - 35, mbZ - 20, wallMilitaryMat, roofMat);
    this.buildBarracks(mbX + 35, mbZ - 20, wallMilitaryMat, roofMat);
    this.buildBarracks(mbX, mbZ + 35, wallMilitaryMat, roofMat);
    // Radar Tower
    this.buildRadarTower(mbX, mbZ - 45);

    // 4c. CHUMACERA INDUSTRIAL FACTORY (Silos, shipping containers & warehouse frames)
    const gpX = -320;
    const gpZ = -180;
    let colorIdx = 0;
    for (let i = 0; i < 28; i++) {
      const cx = gpX + (i % 7) * 16 - 48;
      const cz = gpZ + Math.floor(i / 7) * 22 - 30;
      const cMat = new THREE.MeshLambertMaterial({ color: containerColors[colorIdx++ % containerColors.length] });
      this.buildShippingContainer(cx, cz, cMat);
      // Stack some containers
      if (i % 3 === 0) {
        this.buildShippingContainer(cx, cz, cMat, 3.2);
      }
    }

    // 4d. HACIENDA DEL PATRÓN (Mansion & surrounding compounds)
    const scX = -120;
    const scZ = -200;
    this.buildHaciendaVilla(scX, scZ, wallWhiteMat, roofMat);
    // Surrounding guest houses of Hacienda
    for (let i = 0; i < 4; i++) {
      const hx = scX + 45 + (i % 2) * 26;
      const hz = scZ + Math.floor(i / 2) * 26;
      this.buildHouse(hx, hz, 4, wallWhiteMat, roofMat, floorMat);
    }

    // 4e. LOS LEONES SKELETONS METROPOLIS (Unfinished Brick/Concrete Buildings)
    const ruX = -240;
    const ruZ = 120;
    // 3 Tall Unfinished Construction Skeletons
    this.buildLosLeonesSkeleton(ruX, ruZ, wallBrickMat);
    this.buildLosLeonesSkeleton(ruX + 35, ruZ - 25, wallWhiteMat);
    this.buildLosLeonesSkeleton(ruX - 35, ruZ + 25, wallBrickMat);
    const ruY = getTerrainHeight(ruX, ruZ);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a877e });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const px = ruX + Math.cos(angle) * 36;
      const pz = ruZ + Math.sin(angle) * 36;
      const py = getTerrainHeight(px, pz);
      const pillarGeo = new THREE.CylinderGeometry(1.2, 1.4, 7 + (i % 3) * 2, 6);
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(px, py + 3.5, pz);
      this.scene.add(pillar);

      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(pillar.position, new THREE.Vector3(2.5, 8, 2.5)),
        type: 'rock',
      });
    }

    // 4f. SHOOTING RANGE (Target barriers, sniper stand)
    const srX = 180;
    const srZ = -320;
    const srY = getTerrainHeight(srX, srZ);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c4228 });
    for (let i = 0; i < 4; i++) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), woodMat);
      tower.position.set(srX - 30 + i * 20, srY + 4, srZ);
      this.scene.add(tower);
      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(tower.position, new THREE.Vector3(4, 8, 4)),
        type: 'building',
      });
    }

    // 4g. BUNKER SHELTER (Earth mound entrance with concrete tunnel frame)
    const bkX = 280;
    const bkZ = -80;
    const bkY = getTerrainHeight(bkX, bkZ);
    const bunkerArch = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 12), wallMilitaryMat);
    bunkerArch.position.set(bkX, bkY + 2.5, bkZ);
    this.scene.add(bunkerArch);
    const bunkerBox = new THREE.Box3().setFromCenterAndSize(bunkerArch.position, new THREE.Vector3(8, 5, 12));
    this.colliders.push({
      box: bunkerBox,
      type: 'building',
    });
    this.buildingBounds.push(bunkerBox);

    // 4h. STARTING POINT OUTPOST (South Outpost Gate, x = 0, z = -850)
    const sgX = 0;
    const sgZ = -850;
    const sgY = getTerrainHeight(sgX, sgZ);
    const wallColor = new THREE.MeshLambertMaterial({ color: 0xccb096 });
    this.buildHouse(sgX, sgZ, 4, wallWhiteMat, roofMat, floorMat);
    this.buildHouse(sgX - 22, sgZ - 10, 4, wallBrickMat, roofMat, floorMat);
    this.buildHouse(sgX + 22, sgZ + 10, 4, wallWhiteMat, roofMat, floorMat);
    this.buildStandAloneWall(sgX - 35, sgY, sgZ, 2, 3.5, 40, wallColor); // West Compound Wall
    this.buildStandAloneWall(sgX + 35, sgY, sgZ, 2, 3.5, 40, wallColor); // East Compound Wall
    this.buildStandAloneWall(sgX, sgY, sgZ - 20, 70, 3.5, 2, wallColor); // South Compound Wall
    this.buildStandAloneWall(sgX - 18, sgY, sgZ + 20, 24, 3.5, 2, wallColor); // North West Gate Wall
    this.buildStandAloneWall(sgX + 18, sgY, sgZ + 20, 24, 3.5, 2, wallColor); // North East Gate Wall

    // 4i. END POINT OUTPOST (North Outpost Gate, x = 0, z = 850)
    const ngX = 0;
    const ngZ = 850;
    const ngY = getTerrainHeight(ngX, ngZ);
    this.buildHouse(ngX, ngZ, 2, wallBrickMat, roofMat, floorMat);
    this.buildHouse(ngX - 22, ngZ - 10, 1, wallWhiteMat, roofMat, floorMat);
    this.buildHouse(ngX + 22, ngZ + 10, 1, wallBrickMat, roofMat, floorMat);
    this.buildStandAloneWall(ngX - 35, ngY, ngZ, 2, 3.5, 40, wallColor); // West Compound Wall
    this.buildStandAloneWall(ngX + 35, ngY, ngZ, 2, 3.5, 40, wallColor); // East Compound Wall
    this.buildStandAloneWall(ngX, ngY, ngZ + 20, 70, 3.5, 2, wallColor); // North Compound Wall
    this.buildStandAloneWall(ngX - 18, ngY, ngZ - 20, 24, 3.5, 2, wallColor); // South West Gate Wall
    this.buildStandAloneWall(ngX + 18, ngY, ngZ - 20, 24, 3.5, 2, wallColor); // South East Gate Wall
  }

  /**
   * Procedural House with doorway, interior walls, stairs, and upper floor
   */
  private buildHouse(
    x: number,
    z: number,
    floors = 1,
    wallMat: THREE.Material,
    roofMat: THREE.Material,
    floorMat: THREE.Material
  ): void {
    const y = getTerrainHeight(x, z);
    const houseGroup = new THREE.Group();
    houseGroup.position.set(x, y, z);

    const width = 12;
    const depth = 14;
    const floorH = 3.4;

    // 1. Foundation / Ground Floor
    const floorGeo = new THREE.BoxGeometry(width, 0.4, depth);
    const groundFloor = new THREE.Mesh(floorGeo, floorMat);
    groundFloor.position.y = 0.2;
    houseGroup.add(groundFloor);

    // 2. Per-floor construction
    for (let f = 0; f < floors; f++) {
      const hBase = f * floorH;

      // Front wall (with 2.5m door opening at center)
      this.addWall(houseGroup, -4.75, hBase + floorH / 2, depth / 2, 2.5, floorH, 0.4, wallMat, x, y, z); // Front Left
      this.addWall(houseGroup, 4.75, hBase + floorH / 2, depth / 2, 2.5, floorH, 0.4, wallMat, x, y, z);  // Front Right
      this.addWall(houseGroup, 0, hBase + floorH - 0.4, depth / 2, 7.0, 0.8, 0.4, wallMat, x, y, z);    // Door Header

      // Back wall
      this.addWall(houseGroup, 0, hBase + floorH / 2, -depth / 2, width, floorH, 0.4, wallMat, x, y, z);

      // Left wall
      this.addWall(houseGroup, -width / 2, hBase + floorH / 2, 0, 0.4, floorH, depth, wallMat, x, y, z);

      // Right wall
      this.addWall(houseGroup, width / 2, hBase + floorH / 2, 0, 0.4, floorH, depth, wallMat, x, y, z);

      // Interior Wall (Room Divider)
      if (f === 0) {
        this.addWall(houseGroup, 0, hBase + floorH / 2, -2, 0.3, floorH, depth - 4, wallMat, x, y, z);
      }

      // Upper Floor Slab (if more floors)
      if (f < floors - 1) {
        const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(width - 4, 0.3, depth), floorMat);
        upperFloor.position.set(2, hBase + floorH + 0.15, 0);
        houseGroup.add(upperFloor);
        // Collider for floor
        this.colliders.push({
          box: new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(x + 2, y + hBase + floorH + 0.15, z),
            new THREE.Vector3(width - 4, 0.3, depth)
          ),
          type: 'building',
        });

        // STAIRS - 8 Steps instead of a ramp for better AABB navigation
        const stepWidth = 3.5;
        const stepDepth = 1.0; // 8 / 8
        const stepHeight = floorH / 8;
        for (let s = 0; s < 8; s++) {
          const stepGeo = new THREE.BoxGeometry(stepWidth, 0.4, stepDepth);
          const step = new THREE.Mesh(stepGeo, floorMat);
          const stepZ = -4 + s * stepDepth;
          const stepY = hBase + (s + 1) * stepHeight;
          step.position.set(-width / 2 + 2.5, stepY, stepZ);
          houseGroup.add(step);

          // Add collider for each step
          this.colliders.push({
            box: new THREE.Box3().setFromCenterAndSize(
              new THREE.Vector3(x - width / 2 + 2.5, y + stepY, z + stepZ),
              new THREE.Vector3(stepWidth, 0.4, stepDepth)
            ),
            type: 'building',
          });
        }
      }
    }

    // 3. Pitched Roof
    const roofGeo = new THREE.ConeGeometry(Math.hypot(width, depth) * 0.6, 2.8, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = (floors * floorH) + 1.4;
    houseGroup.add(roof);

    this.scene.add(houseGroup);

    // Register house 3D building bounds for shelter and bullet blocking
    const totalH = (floors * floorH) + 3.0;
    this.buildingBounds.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + totalH / 2, z),
        new THREE.Vector3(width, totalH, depth)
      )
    );

    // Register indoor loot spawn points
    this.houseSpawnPoints.push(new THREE.Vector3(x + 2, y + 0.5, z + 2));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 2, y + 0.5, z - 2));
    if (floors > 1) {
      this.houseSpawnPoints.push(new THREE.Vector3(x + 2, y + 3.8, z + 2));
    }
  }

  private addWall(
    group: THREE.Group,
    lx: number, ly: number, lz: number,
    w: number, h: number, d: number,
    mat: THREE.Material,
    wx: number, wy: number, wz: number
  ): void {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    wall.position.set(lx, ly, lz);
    group.add(wall);

    // Global space collider
    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(wx + lx, wy + ly, wz + lz),
        new THREE.Vector3(w, h, d)
      ),
      type: 'wall',
    });
  }

  private buildStandAloneWall(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material): void {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(x, y, z);
    
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    wall.position.set(0, h/2, 0);
    wallGroup.add(wall);
    
    this.scene.add(wallGroup);
    
    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + h/2, z),
        new THREE.Vector3(w, h, d)
      ),
      type: 'wall',
    });
  }

  /**
   * Military Barracks (Long low-profile corrugated hall)
   */
  private buildBarracks(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const length = 28;
    const width = 10;
    const height = 4.2;

    const barracks = new THREE.Group();
    barracks.position.set(x, y, z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), wallMat);
    body.position.y = height / 2;
    barracks.add(body);

    const roof = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.55, width * 0.55, length, 8, 1, false, 0, Math.PI), roofMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = height;
    barracks.add(roof);

    this.scene.add(barracks);

    const barracksBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + height / 2, z),
      new THREE.Vector3(width, height + 2, length)
    );
    this.colliders.push({
      box: barracksBox,
      type: 'building',
    });
    this.buildingBounds.push(barracksBox);

    // Register indoor loot spawn points for Barracks
    this.houseSpawnPoints.push(new THREE.Vector3(x - 2, y + 0.5, z - 8));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 2, y + 0.5, z + 8));
  }

  /**
   * Shipping Container
   */
  private buildShippingContainer(x: number, z: number, mat: THREE.Material, yOffset = 0): void {
    const y = getTerrainHeight(x, z) + yOffset;
    const container = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 10), mat);
    container.position.set(x, y + 1.5, z);
    this.scene.add(container);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(container.position, new THREE.Vector3(4, 3, 10)),
      type: 'crate',
    });
  }

  /**
   * Pochinki Church
   */
  private buildChurch(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const church = new THREE.Group();
    church.position.set(x, y, z);

    // Nave
    const nave = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 24), wallMat);
    nave.position.y = 3.5;
    church.add(nave);

    // Tower Spire
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 22, 7), wallMat);
    tower.position.set(0, 11, 10);
    church.add(tower);

    const steeple = new THREE.Mesh(new THREE.ConeGeometry(5, 8, 4), roofMat);
    steeple.rotateY(Math.PI / 4);
    steeple.position.set(0, 26, 10);
    church.add(steeple);

    this.scene.add(church);

    const churchBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + 5, z),
      new THREE.Vector3(16, 10, 24)
    );
    this.colliders.push({
      box: churchBox,
      type: 'building',
    });
    this.buildingBounds.push(churchBox);

    // Register indoor loot spawn points for Church
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z - 4));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z + 4));
  }

  /**
   * Pecado Boxing Arena (Stadium)
   */
  private buildPecadoArena(x: number, z: number, wallMat: THREE.Material, seatMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const arena = new THREE.Group();
    arena.position.set(x, y, z);

    const wallThick = 2.5;
    const arenaW = 28;
    const arenaL = 34;
    const arenaH = 8.5;

    // West Wall
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, arenaH, arenaL), wallMat);
    wWall.position.set(-arenaW / 2, arenaH / 2, 0);
    arena.add(wWall);

    // East Wall
    const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, arenaH, arenaL), wallMat);
    eWall.position.set(arenaW / 2, arenaH / 2, 0);
    arena.add(eWall);

    // North Wall
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(arenaW, arenaH, wallThick), wallMat);
    nWall.position.set(0, arenaH / 2, -arenaL / 2);
    arena.add(nWall);

    // South Wall
    const sWall = new THREE.Mesh(new THREE.BoxGeometry(arenaW, arenaH, wallThick), wallMat);
    sWall.position.set(0, arenaH / 2, arenaL / 2);
    arena.add(sWall);

    // Central Boxing Ring
    const ring = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 6), seatMat);
    ring.position.set(0, 0.6, 0);
    arena.add(ring);

    // Tiered Seats
    const seatW = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, arenaL - 8), seatMat);
    seatW.position.set(-arenaW / 2 + 3.5, 1.75, 0);
    arena.add(seatW);

    const seatE = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, arenaL - 8), seatMat);
    seatE.position.set(arenaW / 2 - 3.5, 1.75, 0);
    arena.add(seatE);

    this.scene.add(arena);

    const arenaBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + arenaH / 2, z),
      new THREE.Vector3(arenaW, arenaH, arenaL)
    );
    this.colliders.push({
      box: arenaBox,
      type: 'building',
    });
    this.buildingBounds.push(arenaBox);

    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 1.4, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 9, y + 4.0, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 9, y + 4.0, z));
  }

  /**
   * Pecado Casino Block
   */
  private buildPecadoCasino(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const casino = new THREE.Group();
    casino.position.set(x, y, z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 18), wallMat);
    base.position.y = 6;
    casino.add(base);

    const neonSign = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 2), roofMat);
    neonSign.position.set(0, 10, 10);
    casino.add(neonSign);

    this.scene.add(casino);

    const casinoBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + 6, z),
      new THREE.Vector3(18, 12, 18)
    );
    this.colliders.push({
      box: casinoBox,
      type: 'building',
    });
    this.buildingBounds.push(casinoBox);

    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 4, y + 0.5, z + 4));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 4, y + 0.5, z - 4));
  }

  /**
   * Hacienda del Patron Villa
   */
  private buildHaciendaVilla(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const villa = new THREE.Group();
    villa.position.set(x, y, z);

    const wingW = 8;
    const wingH = 7.5;
    const courtyardSize = 14;

    const wWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, courtyardSize + wingW * 2), wallMat);
    wWing.position.set(-courtyardSize / 2 - wingW / 2, wingH / 2, 0);
    villa.add(wWing);

    const eWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, courtyardSize + wingW * 2), wallMat);
    eWing.position.set(courtyardSize / 2 + wingW / 2, wingH / 2, 0);
    villa.add(eWing);

    const nWing = new THREE.Mesh(new THREE.BoxGeometry(courtyardSize, wingH, wingW), wallMat);
    nWing.position.set(0, wingH / 2, -courtyardSize / 2 - wingW / 2);
    villa.add(nWing);

    const sWing = new THREE.Mesh(new THREE.BoxGeometry(courtyardSize, wingH, wingW), wallMat);
    sWing.position.set(0, wingH / 2, courtyardSize / 2 + wingW / 2);
    villa.add(sWing);

    const wRoof = new THREE.Mesh(new THREE.ConeGeometry(wingW * 0.8, 3, 4), roofMat);
    wRoof.position.set(-courtyardSize / 2 - wingW / 2, wingH + 1.5, 0);
    villa.add(wRoof);

    const eRoof = new THREE.Mesh(new THREE.ConeGeometry(wingW * 0.8, 3, 4), roofMat);
    eRoof.position.set(courtyardSize / 2 + wingW / 2, wingH + 1.5, 0);
    villa.add(eRoof);

    this.scene.add(villa);

    const villaBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + wingH / 2, z),
      new THREE.Vector3(courtyardSize + wingW * 2, wingH, courtyardSize + wingW * 2)
    );
    this.colliders.push({
      box: villaBox,
      type: 'building',
    });
    this.buildingBounds.push(villaBox);

    this.houseSpawnPoints.push(new THREE.Vector3(x - 9, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 9, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z - 9));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z + 9));
  }

  /**
   * Los Leones construction skeleton
   */
  private buildLosLeonesSkeleton(x: number, z: number, brickMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const skeleton = new THREE.Group();
    skeleton.position.set(x, y, z);

    const width = 16;
    const length = 20;
    const floorH = 3.6;

    for (let floor = 0; floor < 3; floor++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, length), brickMat);
      slab.position.y = floor * floorH;
      skeleton.add(slab);
    }

    const colH = floorH * 2.8;
    const colGeo = new THREE.BoxGeometry(1.2, colH, 1.2);

    const c1 = new THREE.Mesh(colGeo, brickMat);
    c1.position.set(-width / 2 + 0.6, colH / 2, -length / 2 + 0.6);
    skeleton.add(c1);

    const c2 = new THREE.Mesh(colGeo, brickMat);
    c2.position.set(width / 2 - 0.6, colH / 2, -length / 2 + 0.6);
    skeleton.add(c2);

    const c3 = new THREE.Mesh(colGeo, brickMat);
    c3.position.set(-width / 2 + 0.6, colH / 2, length / 2 - 0.6);
    skeleton.add(c3);

    const c4 = new THREE.Mesh(colGeo, brickMat);
    c4.position.set(width / 2 - 0.6, colH / 2, length / 2 - 0.6);
    skeleton.add(c4);

    this.scene.add(skeleton);

    const skeletonBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + colH / 2, z),
      new THREE.Vector3(width, colH, length)
    );
    this.colliders.push({
      box: skeletonBox,
      type: 'building',
    });
    this.buildingBounds.push(skeletonBox);

    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + floorH + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + floorH * 2 + 0.5, z));
  }

  /**
   * Radar Tower for Military Base
   */
  private buildRadarTower(x: number, z: number): void {
    const y = getTerrainHeight(x, z);
    const tower = new THREE.Group();
    tower.position.set(x, y, z);

    const metalMat = new THREE.MeshLambertMaterial({ color: 0x55585b });
    const domeMat = new THREE.MeshLambertMaterial({ color: 0xdedede });

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 32, 6), metalMat);
    mast.position.y = 16;
    tower.add(mast);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 8), domeMat);
    dome.position.y = 34;
    tower.add(dome);

    this.scene.add(tower);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + 16, z),
        new THREE.Vector3(6, 36, 6)
      ),
      type: 'building',
    });
  }

  /**
   * School Complex
   */
  private buildSchoolComplex(x: number, z: number, wallMat: THREE.Material, floorMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const school = new THREE.Group();
    school.position.set(x, y, z);

    // Main classroom block
    const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(36, 7.5, 24), wallMat);
    mainBlock.position.y = 3.75;
    school.add(mainBlock);

    // Auditorium / Gym wing
    const gym = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 22), wallMat);
    gym.position.set(-28, 5, 0);
    school.add(gym);

    this.scene.add(school);

    const schoolBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + 4, z),
      new THREE.Vector3(56, 9, 26)
    );
    this.colliders.push({
      box: schoolBox,
      type: 'building',
    });
    this.buildingBounds.push(schoolBox);

    // Register indoor loot spawn points for School Complex
    this.houseSpawnPoints.push(new THREE.Vector3(x + 10, y + 0.5, z + 4));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 10, y + 0.5, z - 4));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 28, y + 0.5, z));
  }

  /**
   * Bridges over the River connecting South Island to Main Island
   */
  private createBridges(): void {
    const bridgeLocations = [
      { x: 60, z: 180, length: 70, width: 9 }, // East main bridge
      { x: -140, z: 180, length: 65, width: 8 }, // West bridge
    ];

    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x8b3a3a });

    for (const b of bridgeLocations) {
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(b.x, WATER_HEIGHT + 3.0, b.z);

      // Deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b.width, 0.8, b.length), roadMat);
      bridgeGroup.add(deck);

      // Steel Trusses on sides
      const trussL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.5, b.length), steelMat);
      trussL.position.set(-b.width / 2 + 0.25, 1.75, 0);
      bridgeGroup.add(trussL);

      const trussR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.5, b.length), steelMat);
      trussR.position.set(b.width / 2 - 0.25, 1.75, 0);
      bridgeGroup.add(trussR);

      // Pillars in river
      const pillarGeo = new THREE.CylinderGeometry(1.2, 1.6, 8, 6);
      const pillar1 = new THREE.Mesh(pillarGeo, roadMat);
      pillar1.position.set(0, -3.5, -b.length / 3);
      bridgeGroup.add(pillar1);
      const pillar2 = new THREE.Mesh(pillarGeo, roadMat);
      pillar2.position.set(0, -3.5, b.length / 3);
      bridgeGroup.add(pillar2);

      this.scene.add(bridgeGroup);

      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(b.x, WATER_HEIGHT + 3.0, b.z),
          new THREE.Vector3(b.width, 4, b.length)
        ),
        type: 'building',
      });
    }
  }

  /**
   * 5. Spawn Ground Loot (Guns, Ammo, Meds, Armor)
   */
  private spawnInitialLoot(): void {
    const lootList: { type: LootItem['type']; itemId: any; name: string; amount: number; level?: number }[] = [
      { type: 'weapon', itemId: 'm4', name: 'M416 Assault Rifle', amount: 1 },
      { type: 'weapon', itemId: 'm4', name: 'M416 Assault Rifle', amount: 1 },
      { type: 'ammo', itemId: '5.56mm', name: '5.56mm Ammo (60)', amount: 60 },
      { type: 'ammo', itemId: '5.56mm', name: '5.56mm Ammo (60)', amount: 60 },
      { type: 'consumable', itemId: 'first_aid', name: 'First Aid Kit', amount: 2 },
      { type: 'consumable', itemId: 'medkit', name: 'Medkit', amount: 1 },
      { type: 'consumable', itemId: 'energy_drink', name: 'Energy Drink', amount: 3 },
      { type: 'consumable', itemId: 'painkiller', name: 'Painkiller', amount: 2 },
      { type: 'armor', itemId: 'armor_2', name: 'Military Vest (Lv2)', amount: 1, level: 2 },
      { type: 'armor', itemId: 'armor_3', name: 'Police Vest (Lv3)', amount: 1, level: 3 },
      { type: 'helmet', itemId: 'helmet_2', name: 'Military Helmet (Lv2)', amount: 1, level: 2 },
      { type: 'helmet', itemId: 'helmet_3', name: 'Spetsnaz Helmet (Lv3)', amount: 1, level: 3 },
      { type: 'backpack', itemId: 'backpack_2', name: 'Combat Backpack (Lv2)', amount: 1, level: 2 },
      { type: 'backpack', itemId: 'backpack_3', name: 'Tactical Backpack (Lv3)', amount: 1, level: 3 },
    ];

    // Spawn 160 loot spots across towns and compounds (inside homes)
    for (let i = 0; i < 180; i++) {
      const template = lootList[i % lootList.length];
      let lx = 0;
      let lz = 0;
      let ly = 0.5;

      if (this.houseSpawnPoints.length > 0) {
        // Pick a registered indoor house/room point and add minor random spread to scatter inside
        const basePt = this.houseSpawnPoints[i % this.houseSpawnPoints.length];
        const offsetX = (Math.random() - 0.5) * 3.5;
        const offsetZ = (Math.random() - 0.5) * 3.5;
        lx = basePt.x + offsetX;
        lz = basePt.z + offsetZ;
        ly = basePt.y + 0.15; // slightly elevated off the floor
      } else {
        // Fallback if no house points
        const poi = MAP_POIS[i % MAP_POIS.length];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * (poi.radius * 0.8);
        lx = poi.x + Math.cos(angle) * dist;
        lz = poi.z + Math.sin(angle) * dist;
        ly = getTerrainHeight(lx, lz) + 0.45;
      }

      const lootMesh = this.createLootMesh(template.type, template.itemId);
      lootMesh.position.set(lx, ly, lz);
      this.scene.add(lootMesh);

      this.lootItems.push({
        id: `loot_${i}`,
        type: template.type,
        itemId: template.itemId,
        name: template.name,
        amount: template.amount,
        level: template.level,
        position: new THREE.Vector3(lx, ly, lz),
        mesh: lootMesh,
      });
    }
  }

  private createLootMesh(type: LootItem['type'], itemId: string): THREE.Group {
    const group = new THREE.Group();
    let mesh: THREE.Mesh;

    if (type === 'weapon') {
      // Tactical gun model silhouette
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.25, 0.85),
        new THREE.MeshLambertMaterial({ color: 0x1f2421 })
      );
    } else if (type === 'ammo') {
      // Ammo box (green/amber)
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.22, 0.35),
        new THREE.MeshLambertMaterial({ color: itemId === '5.56mm' ? 0x2e6b35 : 0xab7a22 })
      );
    } else if (type === 'helmet') {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0x36454f })
      );
    } else if (type === 'armor') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.5, 0.25),
        new THREE.MeshLambertMaterial({ color: 0x2b3d2b })
      );
    } else {
      // Consumables (First Aid, Drink, etc.)
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.35, 6),
        new THREE.MeshLambertMaterial({ color: 0xcc3333 })
      );
    }

    group.add(mesh);
    return group;
  }

  /**
   * 6. Spawn Drivable Vehicles (UAZ & Buggy)
   */
  private spawnVehicles(): void {
    const spawnPoints = [
      { x: 10, z: 25, type: 'UAZ' as const },
      { x: -160, z: -55, type: 'Buggy' as const },
      { x: 70, z: 155, type: 'UAZ' as const },
      { x: 210, z: 260, type: 'UAZ' as const },
      { x: -310, z: -160, type: 'Buggy' as const },
      { x: -50, z: -180, type: 'UAZ' as const },
      { x: 190, z: -300, type: 'Buggy' as const },
      { x: 270, z: -70, type: 'UAZ' as const },
      { x: 350, z: 130, type: 'Buggy' as const },
      { x: -400, z: 50, type: 'UAZ' as const },
      { x: 400, z: -100, type: 'Buggy' as const },
      { x: 0, z: 420, type: 'UAZ' as const },
      { x: -200, z: 380, type: 'Buggy' as const },
      { x: 150, z: -420, type: 'UAZ' as const },
      { x: -80, z: -350, type: 'Buggy' as const },
      { x: 280, z: 80, type: 'UAZ' as const },
    ];

    spawnPoints.forEach((sp, idx) => {
      const y = getTerrainHeight(sp.x, sp.z);
      const vehicle = this.createVehicleMesh(sp.type);
      vehicle.group.position.set(sp.x, y + 0.6, sp.z);
      this.scene.add(vehicle.group);

      // Simple ground shadow for vehicle
      const shadowGeo = new THREE.PlaneGeometry(3.6, 6.0);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.45,
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.position.set(sp.x, y + 0.05, sp.z);
      this.scene.add(shadowMesh);

      this.vehicles.push({
        id: `vehicle_${idx}`,
        type: sp.type,
        position: vehicle.group.position,
        rotation: vehicle.group.rotation,
        mesh: vehicle.group,
        speed: 0,
        health: 500,
        maxHealth: 500,
        isOccupied: false,
        wheels: vehicle.wheels,
        shadowMesh,
      });
    });
  }

  private createVehicleMesh(type: 'UAZ' | 'Buggy'): { group: THREE.Group; wheels: THREE.Mesh[] } {
    const group = new THREE.Group();
    const wheels: THREE.Mesh[] = [];

    const bodyMat = new THREE.MeshLambertMaterial({
      color: type === 'UAZ' ? 0x3d4b35 : 0xc77826,
    });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x6bb7d6, transparent: true, opacity: 0.6 });

    if (type === 'UAZ') {
      // Russian military 4x4 off-roader
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 4.4), bodyMat);
      chassis.position.y = 0.9;
      group.add(chassis);

      // Cabin & windshield
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 2.6), bodyMat);
      cabin.position.set(0, 1.9, -0.4);
      group.add(cabin);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 0.2), glassMat);
      windshield.position.set(0, 1.8, 0.95);
      group.add(windshield);
    } else {
      // Dune Buggy (tubular roll cage & nimble chassis)
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 3.8), bodyMat);
      chassis.position.y = 0.6;
      group.add(chassis);

      const rollCage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.0), new THREE.MeshLambertMaterial({ color: 0x222222, wireframe: true }));
      rollCage.position.set(0, 1.4, -0.2);
      group.add(rollCage);
    }

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { x: -1.2, y: 0.5, z: 1.4 },
      { x: 1.2, y: 0.5, z: 1.4 },
      { x: -1.2, y: 0.5, z: -1.4 },
      { x: 1.2, y: 0.5, z: -1.4 },
    ];

    wheelOffsets.forEach((off) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(off.x, off.y, off.z);
      group.add(wheel);
      wheels.push(wheel);
    });

    return { group, wheels };
  }

  /**
   * Spawn Supply Airdrop Crate with Red Flare Smoke
   */
  public spawnAirdrop(x: number, z: number): void {
    const y = getTerrainHeight(x, z);
    const crateGroup = new THREE.Group();
    crateGroup.position.set(x, 150, z); // drops from 150m in sky

    // Red supply crate with blue tarp
    const crateGeo = new THREE.BoxGeometry(2.0, 2.0, 2.0);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb52222 });
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crateGroup.add(crate);

    // Blue tarp top
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 2.1), new THREE.MeshLambertMaterial({ color: 0x1b4f91 }));
    tarp.position.y = 0.9;
    crateGroup.add(tarp);

    // Red smoke flare pillar
    const smokeGeo = new THREE.CylinderGeometry(0.3, 1.5, 12, 6);
    const smokeMat = new THREE.MeshLambertMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.75,
    });
    const smoke = new THREE.Mesh(smokeGeo, smokeMat);
    smoke.position.y = 7;
    crateGroup.add(smoke);

    this.scene.add(crateGroup);

    // Exclusive Airdrop Loot (M416 + Lv3 Gear)
    const airdropLoot: LootItem[] = [
      { id: `m4_${Date.now()}`, type: 'weapon', itemId: 'm4', name: 'M416 Assault Rifle', amount: 1, position: new THREE.Vector3(x, y, z) },
      { id: `ammo556_${Date.now()}`, type: 'ammo', itemId: '5.56mm', name: '5.56mm Ammo (60)', amount: 60, position: new THREE.Vector3(x, y, z) },
      { id: `helmet3_${Date.now()}`, type: 'helmet', itemId: 'helmet_3', name: 'Spetsnaz Helmet (Lv3)', amount: 1, level: 3, position: new THREE.Vector3(x, y, z) },
      { id: `armor3_${Date.now()}`, type: 'armor', itemId: 'armor_3', name: 'Military Vest (Lv3)', amount: 1, level: 3, position: new THREE.Vector3(x, y, z) },
      { id: `medkit_${Date.now()}`, type: 'consumable', itemId: 'medkit', name: 'Medkit', amount: 2, position: new THREE.Vector3(x, y, z) },
    ];

    this.airdropCrates.push({
      mesh: crateGroup,
      position: crateGroup.position,
      hasLanded: false,
      loot: airdropLoot,
    });
  }
}
