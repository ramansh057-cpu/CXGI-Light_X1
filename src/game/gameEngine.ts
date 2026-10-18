/**
 * Pure FPP BGMI Game Engine
 * 1000m x 1000m island battlefield optimized for older laptops.
 * Pure First-Person Perspective (FPP), intuitive standard mouse look,
 * enemies dropping from the airplane along the flight path, and casual-friendly difficulty.
 */

import * as THREE from 'three';
import { getTerrainHeight, MAP_SIZE, WATER_HEIGHT } from './terrain';
import {
  WeaponId,
  WEAPON_DEFS,
  InventoryState,
  ConsumableType,
  CONSUMABLE_DEFS,
  SafeZoneState,
  GraphicSettings,
  DEFAULT_GRAPHIC_SETTINGS,
  KillFeedItem,
  SoundIndicator,
  SquadMember,
} from './types';
import { WorldBuilder, LootItem, VehicleInstance } from './worldBuilder';
import { BotManager } from './botAI';
import { SquadManager } from './squadManager';
import { VehicleController } from './vehiclePhysics';
import { sound } from './audio';
import { resolveHorizontalCollisions, resolveWorldHeight, checkLineOfSight } from './physicsUtils';

export type GamePhase = 'in_plane' | 'freefall' | 'parachuting' | 'ground' | 'driving' | 'game_over' | 'victory';

export interface GameEngineCallbacks {
  onHealthChange: (health: number, boost: number) => void;
  onInventoryChange: (inv: InventoryState) => void;
  onSafeZoneChange: (zone: SafeZoneState) => void;
  onKillFeed: (item: KillFeedItem) => void;
  onAliveCountChange: (alive: number, kills: number) => void;
  onHitmarker: (isHeadshot: boolean, isKill: boolean) => void;
  onSoundIndicator: (indicator: SoundIndicator) => void;
  onSquadChange: (squad: SquadMember[]) => void;
  onGameEnd: (isVictory: boolean, stats: { kills: number; damage: number; rank: number; survivalTime: number }) => void;
  onPromptChange: (prompt: string | null) => void;
}

export class GameEngine {
  private container: HTMLElement;
  private callbacks: GameEngineCallbacks;

  // Three.js Core
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private animFrameId: number | null = null;

  // World & Systems
  public worldBuilder: WorldBuilder;
  public botManager: BotManager;
  public squadManager: SquadManager;
  public vehicleController: VehicleController;

  // Lighting
  private dirLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

  // Performance & Settings
  public settings: GraphicSettings = { ...DEFAULT_GRAPHIC_SETTINGS };

  // Game Lifecycle & State
  public gamePhase: GamePhase = 'in_plane';
  private matchTime = 0;
  private playerKills = 0;
  private playerDamageDealt = 0;

  // Safe Zone
  public safeZone: SafeZoneState = {
    centerX: 0,
    centerZ: 0,
    currentRadius: 420,
    targetCenterX: 0,
    targetCenterZ: 0,
    targetRadius: 420,
    blueRadius: 490,
    phase: 1,
    totalPhases: 5,
    timeRemaining: 150,
    phaseDuration: 150,
    isShrinking: false,
    damagePerSec: 1.2,
  };
  private blueZoneMesh!: THREE.Mesh;
  private safeZoneRingMesh!: THREE.Mesh;

  // Player State (Pure FPP - 100 HP, 4-5 hit durability)
  public playerHealth = 100;
  public playerMaxHealth = 100;
  public respawnChances = 2; // Auto-recall chances left (Starts with 2)
  public isPlayerKnocked = false;
  public playerKnockedHealth = 100;
  public playerBoost = 0;
  public playerPos = new THREE.Vector3(0, 190, -340);
  public playerVel = new THREE.Vector3(0, 0, 0);
  public cameraPitch = 0;
  public cameraYaw = 0;
  public isScoping = false;
  public isCrouched = false;
  public isProne = false;
  public isSprinting = false;
  public isReloading = false;
  public reloadTimer = 0;
  public healingTimer = 0;
  public activeHealingItem: ConsumableType | null = null;
  public shootCooldown = 0;

  // FPP Weapon Viewmodel
  private fppWeaponGroup!: THREE.Group;
  private fppGunMesh!: THREE.Mesh;
  private fppRecoilOffset = 0;
  private fppBobTimer = 0;


  public inventory: InventoryState = {
    ammo: {
      '5.56mm': 999,
      '7.62mm': 999,
      '300mag': 0,
      '12gauge': 0,
    },
    consumables: {
      first_aid: 3,
      medkit: 2,
      energy_drink: 4,
      painkiller: 2,
      bandage: 10,
    },
    helmetLevel: 2,
    armorLevel: 2,
    backpackLevel: 2,
    weapon1: 'm416',
    weapon1Ammo: 30,
    weapon2: null,
    weapon2Ammo: 0,
    melee: 'pan',
    activeSlot: 1,
  };

  // Input states
  public keys: Record<string, boolean> = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    Space: false,
    ShiftLeft: false,
    KeyC: false,
    KeyZ: false,
    KeyR: false,
    KeyF: false,
    Digit1: false,
    Digit2: false,
    Digit3: false,
    KeyH: false,
  };
  public isMouseDown = false;
  public isRightMouseDown = false;
  public isPointerLocked = false;

  // Airplane & Parachute
  private planeMesh!: THREE.Group;
  private nextAirdropTimer = 75;

  constructor(container: HTMLElement, callbacks: GameEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x64b0e8); // bright sunny blue sky
    this.scene.fog = new THREE.FogExp2(0x82c4ee, 0.00095); // crisp horizon fog

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.05, 1200);
    this.clock = new THREE.Clock();

    // 2. Renderer optimized for older laptops
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      precision: 'mediump',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // 3. Lighting
    this.setupLighting();

    // 4. World, Bot & Squad Subsystems
    this.worldBuilder = new WorldBuilder(this.scene);
    this.botManager = new BotManager(
      this.scene,
      this.worldBuilder,
      (item) => this.callbacks.onKillFeed(item),
      (pos, type) => this.handleSoundIndicator(pos, type)
    );

    this.squadManager = new SquadManager(
      this.scene,
      this.botManager,
      (squad) => this.callbacks.onSquadChange(squad),
      (item) => this.callbacks.onKillFeed(item),
      (speaker, msg) => {
        this.callbacks.onPromptChange(`[${speaker}]: "${msg}"`);
        setTimeout(() => this.callbacks.onPromptChange(null), 3200);
      }
    );
    this.vehicleController = new VehicleController();

    // 5. Plane, Zones, and Pure FPP Weapon
    this.createPlaneModel();
    this.createZoneMeshes();
    this.createFppWeaponViewmodel();

    // 6. Bind Input Handlers
    this.setupInputHandlers();
  }

  public async init(): Promise<void> {
    await this.worldBuilder.buildWorld();
    this.botManager.spawnMatchBots(40); // 40 bots + 1 player = 41 players!
    this.squadManager.initTeammates();

    this.initSafeZones();
    this.startLoop();

    this.callbacks.onHealthChange(this.playerHealth, this.playerBoost);
    this.callbacks.onInventoryChange(this.inventory);
    this.callbacks.onSafeZoneChange(this.safeZone);
    this.callbacks.onAliveCountChange(this.botManager.getAliveCount() + this.squadManager.getAliveTeammatesCount() + 1, this.playerKills);
  }

  private setupLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.88);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfffaee, 1.2);
    this.dirLight.position.set(250, 420, 200);
    this.scene.add(this.dirLight);
    this.scene.add(this.camera);
  }

  public applyGraphicSettings(newSettings: GraphicSettings): void {
    this.settings = newSettings;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer.setSize(w * newSettings.renderScale, h * newSettings.renderScale, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.camera.far = newSettings.drawDistance;
    this.camera.updateProjectionMatrix();

    const fogDensity = newSettings.drawDistance === 350 ? 0.003 : newSettings.drawDistance === 600 ? 0.0016 : 0.0011;
    this.scene.fog = new THREE.FogExp2(0x89b6db, fogDensity);

    if (newSettings.shadowMode === 'directional_fast') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
    } else {
      this.renderer.shadowMap.enabled = false;
      this.dirLight.castShadow = false;
    }
  }

  /**
   * Pure FPP 3D Weapon Viewmodel held in front of the camera
   */
  private createFppWeaponViewmodel(): void {
    this.fppWeaponGroup = new THREE.Group();

    // Tactical Gun Mesh (barrel, body, magazine, scope rail)
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const handMat = new THREE.MeshLambertMaterial({ color: 0xd9a87e });

    // Gun body
    this.fppGunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.55), gunMat);
    this.fppGunMesh.position.set(0, 0, 0);
    this.fppWeaponGroup.add(this.fppGunMesh);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.4);
    this.fppWeaponGroup.add(barrel);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.08), gunMat);
    mag.position.set(0, -0.12, -0.05);
    this.fppWeaponGroup.add(mag);

    // Right Hand holding grip
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.1), handMat);
    hand.position.set(0.02, -0.06, 0.12);
    this.fppWeaponGroup.add(hand);

    // Position weapon group in bottom-right of FPP view
    this.fppWeaponGroup.position.set(0.24, -0.22, -0.5);
    this.camera.add(this.fppWeaponGroup);
  }

  private createPlaneModel(): void {
    this.planeMesh = new THREE.Group();
    const planeMat = new THREE.MeshLambertMaterial({ color: 0x48524a });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 30, 8), planeMat);
    body.rotation.x = Math.PI / 2;
    this.planeMesh.add(body);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 6), planeMat);
    wings.position.set(0, 0.5, 2);
    this.planeMesh.add(wings);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 5), planeMat);
    tail.position.set(0, 4, -12);
    this.planeMesh.add(tail);

    this.planeMesh.position.set(0, 190, -340);
    this.scene.add(this.planeMesh);
  }

  private createZoneMeshes(): void {
    const blueGeo = new THREE.CylinderGeometry(330, 330, 160, 32, 1, true);
    const blueMat = new THREE.MeshBasicMaterial({
      color: 0x2288ff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    this.blueZoneMesh = new THREE.Mesh(blueGeo, blueMat);
    this.blueZoneMesh.position.set(0, 80, 0);
    this.scene.add(this.blueZoneMesh);

    const ringGeo = new THREE.RingGeometry(298, 300, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.safeZoneRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.safeZoneRingMesh.position.set(0, 5, 0);
    this.scene.add(this.safeZoneRingMesh);
  }

  private initSafeZones(): void {
    this.safeZone.centerX = 0;
    this.safeZone.centerZ = 0;
    this.safeZone.currentRadius = 300;
    this.safeZone.targetCenterX = (Math.random() - 0.5) * 80;
    this.safeZone.targetCenterZ = (Math.random() - 0.5) * 80;
    this.safeZone.targetRadius = 200;
    this.safeZone.blueRadius = 330;
    this.safeZone.timeRemaining = 160;
    this.safeZone.phaseDuration = 160;
    this.safeZone.isShrinking = false;
  }

  private setupInputHandlers(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Digit1') {
        this.switchWeaponSlot(1);
      } else if (e.code === 'Digit2') {
        this.switchWeaponSlot(2);
      } else if (e.code === 'Digit3') {
        this.switchWeaponSlot(3);
      } else if (e.code === 'Digit7') {
        this.useConsumable('medkit');
      } else if (e.code === 'Digit8') {
        this.useConsumable('first_aid');
      } else if (e.code === 'Digit9') {
        this.useConsumable('bandage');
      } else if (e.code === 'Digit0') {
        this.useConsumable('energy_drink');
      } else if (e.code === 'KeyH') {
        // Auto-heal logic: use medkit if low, else first aid, else bandage
        if (this.inventory.consumables.medkit > 0) this.useConsumable('medkit');
        else if (this.inventory.consumables.first_aid > 0) this.useConsumable('first_aid');
        else if (this.inventory.consumables.bandage > 0) this.useConsumable('bandage');
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        if (this.gamePhase === 'in_plane') {
          this.dropFromPlane();
        } else if (this.gamePhase === 'freefall') {
          this.deployParachute();
        } else if (this.gamePhase === 'ground') {
          this.startReload();
        }
      } else if (e.code === 'KeyF') {
        this.handleInteract();
      } else if (e.code === 'KeyY') {
        this.settings.invertMouseY = !this.settings.invertMouseY;
        this.callbacks.onPromptChange(
          `Vertical Look: ${this.settings.invertMouseY ? 'INVERTED' : 'STANDARD (Mouse UP = Look UP)'}`
        );
        setTimeout(() => this.callbacks.onPromptChange(null), 2500);
      } else if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        if (this.gamePhase === 'in_plane') {
          this.dropFromPlane();
        } else if (this.gamePhase === 'freefall') {
          this.deployParachute();
        } else if (this.gamePhase === 'ground' && !this.isCrouched && !this.isProne) {
          const worldY = resolveWorldHeight(this.playerPos, getTerrainHeight, this.worldBuilder.colliders);
          if (this.playerPos.y <= worldY + 0.1) {
            this.playerVel.y = 5.8; // responsive jump impulse
            sound.playJump();
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.container.addEventListener('mousedown', (e) => {
      sound.resume();
      if (!this.isPointerLocked) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        this.isMouseDown = true;
      } else if (e.button === 2) {
        this.isRightMouseDown = true;
        this.isScoping = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      } else if (e.button === 2) {
        this.isRightMouseDown = false;
        this.isScoping = false;
      }
    });

    this.container.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.container;
    });

    /**
     * MOUSE LOOK: Fixed natural standard orientation
     * Mouse UP -> Camera looks UP
     * Mouse DOWN -> Camera looks DOWN
     * Supports optional invertMouseY setting
     */
    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      const sens = 0.0022 * this.settings.mouseSensitivity * (this.isScoping ? 0.45 : 1.0);
      const invertFactor = this.settings.invertMouseY ? -1 : 1;

      // Horizontal Yaw: mouse right turns camera right
      this.cameraYaw -= e.movementX * sens;

      // Vertical Pitch: Fixed to standard orientation (UP = UP)
      this.cameraPitch -= e.movementY * sens * invertFactor;

      // Clamp vertical pitch to prevent neck inversion (-85 to +85 degrees)
      this.cameraPitch = Math.max(-1.48, Math.min(1.48, this.cameraPitch));
    });

    window.addEventListener('resize', () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w * this.settings.renderScale, h * this.settings.renderScale, false);
    });
  }

  public requestPointerLock(): void {
    try {
      this.container.requestPointerLock();
    } catch {
      /* ignore */
    }
  }

  public exitPointerLock(): void {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  public dropFromPlane(): void {
    if (this.gamePhase !== 'in_plane') return;
    this.gamePhase = 'freefall';
    this.playerPos.copy(this.planeMesh.position);
    this.playerVel.set(0, -25, 12);
    sound.playParachute();
    // Teammates jump alongside player
    this.squadManager.dropWithPlayer(this.playerPos);
  }

  public deployParachute(): void {
    if (this.gamePhase !== 'freefall') return;
    this.gamePhase = 'parachuting';
    sound.playParachute();
  }

  public switchWeaponSlot(slot: 1 | 2 | 3): void {
    this.inventory.activeSlot = slot;
    this.isReloading = false;
    this.callbacks.onInventoryChange({ ...this.inventory });
  }

  private handleInteract(): void {
    if (this.gamePhase === 'driving') {
      const exitResult = this.vehicleController.exitVehicle();
      if (exitResult) {
        this.playerPos.copy(exitResult.position);
        this.gamePhase = 'ground';
      }
      return;
    }

    if (this.gamePhase === 'in_plane') {
      this.dropFromPlane();
      return;
    }

    // Revive nearby knocked teammate
    const knockedTeammate = this.squadManager.getKnockedTeammateNear(this.playerPos, 3.5);
    if (knockedTeammate) {
      this.squadManager.reviveTeammate(knockedTeammate);
      sound.playReload();
      return;
    }

    // Enter nearby vehicle
    for (const v of this.worldBuilder.vehicles) {
      if (v.position.distanceTo(this.playerPos) < 4.5) {
        this.vehicleController.enterVehicle(v);
        this.gamePhase = 'driving';
        return;
      }
    }

    // Pick up nearby loot
    for (let i = this.worldBuilder.lootItems.length - 1; i >= 0; i--) {
      const loot = this.worldBuilder.lootItems[i];
      if (loot.position.distanceTo(this.playerPos) < 3.5) {
        this.pickUpLoot(loot);
        if (loot.mesh) this.scene.remove(loot.mesh);
        this.worldBuilder.lootItems.splice(i, 1);
        return;
      }
    }
  }

  private pickUpLoot(loot: LootItem): void {
    if (loot.type === 'weapon') {
      const wId = loot.itemId as WeaponId;
      if (!this.inventory.weapon1) {
        this.inventory.weapon1 = wId;
        this.inventory.weapon1Ammo = WEAPON_DEFS[wId].magSize;
        this.inventory.activeSlot = 1;
      } else if (!this.inventory.weapon2) {
        this.inventory.weapon2 = wId;
        this.inventory.weapon2Ammo = WEAPON_DEFS[wId].magSize;
        this.inventory.activeSlot = 2;
      } else {
        if (this.inventory.activeSlot === 1) {
          this.inventory.weapon1 = wId;
          this.inventory.weapon1Ammo = WEAPON_DEFS[wId].magSize;
        } else {
          this.inventory.weapon2 = wId;
          this.inventory.weapon2Ammo = WEAPON_DEFS[wId].magSize;
        }
      }
    } else if (loot.type === 'ammo') {
      const aType = loot.itemId as keyof InventoryState['ammo'];
      this.inventory.ammo[aType] = (this.inventory.ammo[aType] || 0) + loot.amount;
    } else if (loot.type === 'consumable') {
      const cType = loot.itemId as ConsumableType;
      this.inventory.consumables[cType] = (this.inventory.consumables[cType] || 0) + loot.amount;
    } else if (loot.type === 'helmet') {
      this.inventory.helmetLevel = (loot.level as 1 | 2 | 3) || 1;
    } else if (loot.type === 'armor') {
      this.inventory.armorLevel = (loot.level as 1 | 2 | 3) || 1;
    } else if (loot.type === 'backpack') {
      this.inventory.backpackLevel = (loot.level as 1 | 2 | 3) || 1;
    }

    this.callbacks.onInventoryChange({ ...this.inventory });
  }

  public useConsumable(type: ConsumableType): void {
    if (this.inventory.consumables[type] <= 0 || this.healingTimer > 0) return;
    const def = CONSUMABLE_DEFS[type];

    if (def.healAmount > 0 && this.playerHealth >= def.maxHealLimit) return;
    if (def.boostAmount > 0 && this.playerBoost >= 100) return;

    this.activeHealingItem = type;
    this.healingTimer = Math.max(1.5, def.useTime * 0.7); // slightly faster healing
    this.inventory.consumables[type]--;
    this.callbacks.onInventoryChange({ ...this.inventory });
  }

  private startReload(): void {
    const activeWeapon = this.getActiveWeaponDef();
    if (!activeWeapon || !activeWeapon.ammoType || this.isReloading) return;

    const currentAmmo = this.inventory.activeSlot === 1 ? this.inventory.weapon1Ammo : this.inventory.weapon2Ammo;
    const needed = activeWeapon.magSize - currentAmmo;
    const reserve = this.inventory.ammo[activeWeapon.ammoType] || 0;

    if (needed <= 0 || reserve <= 0) return;

    this.isReloading = true;
    this.reloadTimer = activeWeapon.reloadTime * 0.8;
    sound.playReload();
  }

  public getActiveWeaponDef(): (typeof WEAPON_DEFS)[WeaponId] | null {
    const slot = this.inventory.activeSlot;
    const wId = slot === 1 ? this.inventory.weapon1 : slot === 2 ? this.inventory.weapon2 : this.inventory.melee;
    return wId ? WEAPON_DEFS[wId] : null;
  }

  private startLoop(): void {
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(this.clock.getDelta(), 0.08);
      this.update(dt);
      this.render();
    };
    this.animFrameId = requestAnimationFrame(animate);
  }

  private update(dt: number): void {
    this.matchTime += dt;

    // 1. Airplane Flight & BOT PARACHUTE DROPS
    if (this.gamePhase === 'in_plane') {
      this.planeMesh.position.z += 55 * dt;
      this.playerPos.copy(this.planeMesh.position);

      // Enemies drop out of the back of the airplane as it travels!
      this.botManager.updateAirplaneDrops(this.planeMesh.position);

      if (this.planeMesh.position.z > 330) {
        this.dropFromPlane();
      }
    } else {
      // Continue bot airplane drops if airplane is still traversing the island
      if (this.planeMesh.position.z < 340) {
        this.planeMesh.position.z += 55 * dt;
        this.botManager.updateAirplaneDrops(this.planeMesh.position);
      }
    }

    // 2. Freefall
    if (this.gamePhase === 'freefall') {
      this.playerVel.y = -38;
      const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
      this.playerPos.addScaledVector(fwd, 18 * dt);
      this.playerPos.y += this.playerVel.y * dt;

      const groundY = getTerrainHeight(this.playerPos.x, this.playerPos.z);
      if (this.playerPos.y < groundY + 70) {
        this.deployParachute();
      }
    }

    // 3. Parachuting
    if (this.gamePhase === 'parachuting') {
      this.playerVel.y = -10;
      const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
      const moveX = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
      const moveZ = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);

      this.playerPos.addScaledVector(fwd, (moveZ * 12 + 6) * dt);
      this.playerPos.x += moveX * 6 * dt;
      this.playerPos.y += this.playerVel.y * dt;

      const groundY = getTerrainHeight(this.playerPos.x, this.playerPos.z);
      if (this.playerPos.y <= groundY + 0.5) {
        this.playerPos.y = groundY;
        this.gamePhase = 'ground';
      }
    }

    // 4. Ground Movement
    if (this.gamePhase === 'ground') {
      this.updateGroundMovement(dt);
    }

    // 5. Driving Vehicle (Pure FPP Cockpit View)
    if (this.gamePhase === 'driving') {
      this.vehicleController.update(dt, {
        forward: !!this.keys['KeyW'],
        backward: !!this.keys['KeyS'],
        left: !!this.keys['KeyA'],
        right: !!this.keys['KeyD'],
        handbrake: !!this.keys['Space'],
        boost: !!this.keys['ShiftLeft'],
        horn: !!this.keys['KeyH'],
      });
      if (this.vehicleController.activeVehicle) {
        this.playerPos.copy(this.vehicleController.activeVehicle.position);
      }
    }

    // 6. Shooting
    this.shootCooldown -= dt;
    if (this.isMouseDown && this.shootCooldown <= 0 && this.gamePhase === 'ground') {
      this.fireActiveWeapon();
    }

    // 7. Reloading
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.finishReload();
      }
    }

    // 8. Healing
    this.updateHealing(dt);

    // 9. Safe Zone
    this.updateSafeZones(dt);

    // 10. Bots AI
    this.botManager.update(
      dt,
      this.playerPos,
      this.cameraYaw,
      this.playerHealth,
      this.isPlayerKnocked,
      this.safeZone.centerX,
      this.safeZone.centerZ,
      this.safeZone.targetRadius,
      this.safeZone.blueRadius,
      this.worldBuilder.vehicles,
      this.gamePhase,
      this.isCrouched,
      (dmg, attacker, weapon) => this.damagePlayer(dmg, attacker, weapon)
    );

    this.squadManager.update(
      dt,
      this.playerPos,
      this.cameraYaw,
      this.playerHealth,
      this.isPlayerKnocked,
      this.safeZone.centerX,
      this.safeZone.centerZ,
      this.safeZone.blueRadius,
      () => {
        // Player revived by squadmate!
        this.isPlayerKnocked = false;
        this.playerHealth = 50;
        this.playerKnockedHealth = 100;
        this.callbacks.onHealthChange(50, this.playerBoost);
        this.callbacks.onPromptChange('REVIVED BY SQUADMATE! USE FIRST AID TO HEAL!');
        sound.playMedkit();
        setTimeout(() => this.callbacks.onPromptChange(null), 3500);
      }
    );

    // 11. Victory / Defeat Check (Squad Victory)
    const aliveEnemyBots = this.botManager.getAliveCount();
    const aliveSquad = this.squadManager.getAliveTeammatesCount() + (this.playerHealth > 0 || this.isPlayerKnocked ? 1 : 0);
    const totalAlive = aliveEnemyBots + aliveSquad;
    this.callbacks.onAliveCountChange(totalAlive, this.playerKills);

    if (aliveEnemyBots === 0 && (this.playerHealth > 0 || this.isPlayerKnocked) && this.gamePhase !== 'victory') {
      this.gamePhase = 'victory';
      sound.playVictoryFanfare();
      this.callbacks.onGameEnd(true, {
        kills: this.playerKills,
        damage: Math.round(this.playerDamageDealt),
        rank: 1,
        survivalTime: Math.round(this.matchTime),
      });
    }

    // 12. Airdrops
    this.updateAirdrop(dt);

    // 13. Camera & Pure FPP Weapon Viewmodel Update
    this.updateCameraAndFppViewmodel(dt);

    // 14. Contextual Prompts
    this.updateInteractionPrompts();


  }

  private updateGroundMovement(dt: number): void {
    const worldY = resolveWorldHeight(this.playerPos, getTerrainHeight, this.worldBuilder.colliders);

    if (this.isPlayerKnocked) {
      // Crawling state
      this.isCrouched = true;
      this.isSprinting = false;
      this.isScoping = false;
      const crawlSpeed = 1.3;
      const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
      const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

      const moveDir = new THREE.Vector3();
      if (this.keys['KeyW']) moveDir.add(fwd);
      if (this.keys['KeyS']) moveDir.sub(fwd);
      if (this.keys['KeyD']) moveDir.add(right);
      if (this.keys['KeyA']) moveDir.sub(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const nextPos = this.playerPos.clone().addScaledVector(moveDir, crawlSpeed * dt);
        resolveHorizontalCollisions(nextPos, 0.45, 1.8, this.worldBuilder.colliders);
        this.playerPos.copy(nextPos);
      }

      this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, worldY, 15 * dt);
      this.playerKnockedHealth -= 1.0 * dt;
      if (this.playerKnockedHealth <= 0 || this.squadManager.getAliveTeammatesCount() === 0) {
        this.handlePlayerDeath('Bleed Out');
      }
      return;
    }

    this.isSprinting = !!this.keys['ShiftLeft'];
    this.isCrouched = !!this.keys['KeyC'] || !!this.keys['ControlLeft'] || !!this.keys['ControlRight'];
    this.isProne = !!this.keys['KeyZ'];

    let speed = 12.5; // Base speed is now running speed
    if (this.isSprinting) speed = 18.5;
    if (this.isCrouched) speed = 7.0;
    if (this.isProne) speed = 4.0;
    if (this.isScoping) speed *= 0.65;
    if (this.playerBoost > 60) speed *= 1.15;

    const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW']) moveDir.add(fwd);
    if (this.keys['KeyS']) moveDir.sub(fwd);
    if (this.keys['KeyD']) moveDir.add(right);
    if (this.keys['KeyA']) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const nextPos = this.playerPos.clone().addScaledVector(moveDir, speed * dt);
      resolveHorizontalCollisions(nextPos, 0.45, 1.8, this.worldBuilder.colliders);
      this.playerPos.copy(nextPos);

      // Weapon sway/bobbing in FPP
      this.fppBobTimer += dt * (this.isSprinting ? 14 : 9);

      if (Math.random() < 0.05 * (speed / 4.8)) {
        sound.playFootstep();
        this.handleSoundIndicator(this.playerPos, 'footstep');
      }
    }

    // Vertical Movement & Gravity
    if (this.playerPos.y > worldY + 0.1) {
      this.playerVel.y -= 18 * dt;
    } else {
      this.playerVel.y = 0;
      this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, worldY, 20 * dt);
    }
    this.playerPos.y += this.playerVel.y * dt;

    this.playerPos.x = Math.max(-330, Math.min(330, this.playerPos.x));
    this.playerPos.z = Math.max(-330, Math.min(330, this.playerPos.z));

    if ((this.keys['Space'] || this.keys['KeyR']) && !this.isCrouched && !this.isProne && this.playerPos.y <= worldY + 0.1) {
      this.playerVel.y = 5.8;
      sound.playJump();
    }
  }

  /**
   * Remove the redundant getWorldHeight method.
   */
  private fireActiveWeapon(): void {
    if (this.isPlayerKnocked) return;
    const active = this.getActiveWeaponDef();
    if (!active) return;

    if (active.category === 'Melee') {
      this.shootCooldown = 1.0 / active.fireRate;
      sound.playGunshot('pan');
      this.meleeSwing();
      return;
    }

    const currentAmmo = this.inventory.activeSlot === 1 ? this.inventory.weapon1Ammo : this.inventory.weapon2Ammo;
    if (currentAmmo <= 0) {
      this.startReload();
      return;
    }

    // UNLIMITED AMMO: Active clip ammo never decreases when shooting, and reserve ammo types are locked to 999!
    this.inventory.ammo['5.56mm'] = 999;
    this.inventory.ammo['7.62mm'] = 999;
    this.callbacks.onInventoryChange({ ...this.inventory });

    this.shootCooldown = 1.0 / active.fireRate;
    sound.playGunshot(active.id);
    this.handleSoundIndicator(this.playerPos, 'gunshot');
    this.botManager.notifySoundFired(this.playerPos, 'player');

    // FPP Recoil kick on viewmodel
    this.fppRecoilOffset = 0.08;

    // Gentle camera recoil
    this.cameraPitch += active.recoilPitch * 0.6;
    this.cameraYaw += (Math.random() - 0.5) * (active.recoilYaw * 0.5);

    this.performBulletHitscan(active);
  }

  private performBulletHitscan(weapon: (typeof WEAPON_DEFS)[WeaponId]): void {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    // 1. Find the distance to the closest wall/building/crate collider intersecting the bullet ray
    let closestWallDist = Infinity;
    const intersectPoint = new THREE.Vector3();

    for (const col of this.worldBuilder.colliders) {
      if (col.type === 'wall' || col.type === 'building' || col.type === 'crate') {
        if (raycaster.ray.intersectBox(col.box, intersectPoint)) {
          const dist = raycaster.ray.origin.distanceTo(intersectPoint);
          if (dist < closestWallDist) {
            closestWallDist = dist;
          }
        }
      }
    }

    let closestBot: { bot: any; dist: number; isHeadshot: boolean } | null = null;

    for (const bot of this.botManager.bots) {
      if (bot.state === 'dead' || bot.state === 'in_plane') continue;

      const botCenter = bot.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      const headCenter = bot.position.clone().add(new THREE.Vector3(0, 1.6, 0));

      const distRayToBody = raycaster.ray.distanceToPoint(botCenter);
      const distRayToHead = raycaster.ray.distanceToPoint(headCenter);
      const hitDist = raycaster.ray.origin.distanceTo(botCenter);

      // Generous casual-friendly hit tolerances!
      if (distRayToHead < 0.55 && hitDist < weapon.range && hitDist < closestWallDist) {
        if (!closestBot || hitDist < closestBot.dist) {
          closestBot = { bot, dist: hitDist, isHeadshot: true };
        }
      } else if (distRayToBody < 0.95 && hitDist < weapon.range && hitDist < closestWallDist) {
        if (!closestBot || hitDist < closestBot.dist) {
          closestBot = { bot, dist: hitDist, isHeadshot: false };
        }
      }
    }

    if (closestBot) {
      sound.playHitmarker(closestBot.isHeadshot);
      this.playerDamageDealt += weapon.damage * (closestBot.isHeadshot ? 2.6 : 1.2);

      const result = this.botManager.damageBot(
        closestBot.bot.id,
        weapon.damage,
        closestBot.isHeadshot,
        'You',
        weapon.name
      );

      this.callbacks.onHitmarker(closestBot.isHeadshot, result.isDead);

      if (result.isDead) {
        this.playerKills++;
      }
    } else {
      // If the ray hit a wall closer than any bot, produce wall bullet impact!
      if (closestWallDist < weapon.range) {
        sound.playImpact('metal');
      } else {
        sound.playImpact('dirt');
      }
    }

  }

  private meleeSwing(): void {
    for (const bot of this.botManager.bots) {
      if (bot.state === 'dead') continue;
      if (bot.position.distanceTo(this.playerPos) < 3.2) {
        sound.playHitmarker(true);
        const result = this.botManager.damageBot(bot.id, 80, true, 'You', 'Cast Iron Pan');
        this.callbacks.onHitmarker(true, result.isDead);
        if (result.isDead) this.playerKills++;
        break;
      }
    }
  }

  private finishReload(): void {
    const active = this.getActiveWeaponDef();
    if (!active || !active.ammoType) {
      this.isReloading = false;
      return;
    }

    const current = this.inventory.activeSlot === 1 ? this.inventory.weapon1Ammo : this.inventory.weapon2Ammo;
    const needed = active.magSize - current;
    const available = this.inventory.ammo[active.ammoType] || 0;
    const loadAmount = Math.min(needed, available);

    if (this.inventory.activeSlot === 1) {
      this.inventory.weapon1Ammo += loadAmount;
    } else {
      this.inventory.weapon2Ammo += loadAmount;
    }
    this.inventory.ammo[active.ammoType] -= loadAmount;

    this.isReloading = false;
    this.callbacks.onInventoryChange({ ...this.inventory });
  }

  private updateHealing(dt: number): void {
    if (this.playerBoost > 0) {
      this.playerBoost = Math.max(0, this.playerBoost - 1.2 * dt);
      if (this.playerHealth < this.playerMaxHealth) {
        this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 3.0 * dt);
        this.callbacks.onHealthChange(this.playerHealth, this.playerBoost);
      }
    }

    if (this.healingTimer > 0 && this.activeHealingItem) {
      this.healingTimer -= dt;
      if (this.healingTimer <= 0) {
        const def = CONSUMABLE_DEFS[this.activeHealingItem];
        if (def.healAmount > 0) {
          this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + def.healAmount);
        }
        if (def.boostAmount > 0) {
          this.playerBoost = Math.min(100, this.playerBoost + def.boostAmount);
        }
        this.activeHealingItem = null;
        this.callbacks.onHealthChange(this.playerHealth, this.playerBoost);
      }
    }
  }

  private updateSafeZones(dt: number): void {
    this.safeZone.timeRemaining -= dt;

    if (this.safeZone.isShrinking) {
      const shrinkSpeed = (this.safeZone.currentRadius - this.safeZone.targetRadius) / 30;
      this.safeZone.blueRadius = Math.max(this.safeZone.targetRadius, this.safeZone.blueRadius - shrinkSpeed * dt);

      if (this.safeZone.blueRadius <= this.safeZone.targetRadius + 1.0) {
        this.safeZone.isShrinking = false;
        this.safeZone.currentRadius = this.safeZone.targetRadius;
        this.safeZone.phase++;

        if (this.safeZone.phase <= this.safeZone.totalPhases) {
          this.safeZone.targetRadius = Math.max(25, this.safeZone.currentRadius * 0.55);
          const offsetDist = Math.random() * (this.safeZone.currentRadius - this.safeZone.targetRadius) * 0.7;
          const offsetAngle = Math.random() * Math.PI * 2;
          this.safeZone.targetCenterX = this.safeZone.centerX + Math.cos(offsetAngle) * offsetDist;
          this.safeZone.targetCenterZ = this.safeZone.centerZ + Math.sin(offsetAngle) * offsetDist;
          this.safeZone.phaseDuration = 90 - this.safeZone.phase * 10;
          this.safeZone.timeRemaining = this.safeZone.phaseDuration;
          this.safeZone.damagePerSec += 1.0;
        }
      }
    } else {
      if (this.safeZone.timeRemaining <= 0) {
        this.safeZone.isShrinking = true;
        this.safeZone.timeRemaining = 30;
        sound.playZoneWarning();
      }
    }

    // ALWAYS sync 3D zone positions and scales every frame for flawless visual accuracy on the 700m map!
    const scale = this.safeZone.blueRadius / 330;
    this.blueZoneMesh.scale.set(scale, 1, scale);
    this.blueZoneMesh.position.set(this.safeZone.centerX, 80, this.safeZone.centerZ);

    const ringScale = this.safeZone.targetRadius / 300;
    this.safeZoneRingMesh.scale.set(ringScale, 1, ringScale);
    this.safeZoneRingMesh.position.set(this.safeZone.targetCenterX, 5, this.safeZone.targetCenterZ);

    const distToZoneCenter = Math.hypot(this.playerPos.x - this.safeZone.centerX, this.playerPos.z - this.safeZone.centerZ);
    if (distToZoneCenter > this.safeZone.blueRadius && this.playerHealth > 0) {
      this.playerHealth -= this.safeZone.damagePerSec * dt;
      this.callbacks.onHealthChange(this.playerHealth, this.playerBoost);

      if (this.playerHealth <= 0) {
        this.handlePlayerDeath('The Blue Zone');
      }
    }

    this.callbacks.onSafeZoneChange({ ...this.safeZone });
  }

  public damagePlayer(rawDamage: number, attackerName: string, weapon: WeaponId): void {
    if (this.playerHealth <= 0 && this.isPlayerKnocked) {
      // Exactly 4-5 bullets to finish off knocked player (100 HP / ~22.5 dmg = 4.44 bullets)
      const finishDmg = Math.max(20, Math.min(25, rawDamage));
      this.playerKnockedHealth -= finishDmg;
      sound.playImpact('flesh');
      if (this.playerKnockedHealth <= 0 || this.squadManager.getAliveTeammatesCount() === 0) {
        this.handlePlayerDeath(attackerName);
      }
      return;
    }

    if (this.playerHealth <= 0) return;

    let dmg = 20.0; // Exactly 5 hits to knock down player (100 HP / 20 = 5 hits)

    this.playerHealth = Math.max(0, this.playerHealth - dmg);
    this.callbacks.onHealthChange(this.playerHealth, this.playerBoost);
    sound.playImpact('flesh');

    if (this.playerHealth <= 0) {
      if (this.squadManager.getAliveTeammatesCount() > 0) {
        this.isPlayerKnocked = true;
        this.playerKnockedHealth = 100; // Takes 4-5 bullets to finish!
        this.playerHealth = 0;
        this.isScoping = false;
        this.callbacks.onHealthChange(0, this.playerBoost);
        this.callbacks.onPromptChange('YOU ARE KNOCKED DOWN! CRAWL TO COVER! SQUAD IS COMING TO REVIVE YOU!');
        this.callbacks.onKillFeed({
          id: `player_knock_${Date.now()}`,
          killer: attackerName,
          victim: 'You',
          weapon: WEAPON_DEFS[weapon]?.name || 'Assault Rifle',
          isHeadshot: false,
          isPlayerKiller: false,
          isPlayerVictim: true,
          isKnockout: true,
          timestamp: Date.now(),
        });
      } else {
        this.handlePlayerDeath(attackerName);
      }
    }
  }

  private handlePlayerDeath(killerName: string): void {
    if (this.respawnChances > 0) {
      this.respawnChances--;
      this.respawnPlayer();
      return;
    }

    this.gamePhase = 'game_over';
    this.exitPointerLock();

    const rank = this.botManager.getAliveCount() + 1;
    this.callbacks.onGameEnd(false, {
      kills: this.playerKills,
      damage: Math.round(this.playerDamageDealt),
      rank,
      survivalTime: Math.round(this.matchTime),
    });

    this.callbacks.onKillFeed({
      id: `player_death_${Date.now()}`,
      killer: killerName,
      victim: 'You',
      weapon: 'Combat',
      isHeadshot: false,
      isPlayerKiller: false,
      isPlayerVictim: true,
      timestamp: Date.now(),
    });
  }

  private respawnPlayer(): void {
    this.playerHealth = this.playerMaxHealth;
    this.playerBoost = 0;
    this.isPlayerKnocked = false;
    this.playerKnockedHealth = 100;

    // Drop from sky above current safe zone center (high up to deploy parachute!)
    const rx = this.safeZone.centerX + (Math.random() - 0.5) * 50;
    const rz = this.safeZone.centerZ + (Math.random() - 0.5) * 50;
    this.playerPos.set(rx, 150, rz);
    this.playerVel.set(0, -18, 0);

    // Set phase back to freefall!
    this.gamePhase = 'freefall';

    // Notify UI
    this.callbacks.onHealthChange(this.playerHealth, this.playerBoost);
    this.callbacks.onPromptChange(`RECALLED! DRAG PARACHUTE TO SAFE ZONE (${this.respawnChances} RECALLS LEFT)`);
    setTimeout(() => this.callbacks.onPromptChange(null), 4000);

    this.callbacks.onKillFeed({
      id: `respawn_${Date.now()}`,
      killer: 'Recall Tower',
      victim: 'You',
      weapon: 'Respawn',
      isHeadshot: false,
      isPlayerKiller: false,
      isPlayerVictim: true,
      isKnockout: false,
      timestamp: Date.now(),
    });
  }

  private updateAirdrop(dt: number): void {
    this.nextAirdropTimer -= dt;
    if (this.nextAirdropTimer <= 0) {
      this.nextAirdropTimer = 160;
      sound.playPlaneFlyby();
      const ax = this.safeZone.centerX + (Math.random() - 0.5) * 120;
      const az = this.safeZone.centerZ + (Math.random() - 0.5) * 120;
      this.worldBuilder.spawnAirdrop(ax, az);
    }

    for (const crate of this.worldBuilder.airdropCrates) {
      if (!crate.hasLanded) {
        crate.position.y -= 12 * dt;
        const groundY = getTerrainHeight(crate.position.x, crate.position.z);
        if (crate.position.y <= groundY + 1.0) {
          crate.position.y = groundY + 1.0;
          crate.hasLanded = true;
          crate.loot.forEach(l => {
            this.worldBuilder.lootItems.push(l);
          });
        }
      }
    }
  }

  /**
   * PURE FPP CAMERA & WEAPON VIEWMODEL UPDATE
   */
  private updateCameraAndFppViewmodel(dt: number): void {
    const activeWeapon = this.getActiveWeaponDef();
    const baseFov = this.isScoping && activeWeapon ? activeWeapon.zoomFov : 72;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, baseFov, 14 * dt);
    this.camera.updateProjectionMatrix();

    if (this.gamePhase === 'in_plane') {
      // Look forward / out cargo bay in airplane
      this.camera.position.set(
        this.planeMesh.position.x,
        this.planeMesh.position.y + 1.8,
        this.planeMesh.position.z - 4
      );

      const lookTarget = this.camera.position.clone().add(new THREE.Vector3(
        -Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
        Math.sin(this.cameraPitch),
        -Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
      ));
      this.camera.lookAt(lookTarget);
      this.fppWeaponGroup.visible = false;
      return;
    }

    if (this.gamePhase === 'driving') {
      // Pure FPP Vehicle Cockpit / Driver Eye-Level View
      const v = this.vehicleController.activeVehicle!;
      this.camera.position.set(
        v.position.x - Math.sin(v.rotation.y) * 0.3,
        v.position.y + 1.45,
        v.position.z - Math.cos(v.rotation.y) * 0.3
      );

      const lookTarget = this.camera.position.clone().add(new THREE.Vector3(
        -Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
        Math.sin(this.cameraPitch),
        -Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
      ));
      this.camera.lookAt(lookTarget);
      this.fppWeaponGroup.visible = false;
      return;
    }

    // Ground / Freefall / Parachuting: Eye-level First Person (Taller body height)
    const eyeH = this.isPlayerKnocked ? 0.45 : this.isCrouched ? 1.05 : this.isProne ? 0.4 : 1.85;
    this.camera.position.set(this.playerPos.x, this.playerPos.y + eyeH, this.playerPos.z);

    // Direction vector from Yaw and Pitch
    const lookTarget = this.camera.position.clone().add(new THREE.Vector3(
      -Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
      Math.sin(this.cameraPitch),
      -Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
    ));
    this.camera.lookAt(lookTarget);

    // FPP Weapon Viewmodel Positioning & Sway
    if (this.gamePhase === 'ground' && !this.isPlayerKnocked) {
      this.fppWeaponGroup.visible = true;

      // Decay recoil kick
      this.fppRecoilOffset = THREE.MathUtils.lerp(this.fppRecoilOffset, 0, 15 * dt);

      // Weapon bobbing when walking
      const bobX = Math.cos(this.fppBobTimer * 0.5) * 0.015;
      const bobY = Math.sin(this.fppBobTimer) * 0.015;

      if (this.isScoping) {
        // Center weapon closer to reticle axis
        this.fppWeaponGroup.position.set(0, -0.16, -0.42 + this.fppRecoilOffset);
      } else {
        // Natural hipfire position in bottom-right
        this.fppWeaponGroup.position.set(
          0.24 + bobX,
          -0.22 + bobY,
          -0.5 + this.fppRecoilOffset
        );
      }
    } else {
      this.fppWeaponGroup.visible = false;
    }
  }

  private updateInteractionPrompts(): void {
    if (this.isPlayerKnocked) {
      this.callbacks.onPromptChange(
        `YOU ARE KNOCKED DOWN (${Math.round(this.playerKnockedHealth)} HP)! SQUAD IS COMING TO REVIVE YOU!`
      );
      return;
    }
    if (this.gamePhase === 'in_plane') {
      this.callbacks.onPromptChange('[R] or [F] JUMP FROM AIRPLANE');
      return;
    }
    if (this.gamePhase === 'freefall') {
      this.callbacks.onPromptChange('[R] DEPLOY PARACHUTE');
      return;
    }
    if (this.gamePhase === 'driving') {
      this.callbacks.onPromptChange('[F] EXIT VEHICLE  ·  [SHIFT] BOOST  ·  [H] HORN');
      return;
    }

    // Teammate Revive Prompt
    const knockedTeammate = this.squadManager.getKnockedTeammateNear(this.playerPos, 3.5);
    if (knockedTeammate) {
      this.callbacks.onPromptChange(`[F] REVIVE TEAMMATE (${knockedTeammate.member.name})`);
      return;
    }

    for (const v of this.worldBuilder.vehicles) {
      if (v.position.distanceTo(this.playerPos) < 4.5) {
        this.callbacks.onPromptChange(`[F] DRIVE ${v.type}`);
        return;
      }
    }

    for (const loot of this.worldBuilder.lootItems) {
      if (loot.position.distanceTo(this.playerPos) < 3.5) {
        this.callbacks.onPromptChange(`[F] PICK UP ${loot.name}`);
        return;
      }
    }

    this.callbacks.onPromptChange(null);
  }

  private handleSoundIndicator(pos: THREE.Vector3, type: 'gunshot' | 'footstep'): void {
    const toSound = new THREE.Vector3().subVectors(pos, this.playerPos);
    const dist = toSound.length();
    const maxDist = type === 'footstep' ? 38 : 260;
    if (dist < 1.0 || dist > maxDist) return;

    const angleToSound = Math.atan2(toSound.x, toSound.z);
    let relAngle = angleToSound - this.cameraYaw;
    while (relAngle > Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;

    const worldBearing = Math.round(((-angleToSound * 180) / Math.PI + 360) % 360);

    this.callbacks.onSoundIndicator({
      id: `snd_${Date.now()}_${Math.random()}`,
      type,
      angle: relAngle,
      distance: Math.round(dist),
      worldBearing,
      intensity: Math.max(0.25, 1 - dist / maxDist),
      expiresAt: Date.now() + (type === 'footstep' ? 1400 : 2500),
    });
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public restartMatch(): void {
    this.playerHealth = this.playerMaxHealth;
    this.playerBoost = 0;
    this.respawnChances = 2; // Reset recall chances
    this.playerKills = 0;
    this.playerDamageDealt = 0;
    this.matchTime = 0;
    this.gamePhase = 'in_plane';
    this.planeMesh.position.set(0, 190, -340);
    this.playerPos.copy(this.planeMesh.position);

    this.inventory = {
      ammo: { '5.56mm': 999, '7.62mm': 999, '300mag': 0, '12gauge': 0 },
      consumables: { first_aid: 4, medkit: 2, energy_drink: 5, painkiller: 3, bandage: 6 },
      helmetLevel: 2,
      armorLevel: 2,
      backpackLevel: 2,
      weapon1: 'm416',
      weapon1Ammo: 30,
      weapon2: null,
      weapon2Ammo: 0,
      melee: 'pan',
      activeSlot: 1,
    };

    for (const b of this.botManager.bots) {
      this.scene.remove(b.mesh);
      this.scene.remove(b.shadowMesh);
      if (b.parachuteMesh) this.scene.remove(b.parachuteMesh);
      if (b.knockedIndicator) this.scene.remove(b.knockedIndicator);
    }
    this.botManager.bots = [];
    // Spawn a fresh set of intelligent bots (40 bots)
    this.botManager.spawnMatchBots(40);

    for (const tm of this.squadManager.teammates) {
      this.scene.remove(tm.mesh);
      this.scene.remove(tm.shadowMesh);
    }
    this.squadManager.teammates = [];
    this.squadManager.initTeammates();

    this.initSafeZones();

    this.callbacks.onHealthChange(this.playerHealth, 0);
    this.callbacks.onInventoryChange(this.inventory);
    this.callbacks.onAliveCountChange(30, 0); // 30 players alive at start!
    this.callbacks.onSafeZoneChange(this.safeZone);
  }

  public destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.exitPointerLock();
    this.renderer.dispose();
  }
}
