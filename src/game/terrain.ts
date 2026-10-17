/**
 * 1000m x 1000m Battlefield Island Terrain Engine
 * Coordinate space: X in [-500, 500], Z in [-500, 500]
 * Water level: Y = 2.0
 */

import * as THREE from 'three';
import { MAP_POIS, POILocation } from './types';

export const MAP_SIZE = 1000;
export const HALF_MAP = MAP_SIZE / 2; // 500
export const WATER_HEIGHT = 2.0;

// Road waypoint network connecting major settlements
export interface RoadSegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  width: number;
}

export const ROAD_NETWORK: RoadSegment[] = [
  // West-East Main Highway
  { startX: -880, startZ: 0, endX: -320, endZ: -120, width: 6 },
  { startX: -320, startZ: -120, endX: 0, endZ: 0, width: 6 },
  { startX: 0, startZ: 0, endX: 560, endZ: -160, width: 6 },
  { startX: 560, startZ: -160, endX: 720, endZ: 240, width: 6 },
  
  // North-South Arterial
  { startX: 0, startZ: -800, endX: -120, endZ: -400, width: 6 },
  { startX: -120, startZ: -400, endX: 0, endZ: 0, width: 6 },
  { startX: 0, startZ: 0, endX: 120, endZ: 320, width: 6 },
  { startX: 120, startZ: 320, endX: 440, endZ: 560, width: 6 }, // Highway across river to Military Base
  
  // North West branch to Georgepool
  { startX: -120, startZ: -400, endX: -640, endZ: -360, width: 5 },
  { startX: -640, startZ: -360, endX: -600, endZ: 80, width: 5 },
  { startX: -600, startZ: 80, endX: -440, endZ: 620, width: 5 },

  // North East branch to Shooting Range
  { startX: -120, startZ: -400, endX: 360, endZ: -640, width: 5 },
  { startX: 360, startZ: -640, endX: 560, endZ: -160, width: 5 },

  // Southern coastal route to Mylta and Lighthouse
  { startX: 720, endX: 760, startZ: 240, endZ: 720, width: 5 },
  { startX: 440, endX: 760, startZ: 560, endZ: 720, width: 5 },
];

/**
 * Returns height of terrain at coordinate (x, z)
 * Deterministic mathematical terrain synthesis
 */
export function getTerrainHeight(x: number, z: number): number {
  // Distance from map center
  const distFromCenter = Math.sqrt(x * x + z * z);
  
  // Outer ocean drop-off (island perimeter)
  const islandEdge = 950;
  if (distFromCenter > islandEdge) {
    const fade = (distFromCenter - islandEdge) / 20;
    return Math.max(0.5, WATER_HEIGHT - fade * 4);
  }

  // Create beautiful rolling hills, valleys, and sand beaches (reminiscent of BGMI's ridges)
  const hillNoise = Math.sin(x * 0.016) * Math.cos(z * 0.016) * 5.8 
                  + Math.sin(x * 0.006) * 3.5 
                  + Math.cos(z * 0.006) * 2.5;

  // Let's smooth and blend the terrain to flat (6.0m altitude) near POIs and roads for flawless collisions
  let blendFactor = 1.0;

  // 1. Flatten around POIs (cities, military bases, ruins, school)
  for (let p = 0; p < MAP_POIS.length; p++) {
    const poi = MAP_POIS[p];
    const dx = x - poi.x;
    const dz = z - poi.z;
    const dist = Math.hypot(dx, dz);
    if (dist < poi.radius + 30) {
      const poiBlend = Math.max(0, (dist - poi.radius) / 30);
      blendFactor = Math.min(blendFactor, poiBlend);
    }
  }

  // 2. Flatten around highways and roads for smooth driving/navigation
  for (let r = 0; r < ROAD_NETWORK.length; r++) {
    const road = ROAD_NETWORK[r];
    const dx = road.endX - road.startX;
    const dz = road.endZ - road.startZ;
    const lengthSq = dx * dx + dz * dz;
    let t = 0;
    if (lengthSq > 0) {
      t = Math.max(0, Math.min(1, ((x - road.startX) * dx + (z - road.startZ) * dz) / lengthSq));
    }
    const projX = road.startX + t * dx;
    const projZ = road.startZ + t * dz;
    const distToRoad = Math.hypot(x - projX, z - projZ);

    if (distToRoad < 22) {
      const roadBlend = Math.max(0, (distToRoad - road.width) / (22 - road.width));
      blendFactor = Math.min(blendFactor, roadBlend);
    }
  }

  // Combine flat base (6.0) with blended hills, clamp safely above water level in interior
  const targetHeight = 6.0 + hillNoise * blendFactor;
  return Math.max(3.8, targetHeight);
}

/**
 * Returns surface normal vector at (x, z)
 */
export function getTerrainNormal(x: number, z: number): THREE.Vector3 {
  const eps = 0.5;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);

  const normal = new THREE.Vector3(hL - hR, 2 * eps, hD - hU);
  normal.normalize();
  return normal;
}

/**
 * Distance from point (px, pz) to line segment (x1, z1)-(x2, z2)
 */
function distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(px - x1, pz - z1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lengthSq));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

/**
 * Check if a position is on or very near a road
 */
export function isNearRoad(x: number, z: number, threshold = 6): boolean {
  for (let r = 0; r < ROAD_NETWORK.length; r++) {
    const road = ROAD_NETWORK[r];
    if (distToSegment(x, z, road.startX, road.startZ, road.endX, road.endZ) < threshold) {
      return true;
    }
  }
  return false;
}
