/**
 * Vehicle Physics & Controller
 * Supports UAZ and Buggy with terrain slope alignment, wheel spin,
 * engine sound modulation, and roadkill impact checks.
 */

import * as THREE from 'three';
import { VehicleInstance } from './worldBuilder';
import { getTerrainHeight, getTerrainNormal } from './terrain';
import { sound } from './audio';

export interface VehicleInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  boost: boolean;
  horn: boolean;
}

export class VehicleController {
  public activeVehicle: VehicleInstance | null = null;
  private steerAngle = 0;
  private currentSpeed = 0; // m/s
  private maxForwardSpeed = 24; // ~86 km/h
  private maxReverseSpeed = -8;
  private acceleration = 14;
  private braking = 28;
  private friction = 6;
  private steerSpeed = 2.4;

  public enterVehicle(vehicle: VehicleInstance): void {
    this.activeVehicle = vehicle;
    vehicle.isOccupied = true;
    this.currentSpeed = 0;
    this.steerAngle = 0;
    sound.updateEngineSound(true, 0.1);
  }

  public exitVehicle(): { position: THREE.Vector3 } | null {
    if (!this.activeVehicle) return null;
    const v = this.activeVehicle;
    v.isOccupied = false;
    sound.updateEngineSound(false, 0);

    // Eject player to driver's side (left of vehicle)
    const exitPos = new THREE.Vector3(
      v.position.x - Math.cos(v.rotation.y) * 2.2,
      v.position.y + 0.2,
      v.position.z + Math.sin(v.rotation.y) * 2.2
    );

    this.activeVehicle = null;
    return { position: exitPos };
  }

  public update(dt: number, input: VehicleInput): void {
    if (!this.activeVehicle) return;

    const v = this.activeVehicle;
    const isBuggy = v.type === 'Buggy';
    const topSpeed = isBuggy ? (input.boost ? 30 : 25) : (input.boost ? 26 : 22);

    // 1. Acceleration / Braking
    if (input.forward) {
      this.currentSpeed = Math.min(topSpeed, this.currentSpeed + this.acceleration * dt);
    } else if (input.backward) {
      if (this.currentSpeed > 0.5) {
        this.currentSpeed = Math.max(0, this.currentSpeed - this.braking * dt);
      } else {
        this.currentSpeed = Math.max(this.maxReverseSpeed, this.currentSpeed - this.acceleration * 0.7 * dt);
      }
    } else {
      // Natural ground rolling friction
      if (this.currentSpeed > 0) {
        this.currentSpeed = Math.max(0, this.currentSpeed - this.friction * dt);
      } else if (this.currentSpeed < 0) {
        this.currentSpeed = Math.min(0, this.currentSpeed + this.friction * dt);
      }
    }

    if (input.handbrake) {
      this.currentSpeed *= Math.max(0, 1 - 5 * dt);
    }

    // 2. Steering
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, this.steerSpeed * dt * 4);

    if (Math.abs(this.currentSpeed) > 0.2) {
      const turnFactor = (this.currentSpeed / topSpeed) * (this.currentSpeed < 0 ? -1 : 1);
      v.rotation.y += this.steerAngle * turnFactor * (isBuggy ? 2.2 : 1.8) * dt;
    }

    // 3. Movement
    const forwardX = Math.sin(v.rotation.y);
    const forwardZ = Math.cos(v.rotation.y);

    v.position.x += forwardX * this.currentSpeed * dt;
    v.position.z += forwardZ * this.currentSpeed * dt;

    // Boundary clamp to map limits (-330 to 330)
    v.position.x = Math.max(-330, Math.min(330, v.position.x));
    v.position.z = Math.max(-330, Math.min(330, v.position.z));

    // 4. Terrain Height & Slope Alignment
    const terrainH = getTerrainHeight(v.position.x, v.position.z);
    v.position.y = THREE.MathUtils.lerp(v.position.y, terrainH + 0.65, 12 * dt);

    // Orient vehicle chassis with terrain normal
    const normal = getTerrainNormal(v.position.x, v.position.z);
    const pitch = -forwardZ * normal.x + forwardX * normal.z;
    const roll = forwardX * normal.x + forwardZ * normal.z;

    v.mesh.rotation.x = THREE.MathUtils.lerp(v.mesh.rotation.x, -pitch * 0.7, 8 * dt);
    v.mesh.rotation.z = THREE.MathUtils.lerp(v.mesh.rotation.z, roll * 0.7, 8 * dt);
    v.mesh.rotation.y = v.rotation.y;

    // 5. Spin Wheels
    const wheelSpinRate = (this.currentSpeed / 0.5) * dt;
    for (let i = 0; i < v.wheels.length; i++) {
      v.wheels[i].rotation.x += wheelSpinRate;
      // Front wheels turn with steering
      if (i < 2) {
        v.wheels[i].rotation.y = this.steerAngle * 0.5;
      }
    }

    // 6. Ground Shadow Decal
    if (v.shadowMesh) {
      v.shadowMesh.position.set(v.position.x, terrainH + 0.05, v.position.z);
      v.shadowMesh.rotation.z = v.rotation.y;
    }

    // 7. Audio & Horn
    const speedRatio = Math.abs(this.currentSpeed) / topSpeed;
    sound.updateEngineSound(true, speedRatio);

    if (input.horn) {
      sound.playHorn();
    }
  }

  public getSpeedKmh(): number {
    return Math.round(Math.abs(this.currentSpeed) * 3.6);
  }
}
