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

    // 4a. NUSA CENTRAL METROPOLIS (Monumental Science Center, Cybernetics Tower, Robotics Arena & Grand Pavilions)
    // Monumental Science Center right at the epicenter!
    this.buildScienceCenter(0, 0);

    // Surrounding Big Multi-Story Science Pavilions (Spacious 64m-72m avenues for vehicles and tactical gunfights)
    const centralPavilions = [
      { x: -64, z: -64, floors: 4 },
      { x: 0, z: -72, floors: 4 },
      { x: 64, z: -64, floors: 4 },
      { x: -64, z: 64, floors: 4 },
      { x: 0, z: 72, floors: 4 },
      { x: 64, z: 64, floors: 4 },
      { x: -128, z: 0, floors: 3 },
      { x: 128, z: 0, floors: 3 },
    ];
    for (const p of centralPavilions) {
      this.buildHouse(p.x, p.z, p.floors, wallWhiteMat, roofMat, floorMat);
    }

    // High-Tech Cybernetics Research Tower to the West
    this.buildPecadoCasino(-72, 0, wallBrickMat, roofMat);

    // Colossal Robotics Testing Arena to the East
    this.buildPecadoArena(72, 0, wallWhiteMat, wallBrickMat);

    // 4b. DEFENSE SCIENCE COMPLEX & MILITARY BASE (Radar dome, giant science hangars, science academy)
    const mbX = 220;
    const mbZ = 280;
    // 3 Giant Nusa Science Research Hangars (46m length x 22m width x 8m height)
    this.buildBarracks(mbX - 52, mbZ - 20, wallMilitaryMat, roofMat);
    this.buildBarracks(mbX + 52, mbZ - 20, wallMilitaryMat, roofMat);
    this.buildBarracks(mbX, mbZ + 55, wallMilitaryMat, roofMat);
    // Monumental Radar Tower
    this.buildRadarTower(mbX, mbZ - 55);
    // Defense Science Academy Block
    this.buildSchoolComplex(mbX - 8, mbZ - 110, wallMilitaryMat, floorMat);

    // 4c. NUSA TECH PORT & INDUSTRIAL FACTORY (Giant shipping containers, science storage units)
    const gpX = -320;
    const gpZ = -180;
    let colorIdx = 0;
    for (let i = 0; i < 28; i++) {
      const cx = gpX + (i % 7) * 22 - 66;
      const cz = gpZ + Math.floor(i / 7) * 28 - 42;
      const cMat = new THREE.MeshLambertMaterial({ color: containerColors[colorIdx++ % containerColors.length] });
      this.buildShippingContainer(cx, cz, cMat);
      // Stack some containers for high-ground verticality
      if (i % 3 === 0) {
        this.buildShippingContainer(cx, cz, cMat, 4.0);
      }
    }

    // 4d. RESORT SCIENCE LABS & BIO-TECH HEADQUARTERS (Massive 58m x 58m complex & science villas)
    const scX = -120;
    const scZ = -200;
    this.buildHaciendaVilla(scX, scZ, wallWhiteMat, roofMat);
    // Surrounding Grand Science Villas of Resort Labs
    this.buildHouse(scX + 68, scZ - 32, 4, wallWhiteMat, roofMat, floorMat);
    this.buildHouse(scX + 68, scZ + 32, 4, wallWhiteMat, roofMat, floorMat);
    this.buildHouse(scX - 68, scZ - 32, 4, wallBrickMat, roofMat, floorMat);
    this.buildHouse(scX - 68, scZ + 32, 4, wallBrickMat, roofMat, floorMat);

    // 4e. LOS LEONES SKELETONS METROPOLIS (Giant 5-Story Unfinished Futuristic Skyscraper Skeletons)
    const ruX = -240;
    const ruZ = 120;
    // 3 Massive 5-Story Construction Skeletons
    this.buildLosLeonesSkeleton(ruX, ruZ, wallBrickMat);
    this.buildLosLeonesSkeleton(ruX + 58, ruZ - 44, wallWhiteMat);
    this.buildLosLeonesSkeleton(ruX - 58, ruZ + 44, wallBrickMat);
    const ruY = getTerrainHeight(ruX, ruZ);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a877e });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const px = ruX + Math.cos(angle) * 44;
      const pz = ruZ + Math.sin(angle) * 44;
      const py = getTerrainHeight(px, pz);
      const pillarGeo = new THREE.CylinderGeometry(1.6, 2.0, 9 + (i % 3) * 2, 8);
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(px, py + 4.5, pz);
      this.scene.add(pillar);

      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(pillar.position, new THREE.Vector3(3.5, 10, 3.5)),
        type: 'rock',
      });
    }

    // 4f. DEFENSE OBSERVATION & SHOOTING RANGE (Sniper towers & science watchposts)
    const srX = 180;
    const srZ = -320;
    const srY = getTerrainHeight(srX, srZ);
    const steelTowerMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    for (let i = 0; i < 4; i++) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 12, 6), steelTowerMat);
      tower.position.set(srX - 45 + i * 30, srY + 6, srZ);
      this.scene.add(tower);
      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(tower.position, new THREE.Vector3(6, 12, 6)),
        type: 'building',
      });
    }

    // 4g. UNDERGROUND SCIENCE BUNKER (Reinforced blast vault entrance)
    const bkX = 280;
    const bkZ = -80;
    const bkY = getTerrainHeight(bkX, bkZ);
    const bunkerArch = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 18), wallMilitaryMat);
    bunkerArch.position.set(bkX, bkY + 3.5, bkZ);
    this.scene.add(bunkerArch);
    const bunkerBox = new THREE.Box3().setFromCenterAndSize(bunkerArch.position, new THREE.Vector3(14, 7, 18));
    this.colliders.push({
      box: bunkerBox,
      type: 'building',
    });
    this.buildingBounds.push(bunkerBox);

    // 4h. STARTING POINT SCIENCE OUTPOST (South Outpost Gate, x = 0, z = -850)
    const sgX = 0;
    const sgZ = -850;
    const sgY = getTerrainHeight(sgX, sgZ);
    const wallColor = new THREE.MeshLambertMaterial({ color: 0xccb096 });
    this.buildHouse(sgX, sgZ, 4, wallWhiteMat, roofMat, floorMat);
    this.buildHouse(sgX - 42, sgZ, 3, wallBrickMat, roofMat, floorMat);
    this.buildHouse(sgX + 42, sgZ, 3, wallWhiteMat, roofMat, floorMat);
    this.buildStandAloneWall(sgX - 70, sgY, sgZ, 2.5, 5.0, 70, wallColor); // West Compound Wall
    this.buildStandAloneWall(sgX + 70, sgY, sgZ, 2.5, 5.0, 70, wallColor); // East Compound Wall
    this.buildStandAloneWall(sgX, sgY, sgZ - 35, 140, 5.0, 2.5, wallColor); // South Compound Wall
    this.buildStandAloneWall(sgX - 40, sgY, sgZ + 35, 50, 5.0, 2.5, wallColor); // North West Gate Wall
    this.buildStandAloneWall(sgX + 40, sgY, sgZ + 35, 50, 5.0, 2.5, wallColor); // North East Gate Wall

    // 4i. END POINT SCIENCE OUTPOST (North Outpost Gate, x = 0, z = 850)
    const ngX = 0;
    const ngZ = 850;
    const ngY = getTerrainHeight(ngX, ngZ);
    this.buildHouse(ngX, ngZ, 4, wallBrickMat, roofMat, floorMat);
    this.buildHouse(ngX - 42, ngZ, 3, wallWhiteMat, roofMat, floorMat);
    this.buildHouse(ngX + 42, ngZ, 3, wallBrickMat, roofMat, floorMat);
    this.buildStandAloneWall(ngX - 70, ngY, ngZ, 2.5, 5.0, 70, wallColor); // West Compound Wall
    this.buildStandAloneWall(ngX + 70, ngY, ngZ, 2.5, 5.0, 70, wallColor); // East Compound Wall
    this.buildStandAloneWall(ngX, ngY, ngZ + 35, 140, 5.0, 2.5, wallColor); // North Compound Wall
    this.buildStandAloneWall(ngX - 40, ngY, ngZ - 35, 50, 5.0, 2.5, wallColor); // South West Gate Wall
    this.buildStandAloneWall(ngX + 40, ngY, ngZ - 35, 50, 5.0, 2.5, wallColor); // South East Gate Wall
  }

  /**
   * Procedural House with doorway, interior walls, stairs, and upper floor
   */
  /**
   * Big Nusa Science Complex (Pavilion) with double-doorways, glass bands, wide laboratory stairs, and rooftop deck
   */
  private buildHouse(
    x: number,
    z: number,
    floors = 2,
    wallMat: THREE.Material,
    roofMat: THREE.Material,
    floorMat: THREE.Material
  ): void {
    const y = getTerrainHeight(x, z);
    const houseGroup = new THREE.Group();
    houseGroup.position.set(x, y, z);

    // Big Nusa Building Footprint (26m width x 28m depth x 4.4m floor height)
    const width = 26;
    const depth = 28;
    const floorH = 4.4;

    const glassMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    // 1. Foundation / Ground Floor
    const floorGeo = new THREE.BoxGeometry(width, 0.4, depth);
    const groundFloor = new THREE.Mesh(floorGeo, floorMat);
    groundFloor.position.y = 0.2;
    houseGroup.add(groundFloor);

    // 2. Per-floor construction
    for (let f = 0; f < floors; f++) {
      const hBase = f * floorH;

      // Front wall with grand 6m wide central doorway
      this.addWall(houseGroup, -8, hBase + floorH / 2, depth / 2, 10, floorH, 0.4, wallMat, x, y, z);
      this.addWall(houseGroup, 8, hBase + floorH / 2, depth / 2, 10, floorH, 0.4, wallMat, x, y, z);
      this.addWall(houseGroup, 0, hBase + floorH - 0.6, depth / 2, 6.0, 1.2, 0.4, trimMat, x, y, z);

      // Back wall with rear 6m exit doorway for tactical flanking
      this.addWall(houseGroup, -8, hBase + floorH / 2, -depth / 2, 10, floorH, 0.4, wallMat, x, y, z);
      this.addWall(houseGroup, 8, hBase + floorH / 2, -depth / 2, 10, floorH, 0.4, wallMat, x, y, z);
      this.addWall(houseGroup, 0, hBase + floorH - 0.6, -depth / 2, 6.0, 1.2, 0.4, trimMat, x, y, z);

      // Left Wall
      this.addWall(houseGroup, -width / 2, hBase + floorH / 2, 0, 0.4, floorH, depth, wallMat, x, y, z);

      // Right Wall
      this.addWall(houseGroup, width / 2, hBase + floorH / 2, 0, 0.4, floorH, depth, wallMat, x, y, z);

      // Cyan Solar Glass Windows on facade
      const winFront = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 0.2), glassMat);
      winFront.position.set(0, hBase + floorH - 1.2, depth / 2 + 0.1);
      houseGroup.add(winFront);

      // Interior Lab Partition Wall (with wide 6m archway)
      if (f === 0) {
        this.addWall(houseGroup, -7, hBase + floorH / 2, 0, 8, floorH, 0.3, wallMat, x, y, z);
        this.addWall(houseGroup, 7, hBase + floorH / 2, 0, 8, floorH, 0.3, wallMat, x, y, z);
      }

      // Upper Floor Slab (if more floors)
      if (f < floors - 1) {
        const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(width - 6, 0.3, depth), floorMat);
        upperFloor.position.set(3, hBase + floorH + 0.15, 0);
        houseGroup.add(upperFloor);

        this.colliders.push({
          box: new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(x + 3, y + hBase + floorH + 0.15, z),
            new THREE.Vector3(width - 6, 0.3, depth)
          ),
          type: 'building',
        });

        // WIDE SCIENCE STAIRS - 8 Steps for smooth 4.4m climb
        const stepWidth = 4.5;
        const stepDepth = 1.6;
        const stepHeight = floorH / 8;
        for (let s = 0; s < 8; s++) {
          const stepGeo = new THREE.BoxGeometry(stepWidth, 0.4, stepDepth);
          const step = new THREE.Mesh(stepGeo, floorMat);
          const stepZ = -6 + s * stepDepth;
          const stepY = hBase + (s + 1) * stepHeight;
          step.position.set(-width / 2 + 3.0, stepY, stepZ);
          houseGroup.add(step);

          this.colliders.push({
            box: new THREE.Box3().setFromCenterAndSize(
              new THREE.Vector3(x - width / 2 + 3.0, y + stepY, z + stepZ),
              new THREE.Vector3(stepWidth, 0.4, stepDepth)
            ),
            type: 'building',
          });
        }
      }
    }

    // 3. Modern Science Rooftop Observation Deck
    const roofY = floors * floorH;
    const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, depth), floorMat);
    roofDeck.position.y = roofY + 0.2;
    houseGroup.add(roofDeck);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + roofY + 0.2, z),
        new THREE.Vector3(width, 0.4, depth)
      ),
      type: 'building',
    });

    // Rooftop Security Parapet Rails
    const railMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const pFront = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 0.3), railMat);
    pFront.position.set(0, roofY + 0.75, depth / 2);
    houseGroup.add(pFront);
    const pBack = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 0.3), railMat);
    pBack.position.set(0, roofY + 0.75, -depth / 2);
    houseGroup.add(pBack);
    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, depth), railMat);
    pLeft.position.set(-width / 2, roofY + 0.75, 0);
    houseGroup.add(pLeft);
    const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, depth), railMat);
    pRight.position.set(width / 2, roofY + 0.75, 0);
    houseGroup.add(pRight);

    // Central Science Observatory Dome on roof
    const domeMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const obsDome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    obsDome.position.set(0, roofY + 0.4, 0);
    houseGroup.add(obsDome);

    // Science Antenna / Satellite Dish
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.5, 6), trimMat);
    antenna.position.set(6, roofY + 2.4, -6);
    houseGroup.add(antenna);

    this.scene.add(houseGroup);

    // Register house 3D building bounds for shelter and bullet blocking
    const totalH = (floors * floorH) + 4.5;
    this.buildingBounds.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + totalH / 2, z),
        new THREE.Vector3(width, totalH, depth)
      )
    );

    // Register indoor loot spawn points
    this.houseSpawnPoints.push(new THREE.Vector3(x + 5, y + 0.5, z + 5));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 5, y + 0.5, z + 5));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 5, y + 0.5, z - 5));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 5, y + 0.5, z - 5));
    if (floors > 1) {
      this.houseSpawnPoints.push(new THREE.Vector3(x + 5, y + floorH + 0.5, z + 5));
      this.houseSpawnPoints.push(new THREE.Vector3(x - 5, y + floorH + 0.5, z - 5));
      this.houseSpawnPoints.push(new THREE.Vector3(x, y + roofY + 0.6, z + 6));
    }
  }

  /**
   * Iconic Monumental Nusa Science Center
   * Sprawling 64m x 54m mega-complex with central glass atrium, 
   * twin research wings, elevated skybridge, grand pillars, and rooftop helipad!
   */
  public buildScienceCenter(x: number, z: number): void {
    const y = getTerrainHeight(x, z);
    const centerGroup = new THREE.Group();
    centerGroup.position.set(x, y, z);

    // High-tech Nusa materials
    const whitePanelMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const darkFrameMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const floorLabMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const helipadYellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    // 1. Central Grand Atrium (28m x 28m x 14m tall)
    const atriumW = 28;
    const atriumD = 28;
    const atriumH = 14;

    // Grand Foundation
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(64, 0.6, 54), floorLabMat);
    foundation.position.y = 0.3;
    centerGroup.add(foundation);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + 0.3, z),
        new THREE.Vector3(64, 0.6, 54)
      ),
      type: 'building',
    });

    // 4 Grand Colonnade Pillars at front entrance
    const pillarGeo = new THREE.CylinderGeometry(1.4, 1.4, atriumH, 12);
    for (let p = 0; p < 4; p++) {
      const px = -9 + p * 6;
      const pz = atriumD / 2;
      const pillar = new THREE.Mesh(pillarGeo, whitePanelMat);
      pillar.position.set(px, atriumH / 2, pz);
      centerGroup.add(pillar);

      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(x + px, y + atriumH / 2, z + pz),
          new THREE.Vector3(2.8, atriumH, 2.8)
        ),
        type: 'wall',
      });
    }

    // Atrium Rear Wall
    this.addWall(centerGroup, 0, atriumH / 2, -atriumD / 2, atriumW, atriumH, 0.5, whitePanelMat, x, y, z);

    // Giant Futuristic Glass Geodesic Dome atop Central Atrium (13m diameter, glowing cyan)
    const domeGeo = new THREE.SphereGeometry(13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const glassDome = new THREE.Mesh(domeGeo, glassCyanMat);
    glassDome.position.set(0, atriumH, 0);
    centerGroup.add(glassDome);

    // 2. West Research Wing (18m x 42m x 12m, 3 floors)
    const wingW = 18;
    const wingD = 42;
    const wingH = 12;
    const westX = -atriumW / 2 - wingW / 2;

    const westWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, wingD), whitePanelMat);
    westWing.position.set(westX, wingH / 2, 0);
    centerGroup.add(westWing);

    // Large glass bands on West Wing
    const westGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, wingD - 6), glassCyanMat);
    westGlass.position.set(westX - wingW / 2 - 0.1, wingH * 0.6, 0);
    centerGroup.add(westGlass);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x + westX, y + wingH / 2, z),
        new THREE.Vector3(wingW, wingH, wingD)
      ),
      type: 'building',
    });

    // 3. East Technology Wing (18m x 42m x 12m, 3 floors)
    const eastX = atriumW / 2 + wingW / 2;

    const eastWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, wingD), whitePanelMat);
    eastWing.position.set(eastX, wingH / 2, 0);
    centerGroup.add(eastWing);

    const eastGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, wingD - 6), glassCyanMat);
    eastGlass.position.set(eastX + wingW / 2 + 0.1, wingH * 0.6, 0);
    centerGroup.add(eastGlass);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x + eastX, y + wingH / 2, z),
        new THREE.Vector3(wingW, wingH, wingD)
      ),
      type: 'building',
    });

    // 4. Elevated Skybridge connecting wings across the atrium
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(atriumW, 1.2, 7.0), darkFrameMat);
    bridge.position.set(0, 7.0, 0);
    centerGroup.add(bridge);

    const bridgeRails = new THREE.Mesh(new THREE.BoxGeometry(atriumW, 1.2, 0.3), glassCyanMat);
    bridgeRails.position.set(0, 8.2, 3.4);
    centerGroup.add(bridgeRails);
    const bridgeRailsBack = new THREE.Mesh(new THREE.BoxGeometry(atriumW, 1.2, 0.3), glassCyanMat);
    bridgeRailsBack.position.set(0, 8.2, -3.4);
    centerGroup.add(bridgeRailsBack);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + 7.0, z),
        new THREE.Vector3(atriumW, 1.2, 7.0)
      ),
      type: 'building',
    });

    // 5. Rooftop Helipad on East Wing
    const heliPad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), accentMat);
    heliPad.position.set(eastX, wingH + 0.1, 0);
    centerGroup.add(heliPad);

    const heliRing = new THREE.Mesh(new THREE.RingGeometry(4.5, 5.2, 24), helipadYellow);
    heliRing.rotateX(-Math.PI / 2);
    heliRing.position.set(eastX, wingH + 0.22, 0);
    centerGroup.add(heliRing);

    // 6. Science Satellite Communications Array on West Wing
    const dishMast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 6, 8), darkFrameMat);
    dishMast.position.set(westX, wingH + 3, 0);
    centerGroup.add(dishMast);

    const dish = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), whitePanelMat);
    dish.rotation.x = -Math.PI / 3;
    dish.position.set(westX, wingH + 6.5, 0);
    centerGroup.add(dish);

    this.scene.add(centerGroup);

    // Register full 3D building bounds for shelter and tactical cover
    const centerBounds = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + 10, z),
      new THREE.Vector3(68, 20, 56)
    );
    this.colliders.push({
      box: centerBounds,
      type: 'building',
    });
    this.buildingBounds.push(centerBounds);

    // Register extensive indoor loot spawn points
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 1.0, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 5, y + 1.0, z + 6));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 5, y + 1.0, z + 6));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 8, y + 1.0, z - 6));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 8, y + 1.0, z - 6));
    this.houseSpawnPoints.push(new THREE.Vector3(x + eastX, y + 1.0, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x + westX, y + 1.0, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 7.8, z)); // On Skybridge!
    this.houseSpawnPoints.push(new THREE.Vector3(x + eastX, y + wingH + 0.6, z)); // On Helipad!
    this.houseSpawnPoints.push(new THREE.Vector3(x + westX, y + wingH + 0.6, z)); // On Observation Deck!
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
   * Nusa Science Laboratory Hangar (Grand arched multi-bay research facility)
   */
  private buildBarracks(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const length = 46;
    const width = 22;
    const height = 8.0;

    const hangar = new THREE.Group();
    hangar.position.set(x, y, z);

    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const darkFrameMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x334155 });

    // 1. Reinforced Concrete Hangar Foundation
    const floorGeo = new THREE.BoxGeometry(width + 4, 0.4, length + 4);
    const foundation = new THREE.Mesh(floorGeo, floorMat);
    foundation.position.y = 0.2;
    hangar.add(foundation);

    // 2. Main High-Vaulted Vault Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), wallMat);
    body.position.y = height / 2;
    hangar.add(body);

    // 3. Curved Science Vault Roof with central skylight
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.52, width * 0.52, length, 12, 1, false, 0, Math.PI),
      roofMat
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.y = height;
    hangar.add(roof);

    // Cyan Glass Skylight strip along spine of roof
    const skylight = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.4, length - 4), glassCyanMat);
    skylight.position.set(0, height + width * 0.52, 0);
    hangar.add(skylight);

    // 4. Grand 7m Wide Double Blast Doors on Front and Back
    const doorFront = new THREE.Mesh(new THREE.BoxGeometry(7.0, 5.5, 0.6), darkFrameMat);
    doorFront.position.set(0, 2.75, length / 2 + 0.1);
    hangar.add(doorFront);

    const doorBack = new THREE.Mesh(new THREE.BoxGeometry(7.0, 5.5, 0.6), darkFrameMat);
    doorBack.position.set(0, 2.75, -length / 2 - 0.1);
    hangar.add(doorBack);

    // 5. Left and Right Science Lab Annex Wings (10m x 4.5m x 18m)
    const annexL = new THREE.Mesh(new THREE.BoxGeometry(7.0, 4.5, 20), wallMat);
    annexL.position.set(-width / 2 - 3.5, 2.25, 0);
    hangar.add(annexL);

    const annexR = new THREE.Mesh(new THREE.BoxGeometry(7.0, 4.5, 20), wallMat);
    annexR.position.set(width / 2 + 3.5, 2.25, 0);
    hangar.add(annexR);

    // Annex Glass Windows
    const winL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 14), glassCyanMat);
    winL.position.set(-width / 2 - 7.1, 2.4, 0);
    hangar.add(winL);

    const winR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 14), glassCyanMat);
    winR.position.set(width / 2 + 7.1, 2.4, 0);
    hangar.add(winR);

    this.scene.add(hangar);

    // Colliders for main hangar and side wings
    const hangarBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + height / 2, z),
      new THREE.Vector3(width + 14, height + 4, length + 2)
    );
    this.colliders.push({
      box: hangarBox,
      type: 'building',
    });
    this.buildingBounds.push(hangarBox);

    // Register indoor loot spawn points for Science Hangar
    this.houseSpawnPoints.push(new THREE.Vector3(x - 5, y + 0.5, z - 12));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 5, y + 0.5, z - 12));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 5, y + 0.5, z + 12));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 5, y + 0.5, z + 12));
    this.houseSpawnPoints.push(new THREE.Vector3(x - width / 2 - 3, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x + width / 2 + 3, y + 0.5, z));
  }

  /**
   * Shipping Container (Massive Science Logistics Crate)
   */
  private buildShippingContainer(x: number, z: number, mat: THREE.Material, yOffset = 0): void {
    const y = getTerrainHeight(x, z) + yOffset;
    const length = 14;
    const width = 5.2;
    const height = 3.8;

    const containerGroup = new THREE.Group();
    containerGroup.position.set(x, y + height / 2, z);

    const container = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mat);
    containerGroup.add(container);

    // Corner reinforcement columns
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const cornerGeo = new THREE.BoxGeometry(0.5, height + 0.1, 0.5);
    for (const cx of [-width / 2, width / 2]) {
      for (const cz of [-length / 2, length / 2]) {
        const corner = new THREE.Mesh(cornerGeo, frameMat);
        corner.position.set(cx, 0, cz);
        containerGroup.add(corner);
      }
    }

    this.scene.add(containerGroup);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y + height / 2, z), new THREE.Vector3(width, height, length)),
      type: 'crate',
    });
  }

  /**
   * Grand Planetary Observatory & Assembly (Monumental Science Cathedral)
   */
  private buildChurch(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const church = new THREE.Group();
    church.position.set(x, y, z);

    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

    // Grand Nave (32m width x 14m height x 48m length)
    const nave = new THREE.Mesh(new THREE.BoxGeometry(32, 14, 48), wallMat);
    nave.position.y = 7;
    church.add(nave);

    // Cyan Glass ribbon down nave roof
    const naveGlass = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 42), glassCyanMat);
    naveGlass.position.set(0, 14.2, 0);
    church.add(naveGlass);

    // Monumental Celestial Dome atop nave
    const domeGeo = new THREE.SphereGeometry(11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, glassCyanMat);
    dome.position.set(0, 14, -8);
    church.add(dome);

    // High-Tech Science Transmission Spire (38m height)
    const spireMast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.8, 24, 8), trimMat);
    spireMast.position.set(0, 26, 18);
    church.add(spireMast);

    const spireTip = new THREE.Mesh(new THREE.ConeGeometry(1.2, 12, 8), roofMat);
    spireTip.position.set(0, 44, 18);
    church.add(spireTip);

    this.scene.add(church);

    const churchBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + 10, z),
      new THREE.Vector3(34, 20, 52)
    );
    this.colliders.push({
      box: churchBox,
      type: 'building',
    });
    this.buildingBounds.push(churchBox);

    // Register indoor loot spawn points
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z - 12));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z + 12));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 8, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 8, y + 0.5, z));
  }

  /**
   * Colossal Nusa Robotics Testing Stadium (Monumental Arena)
   * 54m width x 64m length x 14m height with 4 corner towers, elevated catwalks, and grandstands
   */
  private buildPecadoArena(x: number, z: number, wallMat: THREE.Material, seatMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const arena = new THREE.Group();
    arena.position.set(x, y, z);

    const arenaW = 54;
    const arenaL = 64;
    const arenaH = 14;
    const wallThick = 2.5;

    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

    // West Blast Wall
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, arenaH, arenaL), wallMat);
    wWall.position.set(-arenaW / 2, arenaH / 2, 0);
    arena.add(wWall);

    // East Blast Wall
    const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, arenaH, arenaL), wallMat);
    eWall.position.set(arenaW / 2, arenaH / 2, 0);
    arena.add(eWall);

    // North Wall with 10m wide grand entry archway
    const nWallL = new THREE.Mesh(new THREE.BoxGeometry((arenaW - 12) / 2, arenaH, wallThick), wallMat);
    nWallL.position.set(-(arenaW + 12) / 4, arenaH / 2, -arenaL / 2);
    arena.add(nWallL);
    const nWallR = new THREE.Mesh(new THREE.BoxGeometry((arenaW - 12) / 2, arenaH, wallThick), wallMat);
    nWallR.position.set((arenaW + 12) / 4, arenaH / 2, -arenaL / 2);
    arena.add(nWallR);
    const nArch = new THREE.Mesh(new THREE.BoxGeometry(12, 3.5, wallThick), frameMat);
    nArch.position.set(0, arenaH - 1.75, -arenaL / 2);
    arena.add(nArch);

    // South Wall with 10m wide grand entry archway
    const sWallL = new THREE.Mesh(new THREE.BoxGeometry((arenaW - 12) / 2, arenaH, wallThick), wallMat);
    sWallL.position.set(-(arenaW + 12) / 4, arenaH / 2, arenaL / 2);
    arena.add(sWallL);
    const sWallR = new THREE.Mesh(new THREE.BoxGeometry((arenaW - 12) / 2, arenaH, wallThick), wallMat);
    sWallR.position.set((arenaW + 12) / 4, arenaH / 2, arenaL / 2);
    arena.add(sWallR);
    const sArch = new THREE.Mesh(new THREE.BoxGeometry(12, 3.5, wallThick), frameMat);
    sArch.position.set(0, arenaH - 1.75, arenaL / 2);
    arena.add(sArch);

    // 4 Grand Corner Observation Towers (8m x 8m x 16m)
    const towerGeo = new THREE.BoxGeometry(8, 16, 8);
    for (const cx of [-arenaW / 2, arenaW / 2]) {
      for (const cz of [-arenaL / 2, arenaL / 2]) {
        const tower = new THREE.Mesh(towerGeo, frameMat);
        tower.position.set(cx, 8, cz);
        arena.add(tower);

        const towerGlass = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.5, 8.2), glassCyanMat);
        towerGlass.position.set(cx, 13, cz);
        arena.add(towerGlass);

        this.colliders.push({
          box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x + cx, y + 8, z + cz), new THREE.Vector3(8, 16, 8)),
          type: 'wall',
        });
      }
    }

    // Central Elevated Robotics Combat Stage (16m x 16m x 1.6m)
    const ring = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 16), seatMat);
    ring.position.set(0, 0.8, 0);
    arena.add(ring);

    // Tiered Bleachers / Spectator Seating on West and East
    const seatW = new THREE.Mesh(new THREE.BoxGeometry(10, 5.0, arenaL - 20), seatMat);
    seatW.position.set(-arenaW / 2 + 7, 2.5, 0);
    arena.add(seatW);

    const seatE = new THREE.Mesh(new THREE.BoxGeometry(10, 5.0, arenaL - 20), seatMat);
    seatE.position.set(arenaW / 2 - 7, 2.5, 0);
    arena.add(seatE);

    // Elevated Overhead Catwalk Skybridge across Stadium at Y = 8.5
    const skybridge = new THREE.Mesh(new THREE.BoxGeometry(arenaW - 4, 1.0, 6.0), frameMat);
    skybridge.position.set(0, 8.5, 0);
    arena.add(skybridge);

    const skybridgeRails = new THREE.Mesh(new THREE.BoxGeometry(arenaW - 4, 1.2, 0.3), glassCyanMat);
    skybridgeRails.position.set(0, 9.6, 3.0);
    arena.add(skybridgeRails);
    const skybridgeRailsBack = new THREE.Mesh(new THREE.BoxGeometry(arenaW - 4, 1.2, 0.3), glassCyanMat);
    skybridgeRailsBack.position.set(0, 9.6, -3.0);
    arena.add(skybridgeRailsBack);

    this.scene.add(arena);

    const arenaBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + arenaH / 2, z),
      new THREE.Vector3(arenaW + 4, arenaH + 4, arenaL + 4)
    );
    this.colliders.push({
      box: arenaBox,
      type: 'building',
    });
    this.buildingBounds.push(arenaBox);

    // Loot spawn points across arena floor, bleachers, and elevated catwalk
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 1.8, z)); // Center stage
    this.houseSpawnPoints.push(new THREE.Vector3(x - 14, y + 5.5, z)); // West bleacher
    this.houseSpawnPoints.push(new THREE.Vector3(x + 14, y + 5.5, z)); // East bleacher
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 9.2, z)); // On Catwalk Skybridge!
    this.houseSpawnPoints.push(new THREE.Vector3(x - 8, y + 0.5, z - 16));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 8, y + 0.5, z - 16));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 8, y + 0.5, z + 16));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 8, y + 0.5, z + 16));
  }

  /**
   * Grand Nusa Cybernetics Research Tower
   * 34m width x 34m depth x 26m height (4 full stories with glass wrap and rooftop deck)
   */
  private buildPecadoCasino(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const casino = new THREE.Group();
    casino.position.set(x, y, z);

    const width = 34;
    const depth = 34;
    const height = 26;

    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const darkFrameMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    // Main 4-Story Tower Structure
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), whiteMat);
    base.position.y = height / 2;
    casino.add(base);

    // Cyan Glass Curtain Bands on all 4 floors
    for (let f = 1; f <= 4; f++) {
      const bandY = f * 6.0 - 2.0;
      const glassBandFront = new THREE.Mesh(new THREE.BoxGeometry(width - 4, 2.2, 0.4), glassCyanMat);
      glassBandFront.position.set(0, bandY, depth / 2 + 0.1);
      casino.add(glassBandFront);

      const glassBandBack = new THREE.Mesh(new THREE.BoxGeometry(width - 4, 2.2, 0.4), glassCyanMat);
      glassBandBack.position.set(0, bandY, -depth / 2 - 0.1);
      casino.add(glassBandBack);

      const glassBandLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, depth - 4), glassCyanMat);
      glassBandLeft.position.set(-width / 2 - 0.1, bandY, 0);
      casino.add(glassBandLeft);

      const glassBandRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, depth - 4), glassCyanMat);
      glassBandRight.position.set(width / 2 + 0.1, bandY, 0);
      casino.add(glassBandRight);
    }

    // Grand Entrance Colonnade (6m tall pillars)
    const pillarGeo = new THREE.CylinderGeometry(1.2, 1.2, 6.0, 8);
    for (let p = -2; p <= 2; p++) {
      const col = new THREE.Mesh(pillarGeo, darkFrameMat);
      col.position.set(p * 6, 3.0, depth / 2 + 2.5);
      casino.add(col);
    }

    // Portico Roof above entrance
    const portico = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 6.0), darkFrameMat);
    portico.position.set(0, 6.0, depth / 2 + 2.5);
    casino.add(portico);

    // Rooftop Communications & Solar Array
    const roofDishMast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 8, 8), darkFrameMat);
    roofDishMast.position.set(8, height + 4, 8);
    casino.add(roofDishMast);

    const roofDish = new THREE.Mesh(new THREE.SphereGeometry(4.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), glassCyanMat);
    roofDish.rotation.x = -Math.PI / 4;
    roofDish.position.set(8, height + 8, 8);
    casino.add(roofDish);

    // Rooftop Safety Parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, depth), darkFrameMat);
    parapet.position.y = height + 0.6;
    casino.add(parapet);

    this.scene.add(casino);

    const casinoBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + height / 2, z),
      new THREE.Vector3(width + 6, height + 6, depth + 6)
    );
    this.colliders.push({
      box: casinoBox,
      type: 'building',
    });
    this.buildingBounds.push(casinoBox);

    // Register indoor loot spawn points for Cybernetics Tower
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 8, y + 0.5, z - 8));
    this.houseSpawnPoints.push(new THREE.Vector3(x + 8, y + 0.5, z + 8));
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 6.5, z)); // Floor 2
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 12.5, z)); // Floor 3
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 18.5, z)); // Floor 4
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + height + 0.8, z)); // Rooftop deck!
  }

  /**
   * Grand Nusa Bio-Tech Headquarters (Massive Resort Science Complex)
   * Sprawling 58m x 58m x 13m complex with 3-story glass labs, courtyard atrium, colonnade
   */
  private buildHaciendaVilla(x: number, z: number, wallMat: THREE.Material, roofMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const villa = new THREE.Group();
    villa.position.set(x, y, z);

    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const darkFrameMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    const wingW = 14;
    const wingH = 13.0;
    const courtyardSize = 30;
    const totalSize = courtyardSize + wingW * 2; // 58m!

    // West 3-Story Laboratory Wing
    const wWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, totalSize), whiteMat);
    wWing.position.set(-courtyardSize / 2 - wingW / 2, wingH / 2, 0);
    villa.add(wWing);

    // West Wing Glass Ribbon
    const wGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.0, totalSize - 8), glassCyanMat);
    wGlass.position.set(-courtyardSize / 2 - wingW - 0.1, wingH * 0.6, 0);
    villa.add(wGlass);

    // East 3-Story Laboratory Wing
    const eWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, totalSize), whiteMat);
    eWing.position.set(courtyardSize / 2 + wingW / 2, wingH / 2, 0);
    villa.add(eWing);

    // East Wing Glass Ribbon
    const eGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.0, totalSize - 8), glassCyanMat);
    eGlass.position.set(courtyardSize / 2 + wingW + 0.1, wingH * 0.6, 0);
    villa.add(eGlass);

    // North Connecting Atrium Wing
    const nWing = new THREE.Mesh(new THREE.BoxGeometry(courtyardSize, wingH, wingW), whiteMat);
    nWing.position.set(0, wingH / 2, -courtyardSize / 2 - wingW / 2);
    villa.add(nWing);

    // South Entrance Portico Wing (Lower 8m profile with grand entrance colonnade)
    const sWing = new THREE.Mesh(new THREE.BoxGeometry(courtyardSize, 8.0, wingW), darkFrameMat);
    sWing.position.set(0, 4.0, courtyardSize / 2 + wingW / 2);
    villa.add(sWing);

    // Entrance Colonnade Pillars
    const colGeo = new THREE.CylinderGeometry(1.2, 1.2, 8.0, 8);
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(colGeo, whiteMat);
      col.position.set(i * 6, 4.0, courtyardSize / 2 + wingW + 2.0);
      villa.add(col);
    }

    // Central Courtyard Glass Skylight Atrium Dome
    const domeGeo = new THREE.SphereGeometry(9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const courtyardDome = new THREE.Mesh(domeGeo, glassCyanMat);
    courtyardDome.position.set(0, 6.0, 0);
    villa.add(courtyardDome);

    // Bio-Tech Centerpiece Monument inside courtyard
    const monument = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.8, 3.5, 8), darkFrameMat);
    monument.position.set(0, 1.75, 0);
    villa.add(monument);

    this.scene.add(villa);

    const villaBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + wingH / 2, z),
      new THREE.Vector3(totalSize + 4, wingH + 4, totalSize + 4)
    );
    this.colliders.push({
      box: villaBox,
      type: 'building',
    });
    this.buildingBounds.push(villaBox);

    // Indoor loot spawn points
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z)); // Courtyard center
    this.houseSpawnPoints.push(new THREE.Vector3(x - courtyardSize / 2 - wingW / 2, y + 0.5, z)); // West lab
    this.houseSpawnPoints.push(new THREE.Vector3(x + courtyardSize / 2 + wingW / 2, y + 0.5, z)); // East lab
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 0.5, z - courtyardSize / 2 - wingW / 2)); // North wing
    this.houseSpawnPoints.push(new THREE.Vector3(x - courtyardSize / 2 - wingW / 2, y + 5.5, z)); // West lab 2F
    this.houseSpawnPoints.push(new THREE.Vector3(x + courtyardSize / 2 + wingW / 2, y + 5.5, z)); // East lab 2F
    this.houseSpawnPoints.push(new THREE.Vector3(x - courtyardSize / 2 - wingW / 2, y + wingH + 0.5, z)); // Rooftop West
    this.houseSpawnPoints.push(new THREE.Vector3(x + courtyardSize / 2 + wingW / 2, y + wingH + 0.5, z)); // Rooftop East
  }

  /**
   * Nusa Mega-Structure Skyscraper Skeletons (Unfinished 5-Story Science Facility)
   * 32m width x 38m length x 22m height with 5 floor slabs, heavy industrial columns, catwalks
   */
  private buildLosLeonesSkeleton(x: number, z: number, brickMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const skeleton = new THREE.Group();
    skeleton.position.set(x, y, z);

    const width = 32;
    const length = 38;
    const floorH = 4.4;
    const floors = 5;
    const totalH = floorH * floors; // 22m!

    const darkSteelMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const floorSlabMat = new THREE.MeshLambertMaterial({ color: 0x475569 });

    // 5 Reinforced Concrete Floor Slabs
    for (let floor = 0; floor < floors; floor++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, length), floorSlabMat);
      slab.position.y = floor * floorH;
      skeleton.add(slab);

      // Floor colliders
      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(x, y + floor * floorH, z),
          new THREE.Vector3(width, 0.4, length)
        ),
        type: 'building',
      });

      // Parapet security rails around edges of each floor
      const railGeo = new THREE.BoxGeometry(width, 1.1, 0.3);
      const railF = new THREE.Mesh(railGeo, darkSteelMat);
      railF.position.set(0, floor * floorH + 0.55, length / 2);
      skeleton.add(railF);

      const railB = new THREE.Mesh(railGeo, darkSteelMat);
      railB.position.set(0, floor * floorH + 0.55, -length / 2);
      skeleton.add(railB);
    }

    // 6 Heavy Reinforced Structural Columns (1.8m x 1.8m x 22m)
    const colGeo = new THREE.BoxGeometry(1.8, totalH, 1.8);
    const colPositions = [
      { cx: -width / 2 + 1.2, cz: -length / 2 + 1.2 },
      { cx: width / 2 - 1.2, cz: -length / 2 + 1.2 },
      { cx: -width / 2 + 1.2, cz: 0 },
      { cx: width / 2 - 1.2, cz: 0 },
      { cx: -width / 2 + 1.2, cz: length / 2 - 1.2 },
      { cx: width / 2 - 1.2, cz: length / 2 - 1.2 },
    ];

    for (const cp of colPositions) {
      const col = new THREE.Mesh(colGeo, darkSteelMat);
      col.position.set(cp.cx, totalH / 2, cp.cz);
      skeleton.add(col);

      this.colliders.push({
        box: new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(x + cp.cx, y + totalH / 2, z + cp.cz),
          new THREE.Vector3(1.8, totalH, 1.8)
        ),
        type: 'wall',
      });
    }

    // Diagonal Cross-Bracing Steel Girders on facades
    const braceGeo = new THREE.BoxGeometry(0.4, 0.4, Math.hypot(width, floorH * 2));
    const brace1 = new THREE.Mesh(braceGeo, darkSteelMat);
    brace1.position.set(0, floorH, length / 2);
    brace1.rotation.z = Math.atan2(floorH * 2, width);
    skeleton.add(brace1);

    this.scene.add(skeleton);

    const skeletonBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y + totalH / 2, z),
      new THREE.Vector3(width + 2, totalH + 2, length + 2)
    );
    this.colliders.push({
      box: skeletonBox,
      type: 'building',
    });
    this.buildingBounds.push(skeletonBox);

    // Multi-tier loot spawns on floors 1, 2, 3, 4, 5
    for (let f = 0; f < floors; f++) {
      this.houseSpawnPoints.push(new THREE.Vector3(x - 6, y + f * floorH + 0.5, z - 6));
      this.houseSpawnPoints.push(new THREE.Vector3(x + 6, y + f * floorH + 0.5, z + 6));
    }
  }

  /**
   * Monumental Science Radar Tower for Military Base (42m tall)
   */
  private buildRadarTower(x: number, z: number): void {
    const y = getTerrainHeight(x, z);
    const tower = new THREE.Group();
    tower.position.set(x, y, z);

    const metalMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const domeMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff });

    // Sturdy Hexagonal Mast Tower (36m)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 5.5, 36, 6), metalMat);
    mast.position.y = 18;
    tower.add(mast);

    // Mid-level observation ring at 22m
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 1.2, 12), metalMat);
    ring.position.y = 22;
    tower.add(ring);

    // Giant 10m Geodesic Radome atop the tower
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), domeMat);
    dome.position.y = 41;
    tower.add(dome);

    // Rotating Radar Dish Ring
    const dishRing = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.4, 8, 24), cyanMat);
    dishRing.rotation.x = Math.PI / 2;
    dishRing.position.y = 41;
    tower.add(dishRing);

    this.scene.add(tower);

    this.colliders.push({
      box: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y + 22, z),
        new THREE.Vector3(12, 44, 12)
      ),
      type: 'building',
    });
  }

  /**
   * Nusa Advanced Science Academy (School Complex)
   * 68m width x 40m depth x 14m height with lecture halls, auditorium, science laboratories
   */
  private buildSchoolComplex(x: number, z: number, wallMat: THREE.Material, floorMat: THREE.Material): void {
    const y = getTerrainHeight(x, z);
    const school = new THREE.Group();
    school.position.set(x, y, z);

    const glassCyanMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const darkFrameMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    // Main 3-Story Classroom & Laboratory Block (48m x 12m x 32m)
    const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(48, 12, 32), whiteMat);
    mainBlock.position.y = 6;
    school.add(mainBlock);

    // Cyan Glass ribbons across the academy facade
    for (let f = 1; f <= 3; f++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(42, 1.8, 0.4), glassCyanMat);
      g.position.set(0, f * 3.8 - 0.5, 16.1);
      school.add(g);
    }

    // Auditorium / Robotics Testing Wing (28m x 14m x 28m)
    const gym = new THREE.Mesh(new THREE.BoxGeometry(28, 14, 28), darkFrameMat);
    gym.position.set(-38, 7, 0);
    school.add(gym);

    // Grand Entrance Colonnade
    const colGeo = new THREE.CylinderGeometry(1.2, 1.2, 6, 8);
    for (let c = -2; c <= 2; c++) {
      const col = new THREE.Mesh(colGeo, darkFrameMat);
      col.position.set(c * 6, 3, 18.5);
      school.add(col);
    }

    this.scene.add(school);

    const schoolBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x - 14, y + 6.5, z),
      new THREE.Vector3(76, 15, 36)
    );
    this.colliders.push({
      box: schoolBox,
      type: 'building',
    });
    this.buildingBounds.push(schoolBox);

    // Register indoor loot spawn points for Academy
    this.houseSpawnPoints.push(new THREE.Vector3(x + 12, y + 0.5, z + 6));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 12, y + 0.5, z - 6));
    this.houseSpawnPoints.push(new THREE.Vector3(x - 38, y + 0.5, z)); // Inside Robotics Wing
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 4.5, z)); // Floor 2
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 8.5, z)); // Floor 3
    this.houseSpawnPoints.push(new THREE.Vector3(x, y + 12.5, z)); // Roof deck
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
