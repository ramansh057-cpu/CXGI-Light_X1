/**
 * Battle Royale Bot AI Engine
 * Bots spawn inside the C-130 airplane and physically jump out in waves across the 1000m map.
 * Features:
 * - 4-5 bullets to knock down, 4-5 bullets to finish
 * - Realistic Pro BGMI "Jiggle" strafe movement during firefights
 * - Sound investigation: searches for and pushes towards other enemies/gunshots
 * - Bot vs Bot battles across the entire island
 * - Casual-friendly, non-frustrating accuracy
 */

import * as THREE from 'three';
import { getTerrainHeight } from './terrain';
import { WeaponId, WeaponDef, WEAPON_DEFS, KillFeedItem, MAP_POIS } from './types';
import { sound } from './audio';
import { WorldBuilder } from './worldBuilder';
import { resolveHorizontalCollisions, resolveWorldHeight, checkLineOfSight, isPositionInsideBuilding, getVectorToOutside } from './physicsUtils';

export type BotState =
  | 'in_plane'
  | 'freefall'
  | 'parachuting'
  | 'looting'
  | 'patrolling'
  | 'searching_sound'
  | 'engaging'
  | 'flee'
  | 'driving'
  | 'fleeing_zone'
  | 'knocked'
  | 'dead';

export interface BotInstance {
  id: string;
  name: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  targetPosition: THREE.Vector3;
  dropZ: number; // Airplane Z trigger when this bot jumps out!
  hasDropped: boolean;
  rotationY: number;
  health: number; // 100 HP, takes 4-5 bullets to knock down
  maxHealth: number;
  knockedHealth: number; // 100 HP, takes 4-5 bullets to finish off
  armorLevel: number;
  helmetLevel: number;
  weapon: WeaponId;
  weaponDef: WeaponDef;
  state: BotState;
  stateTimer: number;
  shootCooldown: number;
  reactionTimer: number;
  targetEnemy: 'player' | string | null;
  targetEnemyType: 'player' | 'bot' | 'teammate';
  kills: number;
  // BGMI Pro Jiggle Strafe
  jiggleTimer: number;
  jiggleDirection: number; // -1 (left) or 1 (right)
  isCrouching: boolean;
  crouchTimer: number;
  // Sound Search
  soundSearchPos: THREE.Vector3 | null;
  soundSearchTimer: number;
  // Auto-mode firing
  burstCount: number;
  burstTimer: number;
  // Driving
  activeVehicleId: string | null;
  // Visual meshes & limbs
  mesh: THREE.Group;
  parachuteMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  knockedIndicator: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  walkTimer: number;
  footstepTimer: number;
  lastX?: number;
  lastZ?: number;
  stuckTimer?: number;
  healingTimer?: number;
  healingItem?: 'first_aid' | 'medkit' | null;
  duoId?: number;
  isOutsideGuard?: boolean;
  isInsideOccupant?: boolean;
  guardPosition?: THREE.Vector3;
}

const BOT_NAMES = [
  'Viper_007', 'DeltaForce', 'GhostSniper', 'PecadoKing', 'AWM_God',
  'ShroudFan', 'Bhai_Pro', 'Hunter99', 'DeadEye', 'NightRaid',
  'Alpha_Wolf', 'Falcon_Eye', 'ShadowNinja', 'BulletStorm', 'ApexPredator',
  'Ronin_Samurai', 'CyberWarrior', 'IronClad', 'PhantomStriker', 'Titan_Slayer',
  'StormBreaker', 'Valkyrie_9', 'Nova_Blast', 'EagleOne', 'Kraven_Hunter',
  'Spartan_117', 'GrimReaper', 'Outlaw_Joe', 'Zero_Tolerance', 'Blaze_Runner'
];

export class BotManager {
  public bots: BotInstance[] = [];
  public onBulletTracer?: (from: THREE.Vector3, to: THREE.Vector3, isHit: boolean) => void;
  private scene: THREE.Scene;
  private worldBuilder: WorldBuilder;
  private onKillFeed: (item: KillFeedItem) => void;
  private onSoundMade: (pos: THREE.Vector3, type: 'gunshot' | 'footstep') => void;
  private frameCounter = 0;
  private reinforcementTimer = 10.0;

  constructor(
    scene: THREE.Scene,
    worldBuilder: WorldBuilder,
    onKillFeed: (item: KillFeedItem) => void,
    onSoundMade: (pos: THREE.Vector3, type: 'gunshot' | 'footstep') => void
  ) {
    this.scene = scene;
    this.worldBuilder = worldBuilder;
    this.onKillFeed = onKillFeed;
    this.onSoundMade = onSoundMade;
  }

  /**
   * Initialize bots that will fall from the airplane along the flight path
   */
  public spawnMatchBots(count = 59): void {
    const weaponsPool: WeaponId[] = ['m4'];

    // Famous Miramar Named Places dynamically constructed from the 4x scaled MAP_POIS array (-950 to 950)
    const MIRAMAR_POIS = MAP_POIS.map(p => ({
      name: p.name,
      x: p.x,
      z: p.z,
      maxBots: 6 + Math.floor(Math.random() * 5), // Random capacity of 6 to 10 bots!
      currentBots: 0
    }));

    for (let botIndex = 0; botIndex < count; botIndex++) {
      const name = BOT_NAMES[botIndex % BOT_NAMES.length] + (botIndex >= BOT_NAMES.length ? `_${botIndex}` : '');
      const assignedWeapon = weaponsPool[Math.floor(Math.random() * weaponsPool.length)];
      const weaponDef = WEAPON_DEFS[assignedWeapon];

      const { botMesh, parachuteMesh, shadowMesh, knockedIndicator, leftLeg, rightLeg } = this.createBotMesh();
      // ENEMIES ARE ALREADY ON THE GROUND FROM MATCH START!
      botMesh.visible = true;
      shadowMesh.visible = true;
      parachuteMesh.visible = false;
      knockedIndicator.visible = false;
      this.scene.add(botMesh);
      this.scene.add(shadowMesh);

      const duoId = Math.floor(botIndex / 2);
      let targetX = 0;
      let targetZ = 0;

      if (botIndex % 2 === 1 && this.bots[botIndex - 1]) {
        // Duo Partner: spawn tactical proximity to partner (8-14m away)
        const partnerPos = this.bots[botIndex - 1].position;
        const offsetAngle = Math.random() * Math.PI * 2;
        const offsetDist = 8 + Math.random() * 8;
        targetX = Math.max(-315, Math.min(315, partnerPos.x + Math.cos(offsetAngle) * offsetDist));
        targetZ = Math.max(-315, Math.min(315, partnerPos.z + Math.sin(offsetAngle) * offsetDist));
      } else {
        // Allocate Duo team to POIs with cap constraints
        let selectedPoi = MIRAMAR_POIS.find(p => p.currentBots < p.maxBots);
        if (!selectedPoi) {
          selectedPoi = MIRAMAR_POIS[Math.floor(Math.random() * MIRAMAR_POIS.length)];
        }
        selectedPoi.currentBots += 2;

        // Coordinate offset within the POI
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 45;
        targetX = Math.max(-315, Math.min(315, selectedPoi.x + Math.cos(angle) * radius));
        targetZ = Math.max(-315, Math.min(315, selectedPoi.z + Math.sin(angle) * radius));
      }

      const groundY = resolveWorldHeight(new THREE.Vector3(targetX, 0, targetZ), getTerrainHeight, this.worldBuilder.colliders);

      // Place bot directly on the ground
      botMesh.position.set(targetX, groundY, targetZ);
      shadowMesh.position.set(targetX, groundY + 0.05, targetZ);

      // Patrol target nearby
      const wanderAngle = Math.random() * Math.PI * 2;
      const wanderDist = 15 + Math.random() * 30;
      const pTargetX = Math.max(-315, Math.min(315, targetX + Math.cos(wanderAngle) * wanderDist));
      const pTargetZ = Math.max(-315, Math.min(315, targetZ + Math.sin(wanderAngle) * wanderDist));
      const pTargetY = getTerrainHeight(pTargetX, pTargetZ);

      const bot: BotInstance = {
        id: `bot_${botIndex}`,
        name,
        position: botMesh.position,
        velocity: new THREE.Vector3(0, 0, 0),
        targetPosition: new THREE.Vector3(pTargetX, pTargetY, pTargetZ),
        dropZ: 0,
        hasDropped: true,
        rotationY: Math.random() * Math.PI * 2,
        health: 100,
        maxHealth: 100,
        knockedHealth: 100,
        armorLevel: Math.random() > 0.6 ? 2 : 1,
        helmetLevel: Math.random() > 0.6 ? 2 : 1,
        weapon: assignedWeapon,
        weaponDef,
        state: Math.random() > 0.45 ? 'patrolling' : 'looting',
        stateTimer: 4 + Math.random() * 6,
        shootCooldown: 1.2 + Math.random() * 1.5,
        reactionTimer: 1.2,
        targetEnemy: null,
        targetEnemyType: 'player',
        kills: 0,
        jiggleTimer: Math.random() * 2,
        jiggleDirection: Math.random() > 0.5 ? 1 : -1,
        isCrouching: false,
        crouchTimer: 0,
        soundSearchPos: null,
        soundSearchTimer: 0,
        burstCount: 0,
        burstTimer: 0,
        activeVehicleId: null,
        mesh: botMesh,
        parachuteMesh,
        shadowMesh,
        knockedIndicator,
        leftLeg,
        rightLeg,
        walkTimer: Math.random() * 10,
        footstepTimer: Math.random() * 0.35,
        duoId,
        isOutsideGuard: botIndex % 2 === 0,
        isInsideOccupant: botIndex % 2 === 1,
        guardPosition: botMesh.position.clone(),
      };

      botMesh.rotation.y = bot.rotationY;
      this.bots.push(bot);
    }
  }

  /**
   * Trigger bots jumping from airplane as it reaches their dropZ
   */
  public updateAirplaneDrops(planePos: THREE.Vector3): void {
    for (const bot of this.bots) {
      if (!bot.hasDropped && (planePos.z >= bot.dropZ || planePos.z >= 300)) {
        bot.hasDropped = true;
        bot.state = 'freefall';
        bot.mesh.visible = true;
        bot.parachuteMesh.visible = false;

        const offsetX = (Math.random() - 0.5) * 6;
        bot.position.set(planePos.x + offsetX, planePos.y - 3, planePos.z - 6);

        const dx = bot.targetPosition.x - bot.position.x;
        const dz = bot.targetPosition.z - bot.position.z;
        bot.rotationY = Math.atan2(dx, dz);
        bot.mesh.rotation.y = bot.rotationY;
      }
    }
  }

  /**
   * When player jumps from plane, immediately drop 4-6 bots nearby so the landing zone is populated!
   */
  public dropEnemiesNearPlayer(planePos: THREE.Vector3): void {
    let dropped = 0;
    const targetDrops = 4 + Math.floor(Math.random() * 3); // 4 to 6 bots

    for (const bot of this.bots) {
      if (!bot.hasDropped && dropped < targetDrops) {
        bot.hasDropped = true;
        bot.state = 'freefall';
        bot.mesh.visible = true;
        bot.parachuteMesh.visible = false;

        // Spread around airplane drop position
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetZ = (Math.random() - 0.5) * 16;
        bot.position.set(planePos.x + offsetX, planePos.y - 4, planePos.z + offsetZ);

        // Target landing point 65m - 120m away from player's sector
        const angle = Math.random() * Math.PI * 2;
        const dist = 65 + Math.random() * 55;
        const targetX = Math.max(-310, Math.min(310, planePos.x + Math.cos(angle) * dist));
        const targetZ = Math.max(-310, Math.min(310, planePos.z + 75 + Math.sin(angle) * dist));
        const targetY = getTerrainHeight(targetX, targetZ);

        bot.targetPosition.set(targetX, targetY, targetZ);
        const dx = bot.targetPosition.x - bot.position.x;
        const dz = bot.targetPosition.z - bot.position.z;
        bot.rotationY = Math.atan2(dx, dz);
        bot.mesh.rotation.y = bot.rotationY;

        dropped++;
      }
    }
  }

  /**
   * Sound notification: gunshots nearby trigger bots to search for enemies!
   */
  public notifySoundFired(shooterPos: THREE.Vector3, shooterId: string): void {
    for (const bot of this.bots) {
      if (bot.id === shooterId || bot.state === 'dead' || bot.state === 'in_plane' || bot.state === 'knocked') continue;

      const dist = bot.position.distanceTo(shooterPos);
      // Bots hear gunshots up to 180 meters away!
      if (dist < 180) {
        // If not already in an active firefight, investigate sound!
        if (bot.state !== 'engaging') {
          bot.state = 'searching_sound';
          // Add a slight realistic inaccuracy to heard location (2-8m offset for Pro)
          const angle = Math.random() * Math.PI * 2;
          const offsetDist = 2 + Math.random() * 6;
          bot.soundSearchPos = new THREE.Vector3(
            shooterPos.x + Math.cos(angle) * offsetDist,
            shooterPos.y,
            shooterPos.z + Math.sin(angle) * offsetDist
          );
          bot.targetPosition.copy(bot.soundSearchPos);
          bot.soundSearchTimer = 12.0; // Spend up to 12s pushing sound
        }
      }
    }
  }

  private createBotMesh(): {
    botMesh: THREE.Group;
    parachuteMesh: THREE.Mesh;
    shadowMesh: THREE.Mesh;
    knockedIndicator: THREE.Mesh;
    leftLeg: THREE.Mesh;
    rightLeg: THREE.Mesh;
  } {
    const botMesh = new THREE.Group();
    botMesh.scale.set(1.15, 1.35, 1.15); // Taller & bigger body scale

    // Vibrant bright neon materials so enemies stand out brilliantly
    const uniformMat = new THREE.MeshLambertMaterial({ color: 0xff3333 }); // Bright Neon Red
    const vestMat = new THREE.MeshLambertMaterial({ color: 0xff6600 }); // Bright Neon Orange
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffd1a9 });
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 }); // Bright Gold Helmet
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Torso (Main Body - floating box/capsule style stretched vertically to be tall)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.35), uniformMat);
    torso.position.y = 1.3;
    botMesh.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.2, 0.38), vestMat);
    vest.position.y = 1.3;
    botMesh.add(vest);

    // Small Head (Mounted high up on the tall torso)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), skinMat);
    head.position.y = 2.3;
    botMesh.add(head);

    // Small Helmet
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 7), helmetMat);
    helmet.position.set(0, 2.34, 0);
    botMesh.add(helmet);

    // Gun (Attached directly to main body torso at comfortable firing height)
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.7), gunMat);
    gun.position.set(0.2, 1.2, 0.35);
    botMesh.add(gun);

    // Legs (Empty Meshes to completely remove them while keeping code fully compilable)
    const leftLeg = new THREE.Mesh();
    const rightLeg = new THREE.Mesh();
    botMesh.add(leftLeg);
    botMesh.add(rightLeg);

    // Parachute dome (bright orange/red canopy)
    const paraGeo = new THREE.SphereGeometry(2.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const paraMat = new THREE.MeshLambertMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
    });
    const parachuteMesh = new THREE.Mesh(paraGeo, paraMat);
    parachuteMesh.position.y = 3.2;
    parachuteMesh.visible = false;
    botMesh.add(parachuteMesh);

    // Ground simple contact shadow decal
    const shadowGeo = new THREE.CircleGeometry(0.65, 8);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);

    // Floating Knocked Indicator (Pulsing Red Cross / Pill above head)
    const knockedGeo = new THREE.BoxGeometry(0.45, 0.18, 0.1);
    const knockedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const knockedIndicator = new THREE.Mesh(knockedGeo, knockedMat);
    knockedIndicator.position.set(0, 1.2, 0);
    knockedIndicator.visible = false;
    botMesh.add(knockedIndicator);

    // Disable frustum culling so bots never disappear from screen due to camera angles or peripheral viewports!
    botMesh.traverse(child => {
      child.frustumCulled = false;
    });

    return { botMesh, parachuteMesh, shadowMesh, knockedIndicator, leftLeg, rightLeg };
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    playerHealth: number,
    isPlayerKnocked: boolean,
    safeCenterX: number,
    safeCenterZ: number,
    safeRadius: number,
    blueRadius: number,
    vehicles: any[],
    gamePhase: string,
    isPlayerCrouched: boolean,
    onPlayerDamage: (damage: number, attackerName: string, weapon: WeaponId) => void,
    isPlayerInLandingGrace: boolean = false
  ): void {
    this.frameCounter++;
    const activeBots = this.bots.filter(b => b.state !== 'dead' && b.state !== 'in_plane');
    const isPlayerInside = isPositionInsideBuilding(playerPos, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);

    // Dead enemies do not respawn: once an enemy is eliminated, they stay dead permanently.

    // FOOLPROOF SAFETY SWEEP: Hide dead/in-plane bots to prevent static "ghost" models
    const hiddenBots = this.bots.filter(b => b.state === 'dead' || b.state === 'in_plane');
    for (let k = 0; k < hiddenBots.length; k++) {
      const hb = hiddenBots[k];
      hb.mesh.visible = false;
      hb.shadowMesh.visible = false;
      if (hb.parachuteMesh) hb.parachuteMesh.visible = false;
      if (hb.knockedIndicator) hb.knockedIndicator.visible = false;
      
      // Only remove dead bots from the scene. Keep 'in_plane' bots in the scene so they render beautifully upon jumping!
      if (hb.state === 'dead') {
        this.scene.remove(hb.mesh);
        this.scene.remove(hb.shadowMesh);
      }
    }

    for (let i = 0; i < activeBots.length; i++) {
      const bot = activeBots[i];
      const prevBotX = bot.position.x;
      const prevBotZ = bot.position.z;

      const worldY = resolveWorldHeight(bot.position, getTerrainHeight, this.worldBuilder.colliders);
      const terrainY = getTerrainHeight(bot.position.x, bot.position.z);

      // --- ANTI-GHOST / STUCK SANITIZER ---
      if (isNaN(bot.position.x) || isNaN(bot.position.y) || isNaN(bot.position.z)) {
        this.killBot(bot, 'System Void', 'Recall', false, false);
        continue;
      }
      if (Math.abs(bot.position.x) > 1100 || Math.abs(bot.position.z) > 1100) {
        this.killBot(bot, 'Out of Map Boundary', 'Recall', false, false);
        continue;
      }
      if (bot.health <= 0) {
        this.killBot(bot, 'System Integrity Check', 'Recall', false, false);
        continue;
      }
      if (bot.state !== 'freefall' && bot.state !== 'parachuting' && bot.position.y < terrainY - 5.0) {
        // Safe surface recall - respawn on terrain instead of falling forever or dying!
        bot.position.set(bot.targetPosition.x, terrainY + 2.0, bot.targetPosition.z);
        bot.velocity.set(0, 0, 0);
        bot.mesh.position.copy(bot.position);
      }
      // ------------------------------------

      bot.mesh.visible = true; // Always guarantee that ground-active bots are 100% visible to the player!
      bot.shadowMesh.visible = true;
      
      // GLOBAL UN-STUCK CHECK (Instantly pushes bots out of solid building walls/houses)
      const isInside = isPositionInsideBuilding(bot.position, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);
      if (isInside && bot.state !== 'driving') {
        const outsidePos = getVectorToOutside(bot.position, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);
        if (outsidePos) {
          bot.targetPosition.copy(outsidePos);
          const odx = outsidePos.x - bot.position.x;
          const odz = outsidePos.z - bot.position.z;
          bot.rotationY = Math.atan2(odx, odz);
          bot.mesh.rotation.y = bot.rotationY;
          
          const exitSpeed = 16.0; // sprinting speed to go outside!
          bot.position.x += Math.sin(bot.rotationY) * exitSpeed * dt;
          bot.position.z += Math.cos(bot.rotationY) * exitSpeed * dt;
          resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);
        }
      }
      
      // DRIVING LOGIC
      if (bot.state === 'driving' && bot.activeVehicleId) {
        const vehicle = vehicles.find(v => v.id === bot.activeVehicleId);
        if (!vehicle || vehicle.health <= 0) {
          bot.state = 'patrolling';
          bot.activeVehicleId = null;
        } else {
          // Drive towards targetPosition
          const tdx = bot.targetPosition.x - bot.position.x;
          const tdz = bot.targetPosition.z - bot.position.z;
          const distToTarget = Math.hypot(tdx, tdz);
          
          if (distToTarget > 12) {
            const targetRot = Math.atan2(tdx, tdz);
            const rotSpeed = 2.4 * dt;
            let diff = targetRot - vehicle.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            vehicle.rotation.y += Math.max(-rotSpeed, Math.min(rotSpeed, diff));
            
            const driveSpeed = 16.5;
            vehicle.position.x += Math.sin(vehicle.rotation.y) * driveSpeed * dt;
            vehicle.position.z += Math.cos(vehicle.rotation.y) * driveSpeed * dt;
            
            const vY = getTerrainHeight(vehicle.position.x, vehicle.position.z);
            vehicle.position.y = vY + 0.6;
            
            bot.position.copy(vehicle.position);
            bot.mesh.position.copy(bot.position);
            
            if (vehicle.shadowMesh) {
              vehicle.shadowMesh.position.set(vehicle.position.x, vY + 0.05, vehicle.position.z);
              vehicle.shadowMesh.rotation.z = vehicle.rotation.y;
            }
          } else {
            bot.state = 'looting';
            bot.activeVehicleId = null;
            vehicle.isOccupied = false;
          }
          continue;
        }
      }

      bot.shadowMesh.position.set(bot.position.x, terrainY + 0.05, bot.position.z);

      // VEHICLE SEARCHING (Bots can spot and drive vehicles to travel across Miramar!)
      if (bot.state === 'patrolling' || bot.state === 'fleeing_zone') {
        const distToTarget = bot.position.distanceTo(bot.targetPosition);
        if (distToTarget > 35 && !bot.activeVehicleId) {
          // Look for unoccupied vehicle within 160m
          let nearestV: any = null;
          let minVDist = 160;
          for (const v of vehicles) {
            if (!v.isOccupied && v.health > 0) {
              const vd = bot.position.distanceTo(v.position);
              if (vd < minVDist) {
                minVDist = vd;
                nearestV = v;
              }
            }
          }
          if (nearestV) {
            bot.targetPosition.copy(nearestV.position);
            // If close enough, board and start driving!
            if (minVDist < 4.5) {
              bot.state = 'driving';
              bot.activeVehicleId = nearestV.id;
              nearestV.isOccupied = true;
            }
          }
        }
      }

      // 1. FREEFALL FROM AIRPLANE
      if (bot.state === 'freefall') {
        bot.position.y -= 34 * dt;
        const tdx = bot.targetPosition.x - bot.position.x;
        const tdz = bot.targetPosition.z - bot.position.z;
        const distToTarget = Math.hypot(tdx, tdz);
        if (distToTarget > 5) {
          bot.position.x += (tdx / distToTarget) * 22 * dt;
          bot.position.z += (tdz / distToTarget) * 22 * dt;
          resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);
          bot.rotationY = Math.atan2(tdx, tdz);
          bot.mesh.rotation.y = bot.rotationY;
        }

        if (bot.position.y <= terrainY + 85) {
          bot.state = 'parachuting';
          bot.parachuteMesh.visible = true;
          bot.shadowMesh.visible = true;
        }
        continue;
      }

      // 2. PARACHUTING GLIDE TO GROUND
      if (bot.state === 'parachuting') {
        bot.position.y -= 11 * dt;
        const tdx = bot.targetPosition.x - bot.position.x;
        const tdz = bot.targetPosition.z - bot.position.z;
        const distToTarget = Math.hypot(tdx, tdz);
        if (distToTarget > 2) {
          bot.position.x += (tdx / distToTarget) * 9 * dt;
          bot.position.z += (tdz / distToTarget) * 9 * dt;
          resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);
          bot.rotationY = Math.atan2(tdx, tdz);
          bot.mesh.rotation.y = bot.rotationY;
        }

        bot.shadowMesh.position.set(bot.position.x, terrainY + 0.05, bot.position.z);

        if (bot.position.y <= worldY + 0.5) {
          bot.position.y = worldY;
          bot.state = 'looting';
          bot.stateTimer = 5 + Math.random() * 6;
          bot.parachuteMesh.visible = false; // Remove parachute immediately on landing so they don't carry it around!
        }
        continue;
      }

      // 3. GROUNDED STATE (Apply global physics, gravity, and jumping)
      if (bot.velocity.y > 0 || bot.position.y > worldY) {
        bot.velocity.y -= 15 * dt;
        bot.position.y += bot.velocity.y * dt;
        if (bot.position.y < worldY) {
          bot.position.y = worldY;
          bot.velocity.y = 0;
        }
      } else {
        bot.position.y = worldY + (bot.isCrouching ? -0.3 : Math.sin(Date.now() * 0.005 + bot.id.charCodeAt(0)) * 0.025);
        bot.velocity.y = 0;
      }
      bot.shadowMesh.position.set(bot.position.x, bot.position.y + 0.05, bot.position.z);

      // Procedural AI Jump over barriers, stairs, and to dodge bullets!
      if (bot.state !== 'knocked' && Math.random() < 0.012 && bot.position.y <= worldY + 0.1) {
        bot.velocity.y = 5.2; // Perform jump!
      }

      // KNOCKED STATE (Downed, crawling on knees/hands)
      if (bot.state === 'knocked') {
        bot.knockedIndicator.visible = true;
        // Pulse knocked indicator
        const scale = 1 + Math.sin(Date.now() * 0.008) * 0.15;
        bot.knockedIndicator.scale.set(scale, scale, scale);

        // Crawl slowly away from gunfire towards nearest cover
        bot.position.x += Math.sin(bot.rotationY) * 1.1 * dt;
        bot.position.z += Math.cos(bot.rotationY) * 1.1 * dt;
        resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);

        // Bleed out slowly over time
        bot.knockedHealth -= 1.2 * dt;
        if (bot.knockedHealth <= 0) {
          this.killBot(bot, 'Bleed Out', 'PlayZone', false, false);
        }
        continue;
      } else {
        bot.knockedIndicator.visible = false;
      }

      // Check Blue Zone damage
      const distToZoneCenter = Math.hypot(bot.position.x - safeCenterX, bot.position.z - safeCenterZ);
      // 6. ZONE SURVIVAL (BOTS MUST NEVER STAY IN THE BLUE ZONE!)
      const isInBlueZone = distToZoneCenter > blueRadius;
      
      if (isInBlueZone) {
        bot.health -= 2.0 * dt; // Fair blue zone damage for bots
        
        // IMMEDIATE FLEE BEHAVIOR
        if (bot.state !== 'fleeing_zone') {
          bot.state = 'fleeing_zone';
          // Aim for center of safe zone
          bot.targetPosition.set(safeCenterX, 0, safeCenterZ);
        }
      }

      // Timers update
      bot.stateTimer -= dt;
      bot.shootCooldown -= dt;
      bot.jiggleTimer += dt;
      bot.crouchTimer -= dt;

      // 4. SCAN FOR OPPONENTS: "when I land on the ground then enemies can fight to another or me"
      const isPlayerOnGround = (gamePhase === 'ground' || gamePhase === 'driving');
      if (!isPlayerOnGround) {
        // Player is still in the airplane, freefalling, or parachuting:
        // Hold fire! Enemies do NOT fight each other or the player until player touches down!
        if (bot.state === 'engaging') {
          bot.state = 'patrolling';
          bot.targetEnemy = null;
        }
        continue;
      }

      const distToPlayer = bot.position.distanceTo(playerPos);
      let foundOpponentPos: THREE.Vector3 | null = null;
      let foundOpponentId: string | null = null;
      let foundOpponentType: 'player' | 'bot' = 'bot';
      let shortestDist = 120; // 120m detection radius

      // If player is inside a building shelter, immediately break lock!
      if (bot.targetEnemy === 'player' && isPlayerInside) {
        bot.targetEnemy = null;
        if (bot.state === 'engaging') {
          bot.state = 'patrolling';
        }
      }

      // 1. SCAN FOR OTHER ENEMY BOTS (FROM RIVAL TEAMS)
      for (let j = 0; j < activeBots.length; j++) {
        const other = activeBots[j];
        if (i === j) continue;
        // Do not target own duo partner
        if (bot.duoId !== undefined && other.duoId !== undefined && bot.duoId === other.duoId) continue;
        if (other.state === 'dead' || other.state === 'in_plane' || other.state === 'knocked') continue;

        const d = bot.position.distanceTo(other.position);
        if (d > 120) continue;

        const stickiness = (bot.targetEnemy === other.id) ? -20 : 0;
        if (d + stickiness < shortestDist) {
          const hasSightToOther = checkLineOfSight(bot.position, other.position, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);
          if (hasSightToOther) {
            shortestDist = d + stickiness;
            foundOpponentPos = other.position;
            foundOpponentId = other.id;
            foundOpponentType = 'bot';
          }
        }
      }

      // 2. SCAN FOR PLAYER (ENEMIES TARGET & HIT PLAYER ONCE PLAYER IS ON THE GROUND)
      const isPlayerTargetable = playerHealth > 0 && 
                                 isPlayerOnGround && 
                                 !isPlayerInside;

      if (isPlayerTargetable && distToPlayer <= 120.0) {
        const botEyePos = new THREE.Vector3(bot.position.x, bot.position.y + 1.6, bot.position.z);
        const playerTargetHeight = isPlayerCrouched ? 0.8 : 1.6;
        const playerEyePos = new THREE.Vector3(playerPos.x, playerPos.y + playerTargetHeight, playerPos.z);
        const stickiness = (bot.targetEnemy === 'player') ? -25 : 0;

        if (distToPlayer + stickiness < shortestDist) {
          const hasSightToPlayer = checkLineOfSight(botEyePos, playerEyePos, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);
          if (hasSightToPlayer) {
            shortestDist = distToPlayer + stickiness;
            foundOpponentPos = playerPos;
            foundOpponentId = 'player';
            foundOpponentType = 'player';
          }
        }
      }

      // Switch to engaging or update target
      if (foundOpponentPos && foundOpponentId) {
        if (bot.health < 30 && foundOpponentId !== 'player') {
          bot.state = 'flee';
          // Run away from threat towards nearest POI building or terrain cover
          const runAngle = Math.atan2(bot.position.x - foundOpponentPos.x, bot.position.z - foundOpponentPos.z);
          bot.targetPosition.set(
            bot.position.x + Math.sin(runAngle) * 60,
            0,
            bot.position.z + Math.cos(runAngle) * 60
          );
          bot.stateTimer = 5.0;
        } else if (bot.state !== 'engaging' || bot.targetEnemy !== foundOpponentId) {
          bot.state = 'engaging';
          bot.targetEnemy = foundOpponentId;
          bot.targetEnemyType = foundOpponentType;
          // Human-like reaction delay: when acquiring player, give 1.6 - 2.2s before opening fire so player is never beamed instantly!
          bot.reactionTimer = foundOpponentType === 'player' ? (1.6 + Math.random() * 0.6) : (0.3 + Math.random() * 0.3);
          bot.burstTimer = 0.45;
        }
      }

      // 5b. FLEE STATE: Run away from player/enemies when health < 30%
      if (bot.state === 'flee') {
        if (bot.health >= 35 || bot.stateTimer <= 0) {
          bot.state = 'patrolling';
          bot.stateTimer = 6;
          continue;
        }

        bot.stateTimer -= dt;
        const fdx = bot.targetPosition.x - bot.position.x;
        const fdz = bot.targetPosition.z - bot.position.z;
        const fdist = Math.hypot(fdx, fdz);

        if (fdist > 3) {
          bot.rotationY = Math.atan2(fdx, fdz);
          bot.mesh.rotation.y = bot.rotationY;
          bot.position.x += (fdx / fdist) * 6.8 * dt; // Fast sprint away
          bot.position.z += (fdz / fdist) * 6.8 * dt;
          resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);
        } else {
          // Reached cover position, hide and patrol locally
          bot.state = 'patrolling';
          bot.stateTimer = 4;
        }
        this.processBotFootstep(bot, dt, playerPos, playerYaw, true);
        continue;
      }

      // 5. COMBAT BEHAVIOR: PRO BGMI JIGGLE STRAFE & FIRE BURSTS
      if (bot.state === 'engaging') {
        // PROS prioritize moving to safety over everything if taking damage!
        if (isInBlueZone) {
          bot.state = 'fleeing_zone';
          bot.targetPosition.set(safeCenterX + (Math.random() - 0.5) * 40, 0, safeCenterZ + (Math.random() - 0.5) * 40);
          continue;
        }

        let enemyPos: THREE.Vector3 | null = null;
        let isEnemyValid = false;

        if (bot.targetEnemy === 'player') {
          if (playerHealth > 0 && !isPlayerInside) {
            enemyPos = playerPos;
            isEnemyValid = true;
          }
        } else if (bot.targetEnemy) {
          const other = activeBots.find(b => b.id === bot.targetEnemy && b.state !== 'dead');
          if (other) {
            enemyPos = other.position;
            isEnemyValid = true;
          }
        }

        if (!isEnemyValid || !enemyPos) {
          // Target lost or eliminated! Return to patrolling / searching
          bot.state = 'patrolling';
          bot.targetEnemy = null;
          bot.stateTimer = 5;
          continue;
        }

        const distToEnemy = bot.position.distanceTo(enemyPos);

        // Turn towards target
        const dx = enemyPos.x - bot.position.x;
        const dz = enemyPos.z - bot.position.z;
        bot.rotationY = Math.atan2(dx, dz);
        bot.mesh.rotation.y = bot.rotationY;

        // BGMI Pro JIGGLE STRAFE:
        // Strafe left and right perpendicular to look angle while aiming!
        if (bot.jiggleTimer > 0.35) {
          bot.jiggleTimer = 0;
          bot.jiggleDirection *= -1; // Rapid left-right jiggle
          if (Math.random() > 0.6) {
            bot.isCrouching = !bot.isCrouching;
            bot.mesh.position.y = worldY + (bot.isCrouching ? -0.35 : 0);
          }
        }

        // Perpendicular movement vector (tangent)
        const perpX = -Math.cos(bot.rotationY) * bot.jiggleDirection;
        const perpZ = Math.sin(bot.rotationY) * bot.jiggleDirection;
        const jiggleSpeed = 5.5;

        // Advance or back up slightly based on distance
        let forwardSpeed = 0;
        if (bot.targetEnemy === 'player') {
          if (distToEnemy > 30) {
            forwardSpeed = 4.2; // Push towards player
          } else if (distToEnemy < 8) {
            forwardSpeed = -1.5;
          }
        } else if (bot.health < 35) {
          forwardSpeed = -5.5; // Retreat away from danger to seek cover!
        } else if (distToEnemy > 35) {
          forwardSpeed = 3.2; // Close in
        } else if (distToEnemy < 10) {
          forwardSpeed = -2.0; // Back up to maintain weapon range
        }

        // Normal combat movement
        bot.position.x += (perpX * jiggleSpeed + Math.sin(bot.rotationY) * forwardSpeed) * dt;
        bot.position.z += (perpZ * jiggleSpeed + Math.cos(bot.rotationY) * forwardSpeed) * dt;
        resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);

        // Dynamic leg animation and subtle idle breathing
        bot.walkTimer += dt * 10;
        bot.leftLeg.rotation.x = Math.sin(bot.walkTimer) * 0.45;
        bot.rightLeg.rotation.x = -Math.sin(bot.walkTimer) * 0.45;

        // Reaction timer ticks down
        if (bot.reactionTimer > 0) {
          bot.reactionTimer -= dt;
        }

        // BURST MODE FIRE AT PLAYER ONLY IF NO BOT CAN BE FOUND AND REACTION DELAY HAS ELAPSED
        if (bot.targetEnemy === 'player' && distToEnemy < 120) {
          if (isPlayerInside || !isPlayerOnGround) {
            // Player is inside home shelter or not on ground: cannot target
            bot.targetEnemy = null;
            bot.state = 'patrolling';
          } else if (bot.reactionTimer <= 0) {
            // Reaction delay passed: bot can open fire in controlled bursts
            bot.burstTimer -= dt;
            if (bot.burstTimer <= 0) {
              bot.burstTimer = 0.35; // Controlled burst cadence

              const bEyePos = new THREE.Vector3(bot.position.x, bot.position.y + 1.6, bot.position.z);
              const pTargetHeight = isPlayerCrouched ? 0.8 : 1.6;
              const pEyePos = new THREE.Vector3(playerPos.x, playerPos.y + pTargetHeight, playerPos.z);
              const hasSight = checkLineOfSight(bEyePos, pEyePos, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);

              if (hasSight) {
                sound.playGunshot(bot.weapon, true, distToPlayer);
                this.onSoundMade(bot.position, 'gunshot');
                this.notifySoundFired(bot.position, bot.id);

                let hitChance = 0.80;
                if (distToEnemy > 65) {
                  hitChance = 0.65;
                } else if (distToEnemy > 35) {
                  hitChance = 0.75;
                }

                const isHit = Math.random() < hitChance;
                const targetHitPos = isHit
                  ? pEyePos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2))
                  : pEyePos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.2));

                const botMuzzle = bot.position.clone().add(new THREE.Vector3(
                  Math.sin(bot.rotationY + 0.25) * 0.55,
                  1.35,
                  Math.cos(bot.rotationY + 0.25) * 0.55
                ));

                if (this.onBulletTracer) {
                  this.onBulletTracer(botMuzzle, targetHitPos, isHit);
                }

                if (isHit) {
                  // Player knocks down in 6 hits (100 HP / 6 = 16.67 damage per hit)
                  const rawDmg = 100 / 6;
                  onPlayerDamage(rawDmg, bot.name, bot.weapon);
                }
              }
            }
          }
        } else if (bot.targetEnemy !== 'player' && distToEnemy < 120) {
          // Bot vs Bot fight (disciplined burst with prolonged combat)
          if (bot.burstCount > 0) {
            bot.burstTimer -= dt;
            if (bot.burstTimer <= 0) {
              bot.burstCount--;
              bot.burstTimer = 0.22;

              sound.playGunshot(bot.weapon, true, distToPlayer);
              this.onSoundMade(bot.position, 'gunshot');
              this.notifySoundFired(bot.position, bot.id);

              const otherBot = activeBots.find((b) => b.id === bot.targetEnemy);
              if (otherBot) {
                const hasSight = checkLineOfSight(bot.position, otherBot.position, this.worldBuilder.colliders, this.worldBuilder.buildingBounds);
                if (hasSight) {
                  const botMuzzle = bot.position.clone().add(new THREE.Vector3(0, 1.4, 0));
                  const isHit = Math.random() < 0.42;
                  const otherTarget = isHit
                    ? otherBot.position.clone().add(new THREE.Vector3(0, 1.2, 0))
                    : otherBot.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.2, (Math.random() - 0.5) * 2.5));

                  if (this.onBulletTracer) {
                    this.onBulletTracer(botMuzzle, otherTarget, isHit);
                  }

                  if (isHit) {
                    const isHeadshot = Math.random() < 0.15;
                    const dmgPerShot = (14 + Math.floor(Math.random() * 5)) * (isHeadshot ? 1.5 : 1.0);
                    const result = this.damageBot(otherBot.id, dmgPerShot, isHeadshot, bot.name, bot.weaponDef.name);
                    if (result.isDead || result.isKnocked) {
                      bot.kills++;
                      bot.health = 100;
                      bot.state = 'patrolling';
                      bot.targetEnemy = null; // Target eliminated or knocked down: scan for next active opponent!
                      bot.stateTimer = 5.0 + Math.random() * 3.0;
                      bot.burstCount = 0;
                    }
                  }
                } else {
                  bot.burstCount = 0;
                }
              }

              if (bot.burstCount <= 0) {
                bot.shootCooldown = 2.0 + Math.random() * 1.5;
              }
            }
          } else if (bot.shootCooldown <= 0) {
            bot.burstCount = 3 + Math.floor(Math.random() * 2);
            bot.burstTimer = 0;
          }
        }

        if (distToEnemy > 100) {
          bot.state = 'patrolling';
          bot.targetEnemy = null;
          bot.stateTimer = 6;
        }
      }

      // 6. SEARCHING SOUND (Bot heard gunshots and is pushing to investigate!)
      else if (bot.state === 'searching_sound' && bot.soundSearchPos) {
        bot.soundSearchTimer -= dt;
        const sdx = bot.soundSearchPos.x - bot.position.x;
        const sdz = bot.soundSearchPos.z - bot.position.z;
        const distToSound = Math.hypot(sdx, sdz);

        if (distToSound > 3.0 && bot.soundSearchTimer > 0) {
          bot.rotationY = Math.atan2(sdx, sdz);
          bot.mesh.rotation.y = bot.rotationY;
          const searchSpeed = 9.0;
          bot.position.x += Math.sin(bot.rotationY) * searchSpeed * dt;
          bot.position.z += Math.cos(bot.rotationY) * searchSpeed * dt;
          resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);
        } else {
          // Arrived at gunshot origin, scan around then return to patrol
          bot.state = 'patrolling';
          bot.soundSearchPos = null;
          bot.stateTimer = 6;
        }
      }

      // 7. PATROLLING / LOOTING / FLEEING ZONE
      else {
        if (bot.isOutsideGuard && bot.guardPosition && bot.state !== 'fleeing_zone') {
          bot.targetPosition.copy(bot.guardPosition);
        }

        if (bot.stateTimer <= 0) {
          // PRO-ACTIVE ZONE SURVIVAL: Move to safety BEFORE taking damage
          const distToZoneCenter = Math.hypot(bot.position.x - safeCenterX, bot.position.z - safeCenterZ);
          if (distToZoneCenter > blueRadius * 0.9) {
            bot.state = 'fleeing_zone';
            const rndAngle = Math.random() * Math.PI * 2;
            const rndR = Math.random() * (safeRadius * 0.4);
            bot.targetPosition.set(safeCenterX + Math.cos(rndAngle) * rndR, 0, safeCenterZ + Math.sin(rndAngle) * rndR);
            bot.stateTimer = 18;
          } else if (bot.isOutsideGuard && bot.guardPosition) {
            bot.state = 'patrolling';
            // Subtle local guard stance (within 3m of guard position)
            const rndAngle = Math.random() * Math.PI * 2;
            const wanderDist = Math.random() * 3.0;
            bot.targetPosition.set(
              bot.guardPosition.x + Math.cos(rndAngle) * wanderDist,
              0,
              bot.guardPosition.z + Math.sin(rndAngle) * wanderDist
            );
            bot.stateTimer = 6 + Math.random() * 4;
          } else {
            bot.state = Math.random() > 0.4 ? 'patrolling' : 'looting';
            const rndAngle = Math.random() * Math.PI * 2;
            const wanderDist = 25 + Math.random() * 45;
            bot.targetPosition.set(
              bot.position.x + Math.cos(rndAngle) * wanderDist,
              0,
              bot.position.z + Math.sin(rndAngle) * wanderDist
            );
            bot.stateTimer = 5 + Math.random() * 6;
          }
        }

        const tdx = bot.targetPosition.x - bot.position.x;
        const tdz = bot.targetPosition.z - bot.position.z;
        const distToTarget = Math.hypot(tdx, tdz);

        if (distToTarget > 2.0) {
          // PRO BOTS run fast!
          const moveSpeed = bot.state === 'fleeing_zone' ? 16.0 : 11.5;
          bot.rotationY = Math.atan2(tdx, tdz);
          bot.mesh.rotation.y = bot.rotationY;
          bot.position.x += Math.sin(bot.rotationY) * moveSpeed * dt;
          bot.position.z += Math.cos(bot.rotationY) * moveSpeed * dt;
          resolveHorizontalCollisions(bot.position, 0.45, 1.8, this.worldBuilder.colliders);

          bot.walkTimer += dt * 8;
          bot.leftLeg.rotation.x = Math.sin(bot.walkTimer) * 0.45;
          bot.rightLeg.rotation.x = -Math.sin(bot.walkTimer) * 0.45;
        } else {
          bot.leftLeg.rotation.x = 0;
          bot.rightLeg.rotation.x = 0;
        }
      }

      // 8. 3D Positional Footsteps for Bot Movement
      const movedDist = Math.hypot(bot.position.x - prevBotX, bot.position.z - prevBotZ);
      if (movedDist > 0.03 * dt && bot.state !== 'dead') {
        const isSprinting = (movedDist / dt) > 7.0;
        this.processBotFootstep(bot, dt, playerPos, playerYaw, isSprinting);
      }
    }
  }

  /**
   * Process rhythmic 3D positional footsteps for nearby enemy bots
   */
  private processBotFootstep(
    bot: BotInstance,
    dt: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    isSprinting: boolean
  ): void {
    const stepCadence = isSprinting ? 0.32 : 0.46;
    bot.footstepTimer -= dt;

    if (bot.footstepTimer <= 0) {
      bot.footstepTimer = stepCadence + (Math.random() - 0.5) * 0.04;

      const dist = bot.position.distanceTo(playerPos);
      if (dist <= 38.0) {
        // Calculate relative direction and stereo pan relative to player's look direction
        const toBotX = bot.position.x - playerPos.x;
        const toBotZ = bot.position.z - playerPos.z;
        const worldAngle = Math.atan2(toBotX, toBotZ);
        let relAngle = worldAngle - playerYaw;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        const pan = Math.sin(relAngle);
        const isBehind = Math.cos(relAngle) < 0;

        // Surface detection: concrete if inside/near building, else grass
        const isNearBuilding = isPositionInsideBuilding(bot.position, this.worldBuilder.colliders);
        const surface = isNearBuilding ? 'concrete' : 'grass';

        // 1. Play 3D positional footstep sound with distance attenuation & stereo panning
        sound.playPositionalFootstep(dist, pan, surface, isSprinting, isBehind);

        // 2. Emit sound cue for HUD radar & minimap
        this.onSoundMade(bot.position, 'footstep');
      }
    }
  }

  /**
   * DAMAGE BOT: Takes 7 bullets to knock down (100 / 7 = 14.29 HP per hit)
   */
  public damageBot(
    botId: string,
    damage: number,
    isHeadshot: boolean,
    killerName = 'You',
    weaponUsed = 'M416'
  ): { isDead: boolean; isKnocked: boolean; remainingHealth: number } {
    const bot = this.bots.find(b => b.id === botId && b.state !== 'dead');
    if (!bot) return { isDead: true, isKnocked: false, remainingHealth: 0 };

    const isPlayerKiller = killerName === 'You' || killerName === 'Player';

    // If bot is already knocked down, damage its knockedHealth to finish it off
    if (bot.state === 'knocked') {
      bot.knockedHealth -= damage;
      if (bot.knockedHealth <= 0) {
        bot.knockedHealth = 0;
        this.killBot(bot, killerName, weaponUsed, isHeadshot, isPlayerKiller);
        return { isDead: true, isKnocked: false, remainingHealth: 0 };
      }
      return { isDead: false, isKnocked: true, remainingHealth: bot.knockedHealth };
    }

    // Normal state: reduce health (8 hits to knock down enemy when damage is 12.5)
    bot.health -= damage;
    if (bot.health <= 0) {
      bot.health = 0;

      // Check if duo partner is still alive!
      const partnerAlive = bot.duoId !== undefined && this.bots.some(b => b.id !== bot.id && b.duoId === bot.duoId && b.state !== 'dead');

      if (partnerAlive) {
        // Knock down the enemy bot!
        bot.state = 'knocked';
        bot.knockedHealth = 100;
        bot.targetEnemy = null;
        bot.mesh.position.y -= 0.6;
        bot.mesh.rotation.x = Math.PI / 4;
        if (bot.knockedIndicator) bot.knockedIndicator.visible = true;

        this.onKillFeed({
          id: `knock_${Date.now()}_${Math.random()}`,
          killer: killerName,
          victim: bot.name,
          weapon: weaponUsed,
          isHeadshot,
          isPlayerKiller,
          isPlayerVictim: false,
          isKnockout: true,
          timestamp: Date.now(),
        });

        return { isDead: false, isKnocked: true, remainingHealth: 0 };
      } else {
        // No living partner left -> direct elimination!
        this.killBot(bot, killerName, weaponUsed, isHeadshot, isPlayerKiller);
        return { isDead: true, isKnocked: false, remainingHealth: 0 };
      }
    }

    return { isDead: false, isKnocked: false, remainingHealth: bot.health };
  }

  private killBot(
    bot: BotInstance,
    killerName: string,
    weaponName: string,
    isHeadshot: boolean,
    isPlayerKiller: boolean
  ): void {
    if (bot.state === 'dead') return;
    bot.state = 'dead';
    this.scene.remove(bot.mesh);
    this.scene.remove(bot.shadowMesh);

    this.spawnDeathCrate(bot);

    this.onKillFeed({
      id: `kill_${Date.now()}_${Math.random()}`,
      killer: killerName,
      victim: bot.name,
      weapon: weaponName,
      isHeadshot,
      isPlayerKiller,
      isPlayerVictim: false,
      timestamp: Date.now(),
    });

    // If duo partner was already knocked down, eliminate them immediately (Duo wipe)
    if (bot.duoId !== undefined) {
      const knockedPartner = this.bots.find(b => b.id !== bot.id && b.duoId === bot.duoId && b.state === 'knocked');
      if (knockedPartner) {
        this.killBot(knockedPartner, killerName, 'Duo Wipeout', false, isPlayerKiller);
      }
    }
  }

  private spawnDeathCrate(bot: BotInstance): void {
    const y = getTerrainHeight(bot.position.x, bot.position.z);
    const crateGroup = new THREE.Group();
    crateGroup.position.set(bot.position.x, y + 0.3, bot.position.z);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.6, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x5a4630 })
    );
    crateGroup.add(box);

    this.scene.add(crateGroup);

    this.worldBuilder.lootItems.push({
      id: `deathcrate_gun_${bot.id}`,
      type: 'weapon',
      itemId: bot.weapon,
      name: bot.weaponDef.name,
      amount: 1,
      position: crateGroup.position,
    });
    this.worldBuilder.lootItems.push({
      id: `deathcrate_ammo_${bot.id}`,
      type: 'ammo',
      itemId: bot.weaponDef.ammoType || '5.56mm',
      name: `${bot.weaponDef.ammoType || '5.56mm'} Ammo (60)`,
      amount: 60,
      position: crateGroup.position,
    });
    this.worldBuilder.lootItems.push({
      id: `deathcrate_med_${bot.id}`,
      type: 'consumable',
      itemId: 'first_aid',
      name: 'First Aid Kit',
      amount: 1,
      position: crateGroup.position,
    });
  }

  public spawnFreshEnemyNear(playerPos: THREE.Vector3): void {
    const weaponsPool: WeaponId[] = ['m4'];
    const assignedWeapon = weaponsPool[Math.floor(Math.random() * weaponsPool.length)];
    const weaponDef = WEAPON_DEFS[assignedWeapon];
    const botIndex = this.bots.length + 1;
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_Target';

    const { botMesh, parachuteMesh, shadowMesh, knockedIndicator, leftLeg, rightLeg } = this.createBotMesh();
    botMesh.visible = true;
    shadowMesh.visible = true;
    knockedIndicator.visible = false;
    this.scene.add(botMesh);
    this.scene.add(shadowMesh);

    // Spawn 35-50 meters away from player
    const angle = Math.random() * Math.PI * 2;
    const dist = 35 + Math.random() * 25;
    const rx = playerPos.x + Math.cos(angle) * dist;
    const rz = playerPos.z + Math.sin(angle) * dist;
    const groundY = resolveWorldHeight(new THREE.Vector3(rx, 0, rz), getTerrainHeight, this.worldBuilder.colliders);

    botMesh.position.set(rx, groundY, rz);
    shadowMesh.position.set(rx, groundY + 0.05, rz);

    const bot: BotInstance = {
      id: `bot_fresh_${Date.now()}_${botIndex}`,
      name,
      position: botMesh.position,
      velocity: new THREE.Vector3(0, 0, 0),
      targetPosition: playerPos.clone(),
      dropZ: 0,
      hasDropped: true,
      rotationY: Math.random() * Math.PI * 2,
      health: 100,
      maxHealth: 100,
      knockedHealth: 100,
      armorLevel: 2,
      helmetLevel: 2,
      weapon: assignedWeapon,
      weaponDef,
      state: 'engaging',
      stateTimer: 10,
      shootCooldown: 0,
      reactionTimer: 0,
      targetEnemy: 'player',
      targetEnemyType: 'player',
      kills: 0,
      jiggleTimer: 0,
      jiggleDirection: 1,
      isCrouching: false,
      crouchTimer: 0,
      soundSearchPos: null,
      soundSearchTimer: 0,
      burstCount: 0,
      burstTimer: 0,
      activeVehicleId: null,
      mesh: botMesh,
      parachuteMesh,
      shadowMesh,
      knockedIndicator,
      leftLeg,
      rightLeg,
      walkTimer: 0,
      footstepTimer: 0,
    };

    this.bots.push(bot);
  }

  /**
   * Drops fresh reinforcement bots into the safe zone to ensure the match stays active and populated!
   */
  public spawnSafeZoneReinforcements(
    safeCenterX: number,
    safeCenterZ: number,
    safeRadius: number,
    count: number
  ): void {
    const weaponsPool: WeaponId[] = ['m4'];

    for (let i = 0; i < count; i++) {
      const assignedWeapon = weaponsPool[Math.floor(Math.random() * weaponsPool.length)];
      const weaponDef = WEAPON_DEFS[assignedWeapon];
      const botIndex = this.bots.length + 1;
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + `_${botIndex}`;

      const { botMesh, parachuteMesh, shadowMesh, knockedIndicator, leftLeg, rightLeg } = this.createBotMesh();
      botMesh.visible = true;
      shadowMesh.visible = true;
      knockedIndicator.visible = false;
      parachuteMesh.visible = false; // Directly on the ground without parachute
      this.scene.add(botMesh);
      this.scene.add(shadowMesh);

      // Target position directly within the safe zone
      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * Math.max(25, safeRadius * 0.65);
      const targetX = safeCenterX + Math.cos(angle) * dist;
      const targetZ = safeCenterZ + Math.sin(angle) * dist;
      const groundY = resolveWorldHeight(new THREE.Vector3(targetX, 0, targetZ), getTerrainHeight, this.worldBuilder.colliders);

      // Position directly on the ground
      botMesh.position.set(targetX, groundY, targetZ);
      shadowMesh.position.set(targetX, groundY + 0.05, targetZ);

      const bot: BotInstance = {
        id: `bot_reinforce_${Date.now()}_${botIndex}_${i}`,
        name,
        position: botMesh.position,
        velocity: new THREE.Vector3(0, 0, 0),
        targetPosition: new THREE.Vector3(targetX + (Math.random() - 0.5) * 25, groundY, targetZ + (Math.random() - 0.5) * 25),
        dropZ: 0,
        hasDropped: true,
        rotationY: Math.random() * Math.PI * 2,
        health: 100,
        maxHealth: 100,
        knockedHealth: 100,
        armorLevel: 2,
        helmetLevel: 2,
        weapon: assignedWeapon,
        weaponDef,
        state: 'patrolling', // Directly patrolling on the ground
        stateTimer: 6,
        shootCooldown: 1.5,
        reactionTimer: 1.5,
        targetEnemy: null,
        targetEnemyType: 'player',
        kills: 0,
        jiggleTimer: 0,
        jiggleDirection: 1,
        isCrouching: false,
        crouchTimer: 0,
        soundSearchPos: null,
        soundSearchTimer: 0,
        burstCount: 0,
        burstTimer: 0,
        activeVehicleId: null,
        mesh: botMesh,
        parachuteMesh,
        shadowMesh,
        knockedIndicator,
        leftLeg,
        rightLeg,
        walkTimer: 0,
        footstepTimer: 0,
      };

      botMesh.rotation.y = bot.rotationY;

      this.bots.push(bot);
    }
  }

  public cleanupAndReplaceUnfindable(_playerPos: THREE.Vector3): void {
    // Enemies do not respawn once dead
  }

  public getAliveCount(): number {
    return this.bots.filter(b => b.state !== 'dead').length;
  }
}
