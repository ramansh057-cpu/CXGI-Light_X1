import * as THREE from 'three';
import { BuildingCollider } from './worldBuilder';

/**
 * Shared collision resolution for players and AI
 */
export function resolveHorizontalCollisions(
  pos: THREE.Vector3,
  radius: number,
  height: number,
  colliders: BuildingCollider[]
): void {
  const boundingBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(pos.x, pos.y + height / 2, pos.z),
    new THREE.Vector3(radius * 2, height, radius * 2)
  );

  for (const collider of colliders) {
    if (boundingBox.intersectsBox(collider.box)) {
      const overlapX = Math.min(boundingBox.max.x - collider.box.min.x, collider.box.max.x - boundingBox.min.x);
      const overlapZ = Math.min(boundingBox.max.z - collider.box.min.z, collider.box.max.z - boundingBox.min.z);

      if (overlapX < overlapZ) {
        pos.x += (pos.x > (collider.box.min.x + collider.box.max.x) / 2) ? overlapX : -overlapX;
      } else {
        pos.z += (pos.z > (collider.box.min.z + collider.box.max.z) / 2) ? overlapZ : -overlapZ;
      }
      
      // Sync boundingBox
      boundingBox.setFromCenterAndSize(
        new THREE.Vector3(pos.x, pos.y + height / 2, pos.z),
        new THREE.Vector3(radius * 2, height, radius * 2)
      );
    }
  }
}

/**
 * Detects height including terrain and building floors/stairs
 */
export function resolveWorldHeight(
  pos: THREE.Vector3,
  terrainHeightFunc: (x: number, z: number) => number,
  colliders: BuildingCollider[]
): number {
  const terrainY = terrainHeightFunc(pos.x, pos.z);
  let highestY = terrainY;

  // Probe slightly around player to find floor
  const probeBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(pos.x, pos.y + 0.5, pos.z),
    new THREE.Vector3(0.5, 1.2, 0.5)
  );

  for (const collider of colliders) {
    if (probeBox.intersectsBox(collider.box)) {
      // Only treat as floor if we are above the collider's top or within stepping height (0.5m)
      if (pos.y >= collider.box.max.y - 0.55) {
        highestY = Math.max(highestY, collider.box.max.y);
      }
    }
  }

  return highestY;
}

/**
 * Check if there is an unobstructed line of sight between two positions (bullet ray tracing)
 */
export function checkLineOfSight(
  from: THREE.Vector3,
  to: THREE.Vector3,
  colliders: BuildingCollider[]
): boolean {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  
  if (distance < 0.1) return true;
  direction.normalize();

  const ray = new THREE.Ray(from, direction);
  const intersectPoint = new THREE.Vector3();

  for (const col of colliders) {
    // Bullets are blocked by walls, buildings, crates, rocks, and fences
    if (col.type === 'wall' || col.type === 'building' || col.type === 'crate' || col.type === 'rock' || col.type === 'fence') {
      if (ray.intersectBox(col.box, intersectPoint)) {
        const hitDist = from.distanceTo(intersectPoint);
        // If the collider is closer than the target point, line of sight is blocked
        if (hitDist < distance - 0.25) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Check if a 3D coordinate is inside any building bounds (homes, school, barracks, church)
 */
export function isPositionInsideBuilding(pos: THREE.Vector3, colliders: BuildingCollider[]): boolean {
  for (const col of colliders) {
    if (col.type === 'building') {
      const minX = col.box.min.x - 0.5;
      const maxX = col.box.max.x + 0.5;
      const minZ = col.box.min.z - 0.5;
      const maxZ = col.box.max.z + 0.5;

      if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate a vector that pushes the character outside the nearest building boundaries into the open
 */
export function getVectorToOutside(pos: THREE.Vector3, colliders: BuildingCollider[]): THREE.Vector3 | null {
  for (const col of colliders) {
    if (col.type === 'building') {
      const minX = col.box.min.x - 0.5;
      const maxX = col.box.max.x + 0.5;
      const minZ = col.box.min.z - 0.5;
      const maxZ = col.box.max.z + 0.5;

      if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
        const centerX = (col.box.min.x + col.box.max.x) / 2;
        const centerZ = (col.box.min.z + col.box.max.z) / 2;
        
        const dir = new THREE.Vector3(pos.x - centerX, 0, pos.z - centerZ);
        if (dir.lengthSq() < 0.1) {
          dir.set(1, 0, 0);
        }
        dir.normalize();
        
        const halfWidth = (col.box.max.x - col.box.min.x) / 2;
        const halfDepth = (col.box.max.z - col.box.min.z) / 2;
        const safeDist = Math.max(halfWidth, halfDepth) + 6.0;
        
        return new THREE.Vector3(centerX + dir.x * safeDist, pos.y, centerZ + dir.z * safeDist);
      }
    }
  }
  return null;
}
