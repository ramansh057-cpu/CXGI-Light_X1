/**
 * Squad Teammates Manager for BGMI
 * Manages 3 autonomous AI teammates:
 * - #2 Alpha_99 (Assault - M416)
 * - #3 Phoenix (Heavy Assault - AKM)
 * - #4 Raptor (Marksman / Sniper - Kar98k)
 *
 * Teammates "do their own work":
 * - Drop from airplane and land strategically
 * - Spread out and loot compounds independently
 * - Scan 360° for enemies, call out directions ("Enemy spotted!")
 * - Engage enemies with BGMI jiggle peek strafing
 * - Knock & finish enemies (takes 4-5 bullets)
 * - Revive player and fellow squadmates when knocked down
 */

import * as THREE from 'three';
import { getTerrainHeight } from './terrain';
import { SquadMember, WeaponId, WEAPON_DEFS, KillFeedItem } from './types';
import { sound } from './audio';
import { BotManager, BotInstance } from './botAI';
import { resolveHorizontalCollisions, resolveWorldHeight, checkLineOfSight } from './physicsUtils';

export interface TeammateInstance {
  member: SquadMember;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  rotationY: number;
  mesh: THREE.Group;
  parachuteMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  overheadMarker: THREE.Mesh;
  knockedIndicator: THREE.Mesh;
  state:
    | 'in_plane'
    | 'freefall'
    | 'parachuting'
    | 'looting'
    | 'scouting'
    | 'engaging'
    | 'knocked'
    | 'reviving'
    | 'dead';
  knockedHealth: number; // 100 HP: takes 4-5 bullets to finish
  shootCooldown: number;
  jiggleTimer: number;
  jiggleDirection: number;
  // Auto-mode firing
  burstCount: number;
  burstTimer: number;
  stateTimer: number;
  revivingTarget: 'player' | TeammateInstance | null;
  reviveProgress: number; // 0 to 4 seconds
  role: 'assault' | 'flanker' | 'sniper';
  patrolOffset: { x: number; z: number };
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  walkTimer: number;
}

export class SquadManager {
  public teammates: TeammateInstance[] = [];
  private scene: THREE.Scene;
  private botManager: BotManager;
  private onSquadUpdate: (squad: SquadMember[]) => void;
  private onKillFeed: (item: KillFeedItem) => void;
  public onVoiceCallout?: (speaker: string, message: string) => void;

  constructor(
    scene: THREE.Scene,
    botManager: BotManager,
    onSquadUpdate: (squad: SquadMember[]) => void,
    onKillFeed: (item: KillFeedItem) => void,
    onVoiceCallout?: (speaker: string, message: string) => void
  ) {
    this.scene = scene;
    this.botManager = botManager;
    this.onSquadUpdate = onSquadUpdate;
    this.onKillFeed = onKillFeed;
    this.onVoiceCallout = onVoiceCallout;
  }

  public initTeammates(): void {
    const teammateConfigs = [
      {
        number: 2 as const,
        name: 'Phoenix',
        colorHex: 0x00f0ff, // Vibrant Cyan #2 for Duo Partner
        weapon: 'm4' as const,
        role: 'assault' as const,
        patrolOffset: { x: 10, z: 10 },
      },
    ];

    teammateConfigs.forEach((cfg) => {
      const { botMesh, parachuteMesh, shadowMesh, overheadMarker, knockedIndicator, leftLeg, rightLeg } =
        this.createTeammateMesh(cfg.number, cfg.colorHex);

      botMesh.visible = false;
      shadowMesh.visible = false;
      knockedIndicator.visible = false;
      this.scene.add(botMesh);
      this.scene.add(shadowMesh);

      const member: SquadMember = {
        id: `teammate_${cfg.number}`,
        name: cfg.name,
        number: cfg.number,
        isPlayer: false,
        health: 100,
        maxHealth: 100,
        isKnocked: false,
        isDead: false,
        kills: 0,
        weapon: cfg.weapon,
      };

      this.teammates.push({
        member,
        position: botMesh.position,
        targetPosition: new THREE.Vector3(),
        rotationY: 0,
        mesh: botMesh,
        parachuteMesh,
        shadowMesh,
        overheadMarker,
        knockedIndicator,
        state: 'in_plane',
        knockedHealth: 100,
        shootCooldown: 1.0,
        jiggleTimer: Math.random() * 2,
        jiggleDirection: Math.random() > 0.5 ? 1 : -1,
        burstCount: 0,
        burstTimer: 0,
        stateTimer: 6 + Math.random() * 6,
        revivingTarget: null,
        reviveProgress: 0,
        role: cfg.role,
        patrolOffset: cfg.patrolOffset,
        leftLeg,
        rightLeg,
        walkTimer: Math.random() * 10,
      });
    });

    this.notifySquadUpdate();
  }

  private createTeammateMesh(number: number, colorHex: number): {
    botMesh: THREE.Group;
    parachuteMesh: THREE.Mesh;
    shadowMesh: THREE.Mesh;
    overheadMarker: THREE.Mesh;
    knockedIndicator: THREE.Mesh;
    leftLeg: THREE.Mesh;
    rightLeg: THREE.Mesh;
  } {
    const botMesh = new THREE.Group();
    botMesh.scale.set(1.15, 1.35, 1.15); // Taller & bigger body scale

    // Friendly Uniform (Bright Neon Cyan / Electric Blue so teammates stand out brilliantly)
    const uniformMat = new THREE.MeshLambertMaterial({ color: 0x00f0ff });
    const vestMat = new THREE.MeshLambertMaterial({ color: 0x0088ff });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffd1a9 });
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0x00ffaa });
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Torso & Vest (Main Body - floating box/capsule style stretched vertically to be tall)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.35), uniformMat);
    torso.position.y = 1.3;
    botMesh.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.2, 0.38), vestMat);
    vest.position.y = 1.3;
    botMesh.add(vest);

    // Small Head & Helmet (Mounted high up on the tall torso)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), skinMat);
    head.position.y = 2.3;
    botMesh.add(head);

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

    // Floating Friendly Overhead Marker (Distinct numbered color pill)
    const markerGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12);
    markerGeo.rotateX(Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const overheadMarker = new THREE.Mesh(markerGeo, markerMat);
    overheadMarker.position.set(0, 2.95, 0);
    botMesh.add(overheadMarker);

    // Parachute (Bright sky blue canopy)
    const paraGeo = new THREE.SphereGeometry(2.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const paraMat = new THREE.MeshLambertMaterial({ color: 0x0284c7, side: THREE.DoubleSide });
    const parachuteMesh = new THREE.Mesh(paraGeo, paraMat);
    parachuteMesh.position.y = 3.2;
    parachuteMesh.visible = false;
    botMesh.add(parachuteMesh);

    // Ground Shadow Decal
    const shadowGeo = new THREE.CircleGeometry(0.65, 8);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);

    // Knocked Indicator (Pulsing Red Pill)
    const knockedGeo = new THREE.BoxGeometry(0.45, 0.18, 0.1);
    const knockedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const knockedIndicator = new THREE.Mesh(knockedGeo, knockedMat);
    knockedIndicator.position.set(0, 1.2, 0);
    knockedIndicator.visible = false;
    botMesh.add(knockedIndicator);

    // Disable frustum culling so teammates never disappear from screen due to camera angles or peripheral viewports!
    botMesh.traverse(child => {
      child.frustumCulled = false;
    });

    return { botMesh, parachuteMesh, shadowMesh, overheadMarker, knockedIndicator, leftLeg, rightLeg };
  }

  /**
   * When player jumps from airplane, teammates jump and disperse to compound!
   */
  public dropWithPlayer(playerPos: THREE.Vector3): void {
    this.teammates.forEach((tm, idx) => {
      if (tm.state === 'in_plane') {
        tm.state = 'freefall';
        tm.mesh.visible = true;
        tm.position.set(
          playerPos.x + (idx === 0 ? -6 : idx === 1 ? 6 : 0),
          playerPos.y - 2,
          playerPos.z - 4 - idx * 2
        );
      }
    });

    if (this.onVoiceCallout) {
      this.onVoiceCallout('Phoenix', 'Duo partner dropping in with you! Watch your six!');
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    playerHealth: number,
    isPlayerKnocked: boolean,
    safeCenterX: number,
    safeCenterZ: number,
    blueRadius: number,
    onPlayerRevivedByTeammate?: () => void
  ): void {
    const activeEnemyBots = this.botManager.bots.filter(b => b.state !== 'dead' && b.state !== 'in_plane');

    for (const tm of this.teammates) {
      if (tm.state === 'dead' || tm.state === 'in_plane') continue;

      const worldY = resolveWorldHeight(tm.position, getTerrainHeight, (this.botManager as any).worldBuilder.colliders);
      const terrainY = getTerrainHeight(tm.position.x, tm.position.z);
      tm.shadowMesh.position.set(tm.position.x, worldY + 0.05, tm.position.z);

      // Teammate Underground Fall Recall - respawn on terrain instead of falling forever!
      if (tm.state !== 'freefall' && tm.state !== 'parachuting' && tm.position.y < terrainY - 5.0) {
        tm.position.set(playerPos.x + tm.patrolOffset.x, terrainY + 2.0, playerPos.z + tm.patrolOffset.z);
        tm.mesh.position.copy(tm.position);
      }

      // 1. FREEFALL FROM AIRPLANE
      if (tm.state === 'freefall') {
        tm.position.y -= 36 * dt;
        // Glide towards independent landing zone around the compound
        const targetX = playerPos.x + tm.patrolOffset.x;
        const targetZ = playerPos.z + tm.patrolOffset.z;
        const tdx = targetX - tm.position.x;
        const tdz = targetZ - tm.position.z;
        const dist = Math.hypot(tdx, tdz);
        if (dist > 3) {
          tm.position.x += (tdx / dist) * 18 * dt;
          tm.position.z += (tdz / dist) * 18 * dt;
          resolveHorizontalCollisions(tm.position, 0.45, 1.8, (this.botManager as any).worldBuilder.colliders);
        }

        if (tm.position.y <= terrainY + 80) {
          tm.state = 'parachuting';
          tm.parachuteMesh.visible = true;
          tm.shadowMesh.visible = true;
        }
        continue;
      }

      // 2. PARACHUTING GLIDE
      if (tm.state === 'parachuting') {
        tm.position.y -= 11 * dt;
        const targetX = playerPos.x + tm.patrolOffset.x;
        const targetZ = playerPos.z + tm.patrolOffset.z;
        const tdx = targetX - tm.position.x;
        const tdz = targetZ - tm.position.z;
        const dist = Math.hypot(tdx, tdz);
        if (dist > 2) {
          tm.position.x += (tdx / dist) * 8 * dt;
          tm.position.z += (tdz / dist) * 8 * dt;
          resolveHorizontalCollisions(tm.position, 0.45, 1.8, (this.botManager as any).worldBuilder.colliders);
        }

        if (tm.position.y <= worldY + 0.5) {
          tm.position.y = worldY;
          tm.state = 'looting'; // First order of business: go loot!
          tm.parachuteMesh.visible = false;
          tm.stateTimer = 8 + Math.random() * 6;
        }
        continue;
      }

      // 3. KNOCKED OUT (Downed Crawling)
      if (tm.state === 'knocked') {
        tm.position.y = worldY;
        tm.knockedIndicator.visible = true;

        // Crawl slowly towards nearest safe squadmate or player
        const tdx = playerPos.x - tm.position.x;
        const tdz = playerPos.z - tm.position.z;
        const distToPlayer = Math.hypot(tdx, tdz);

        if (distToPlayer > 3.0) {
          tm.rotationY = Math.atan2(tdx, tdz);
          tm.mesh.rotation.y = tm.rotationY;
          tm.position.x += (tdx / distToPlayer) * 0.9 * dt;
          tm.position.z += (tdz / distToPlayer) * 0.9 * dt;
        }

        // Bleed out timer (takes long enough to be rescued)
        tm.knockedHealth -= 1.0 * dt;
        if (tm.knockedHealth <= 0) {
          this.eliminateTeammate(tm, 'Bleed Out');
        }
        continue;
      } else {
        tm.knockedIndicator.visible = false;
      }

      // Grounded state
      tm.position.y = worldY;
      tm.stateTimer -= dt;
      tm.shootCooldown -= dt;
      tm.jiggleTimer += dt;

      // Blue zone damage check
      const distToZoneCenter = Math.hypot(tm.position.x - safeCenterX, tm.position.z - safeCenterZ);
      if (distToZoneCenter > blueRadius) {
        this.damageTeammate(tm, 4 * dt, 'The Blue Zone', 'PlayZone');
        if (this.onVoiceCallout && Math.random() < 0.015) {
          this.onVoiceCallout(tm.member.name, "We're taking zone damage! Get to the safe zone!");
        }
      }

      // 4. PRIORITY 1: REVIVE KNOCKED SQUADMATE OR PLAYER!
      let needToRevive = false;

      // Check if Player is knocked down!
      if (isPlayerKnocked && playerHealth <= 0) {
        const distToKnockedPlayer = tm.position.distanceTo(playerPos);
        needToRevive = true;

        if (distToKnockedPlayer > 2.5) {
          // Rush to revive player
          const toP = playerPos.clone().sub(tm.position);
          tm.rotationY = Math.atan2(toP.x, toP.z);
          tm.mesh.rotation.y = tm.rotationY;
          const sprintSpeed = 6.2;
          tm.position.x += Math.sin(tm.rotationY) * sprintSpeed * dt;
          tm.position.z += Math.cos(tm.rotationY) * sprintSpeed * dt;
          resolveHorizontalCollisions(tm.position, 0.45, 1.8, (this.botManager as any).worldBuilder.colliders);
          tm.reviveProgress = 0;
        } else {
          // At player's side: channel revive!
          tm.state = 'reviving';
          tm.reviveProgress += dt;
          if (this.onVoiceCallout && Math.random() < 0.02) {
            this.onVoiceCallout(tm.member.name, 'Hold on, reviving you now!');
          }
          if (tm.reviveProgress >= 3.8) {
            // Player revived!
            tm.reviveProgress = 0;
            tm.state = 'scouting';
            if (onPlayerRevivedByTeammate) onPlayerRevivedByTeammate();
          }
        }
        continue;
      }

      // Check if another AI teammate is knocked down!
      const knockedSquadmate = this.teammates.find(t => t.state === 'knocked' && t.member.id !== tm.member.id);
      if (knockedSquadmate) {
        needToRevive = true;
        const toKnocked = knockedSquadmate.position.clone().sub(tm.position);
        const dist = toKnocked.length();

        if (dist > 2.2) {
          tm.rotationY = Math.atan2(toKnocked.x, toKnocked.z);
          tm.mesh.rotation.y = tm.rotationY;
          tm.position.x += Math.sin(tm.rotationY) * 5.5 * dt;
          tm.position.z += Math.cos(tm.rotationY) * 5.5 * dt;
          resolveHorizontalCollisions(tm.position, 0.45, 1.8, (this.botManager as any).worldBuilder.colliders);
        } else {
          // Channel revive squadmate
          knockedSquadmate.knockedHealth += 22 * dt;
          if (knockedSquadmate.knockedHealth >= 50) {
            this.reviveTeammate(knockedSquadmate);
          }
        }
        continue;
      }

      // 5. PRIORITY 2: COMBAT & TARGET ENGAGEMENT (JIGGLE PEEK SHOOTING)
      let closestEnemy: BotInstance | null = null;
      let closestDist = 95; // 95m engagement range

      for (const bot of activeEnemyBots) {
        if (bot.state === 'dead') continue;
        const dist = tm.position.distanceTo(bot.position);
        if (dist < closestDist) {
          closestDist = dist;
          closestEnemy = bot;
        }
      }

      if (closestEnemy) {
        tm.state = 'engaging';
        // Face enemy
        const bdx = closestEnemy.position.x - tm.position.x;
        const bdz = closestEnemy.position.z - tm.position.z;
        tm.rotationY = Math.atan2(bdx, bdz);
        tm.mesh.rotation.y = tm.rotationY;

        // BGMI Pro JIGGLE STRAFE:
        if (tm.jiggleTimer > 0.4) {
          tm.jiggleTimer = 0;
          tm.jiggleDirection *= -1;
        }
        const perpX = -Math.cos(tm.rotationY) * tm.jiggleDirection;
        const perpZ = Math.sin(tm.rotationY) * tm.jiggleDirection;
        const jiggleSpeed = 2.5;

        // Maintain good tactical range (20-40m)
        let fwd = 0;
        if (closestDist > 40) fwd = 2.0;
        else if (closestDist < 12) fwd = -1.5;

        tm.position.x += (perpX * jiggleSpeed + Math.sin(tm.rotationY) * fwd) * dt;
        tm.position.z += (perpZ * jiggleSpeed + Math.cos(tm.rotationY) * fwd) * dt;
        resolveHorizontalCollisions(tm.position, 0.45, 1.8, (this.botManager as any).worldBuilder.colliders);

        tm.walkTimer += dt * 10;
        tm.leftLeg.rotation.x = Math.sin(tm.walkTimer) * 0.45;
        tm.rightLeg.rotation.x = -Math.sin(tm.walkTimer) * 0.45;
        tm.mesh.position.y = worldY + Math.sin(Date.now() * 0.005 + tm.member.number) * 0.025;

        // Fire burst
        if (closestEnemy && closestDist < 95) {
          if (tm.burstCount > 0) {
            tm.burstTimer -= dt;
            if (tm.burstTimer <= 0) {
              // FIRE SINGLE ROUND IN AUTO SPRAY
              tm.burstCount--;
              tm.burstTimer = 0.1 + Math.random() * 0.05;

              sound.playGunshot(tm.member.weapon, true, tm.position.distanceTo(playerPos));
              this.botManager.notifySoundFired(tm.position, tm.member.id);

              if (this.onVoiceCallout && Math.random() < 0.04) {
                this.onVoiceCallout(tm.member.name, `Engaging enemy!`);
              }

              const hasSight = checkLineOfSight(tm.position, closestEnemy.position, (this.botManager as any).worldBuilder.colliders);
              if (hasSight) {
                const hitDamage = WEAPON_DEFS[tm.member.weapon].damage;
                const result = this.botManager.damageBot(
                  closestEnemy.id,
                  hitDamage,
                  Math.random() > 0.7, // Pro teammate headshot chance
                  tm.member.name,
                  WEAPON_DEFS[tm.member.weapon].name
                );

                if (result.isDead) {
                  tm.member.kills++;
                  this.notifySquadUpdate();
                  if (this.onVoiceCallout) {
                    this.onVoiceCallout(tm.member.name, 'Enemy eliminated!');
                  }
                  tm.burstCount = 0;
                } else if (result.isKnocked) {
                  if (this.onVoiceCallout) {
                    this.onVoiceCallout(tm.member.name, 'Enemy knocked down!');
                  }
                  tm.burstCount = 0;
                } else if (Math.random() < 0.22) {
                  this.damageTeammate(tm, 18, closestEnemy.name, closestEnemy.weaponDef.name);
                }
              } else {
                tm.burstCount = 0; // bullet hit wall
              }

              if (tm.burstCount === 0) {
                tm.shootCooldown = 1.3 + Math.random() * 0.8;
              }
            }
          } else if (tm.shootCooldown <= 0) {
            tm.burstCount = 3 + Math.floor(Math.random() * 4);
            tm.burstTimer = 0;
          }
        }
        continue;
      }

      // 6. PRIORITY 3: "DO THEIR OWN WORK" (Looting compounds, holding vantage points, scouting)
      if (tm.stateTimer <= 0) {
        const rand = Math.random();
        if (rand < 0.45) {
          tm.state = 'looting';
          // Wander to nearby compound structure
          const wanderAngle = Math.random() * Math.PI * 2;
          const wanderDist = 15 + Math.random() * 25;
          tm.targetPosition.set(
            playerPos.x + tm.patrolOffset.x + Math.cos(wanderAngle) * wanderDist,
            0,
            playerPos.z + tm.patrolOffset.z + Math.sin(wanderAngle) * wanderDist
          );
          tm.stateTimer = 7 + Math.random() * 5;
        } else {
          tm.state = 'scouting';
          // Guard an angle (North, East, South, West)
          const angle = (tm.member.number - 1) * (Math.PI / 2);
          tm.targetPosition.set(
            playerPos.x + Math.cos(angle) * (18 + Math.random() * 12),
            0,
            playerPos.z + Math.sin(angle) * (18 + Math.random() * 12)
          );
          tm.stateTimer = 8 + Math.random() * 6;
        }
      }

      // If player moves far away (> 50m), teammates autonomously relocate towards squad area
      const distToPlayer = tm.position.distanceTo(playerPos);
      let targetX = tm.targetPosition.x;
      let targetZ = tm.targetPosition.z;

      if (distToPlayer > 55) {
        // Regroup towards player's general perimeter
        targetX = playerPos.x + tm.patrolOffset.x;
        targetZ = playerPos.z + tm.patrolOffset.z;
      }

      const tdx = targetX - tm.position.x;
      const tdz = targetZ - tm.position.z;
      const distToGoal = Math.hypot(tdx, tdz);

      if (distToGoal > 2.0) {
        tm.rotationY = Math.atan2(tdx, tdz);
        tm.mesh.rotation.y = tm.rotationY;
        const moveSpeed = distToPlayer > 45 ? 9.2 : 6.8;
        tm.position.x += Math.sin(tm.rotationY) * moveSpeed * dt;
        tm.position.z += Math.cos(tm.rotationY) * moveSpeed * dt;
        resolveHorizontalCollisions(tm.position, 0.45, 1.8, (this.botManager as any).worldBuilder.colliders);

        tm.walkTimer += dt * 8;
        tm.leftLeg.rotation.x = Math.sin(tm.walkTimer) * 0.45;
        tm.rightLeg.rotation.x = -Math.sin(tm.walkTimer) * 0.45;
      } else {
        tm.leftLeg.rotation.x = 0;
        tm.rightLeg.rotation.x = 0;
      }
    }
  }

  /**
   * DAMAGE TEAMMATE: 4-5 bullets to knock down, 4-5 bullets to finish
   */
  public damageTeammate(tm: TeammateInstance, damage: number, attackerName: string, weaponName: string): void {
    if (tm.state === 'dead') return;

    if (tm.state === 'knocked') {
      // Takes 4-5 bullets to finish off knocked teammate
      tm.knockedHealth -= damage;
      if (tm.knockedHealth <= 0) {
        this.eliminateTeammate(tm, attackerName);
      }
      return;
    }

    // Normal state: takes 4-5 bullets to knock down
    tm.member.health -= damage;
    if (tm.member.health <= 0) {
      tm.member.health = 0;
      tm.member.isKnocked = true;
      tm.state = 'knocked';
      tm.knockedHealth = 100;

      // Lower torso to crawl on knees
      tm.mesh.position.y -= 0.6;
      tm.mesh.rotation.x = Math.PI / 4;

      if (this.onVoiceCallout) {
        this.onVoiceCallout(tm.member.name, "I'm knocked down! Need help!");
      }

      this.onKillFeed({
        id: `knock_${Date.now()}_${Math.random()}`,
        killer: attackerName,
        victim: tm.member.name,
        weapon: weaponName,
        isHeadshot: false,
        isPlayerKiller: false,
        isPlayerVictim: false,
        isKnockout: true,
        timestamp: Date.now(),
      });
    }

    this.notifySquadUpdate();
  }

  public reviveTeammate(tm: TeammateInstance): void {
    tm.member.health = 50;
    tm.member.isKnocked = false;
    tm.state = 'scouting';
    tm.mesh.rotation.x = 0;
    tm.knockedHealth = 100;
    if (this.onVoiceCallout) {
      this.onVoiceCallout(tm.member.name, "Thanks! I'm back up!");
    }
    this.notifySquadUpdate();
  }

  private eliminateTeammate(tm: TeammateInstance, killerName: string): void {
    tm.member.isDead = true;
    tm.member.isKnocked = false;
    tm.member.health = 0;
    tm.state = 'dead';
    this.scene.remove(tm.mesh);
    this.scene.remove(tm.shadowMesh);

    this.onKillFeed({
      id: `kill_${Date.now()}_${Math.random()}`,
      killer: killerName,
      victim: tm.member.name,
      weapon: 'Eliminated',
      isHeadshot: false,
      isPlayerKiller: false,
      isPlayerVictim: false,
      timestamp: Date.now(),
    });

    this.notifySquadUpdate();
  }

  public getKnockedTeammateNear(playerPos: THREE.Vector3, maxDist = 3.5): TeammateInstance | null {
    for (const tm of this.teammates) {
      if (tm.state === 'knocked' && tm.position.distanceTo(playerPos) < maxDist) {
        return tm;
      }
    }
    return null;
  }

  private notifySquadUpdate(): void {
    this.onSquadUpdate(this.teammates.map(t => ({ ...t.member })));
  }

  public getAliveTeammatesCount(): number {
    return this.teammates.filter(t => !t.member.isDead).length;
  }
}
