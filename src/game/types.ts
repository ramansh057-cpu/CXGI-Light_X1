/**
 * BGMI Game Types & Configuration
 * Map: 1000m x 1000m (-500 to +500)
 */

export type WeaponId = 'm416' | 'akm' | 'awm' | 'kar98k' | 's12k' | 'pan';

export type AmmoType = '5.56mm' | '7.62mm' | '300mag' | '12gauge';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  category: 'AR' | 'Sniper' | 'Shotgun' | 'Melee';
  ammoType?: AmmoType;
  magSize: number;
  damage: number;
  fireRate: number; // shots per second
  reloadTime: number; // seconds
  range: number; // meters
  recoilPitch: number;
  recoilYaw: number;
  bulletSpeed: number; // m/s
  scopeType: 'red_dot' | '4x' | '8x' | 'iron';
  zoomFov: number; // camera FOV when scoping
  description: string;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  m416: {
    id: 'm416',
    name: 'M416',
    category: 'AR',
    ammoType: '5.56mm',
    magSize: 30,
    damage: 20, // Exactly 5 bullets to eliminate (100 HP / 20 = 5 hits)
    fireRate: 11, // ~660 RPM
    reloadTime: 2.1,
    range: 300,
    recoilPitch: 0.018,
    recoilYaw: 0.009,
    bulletSpeed: 880,
    scopeType: '4x',
    zoomFov: 32,
    description: 'Versatile 5.56mm assault rifle. Takes exactly 5 accurate hits to knock/finish.',
  },
  akm: {
    id: 'akm',
    name: 'AKM',
    category: 'AR',
    ammoType: '7.62mm',
    magSize: 30,
    damage: 20, // Exactly 5 bullets to eliminate (100 HP / 20 = 5 hits)
    fireRate: 9.5,
    reloadTime: 2.4,
    range: 280,
    recoilPitch: 0.024,
    recoilYaw: 0.014,
    bulletSpeed: 715,
    scopeType: 'red_dot',
    zoomFov: 45,
    description: 'Heavy 7.62mm assault rifle. Exactly 5 hits to eliminate.',
  },
  awm: {
    id: 'awm',
    name: 'AWM',
    category: 'Sniper',
    ammoType: '300mag',
    magSize: 5,
    damage: 70, // 2-3 bullets or 1 clean headshot
    fireRate: 0.8,
    reloadTime: 3.5,
    range: 800,
    recoilPitch: 0.06,
    recoilYaw: 0.01,
    bulletSpeed: 940,
    scopeType: '8x',
    zoomFov: 14,
    description: 'Supply drop exclusive monster rifle. Extreme range with 8x sniper scope.',
  },
  kar98k: {
    id: 'kar98k',
    name: 'Kar98k',
    category: 'Sniper',
    ammoType: '7.62mm',
    magSize: 5,
    damage: 48, // 2-3 bullets to knock
    fireRate: 0.9,
    reloadTime: 3.2,
    range: 500,
    recoilPitch: 0.05,
    recoilYaw: 0.012,
    bulletSpeed: 760,
    scopeType: '4x',
    zoomFov: 24,
    description: 'Classic bolt-action sniper rifle.',
  },
  s12k: {
    id: 's12k',
    name: 'S12K',
    category: 'Shotgun',
    ammoType: '12gauge',
    magSize: 8,
    damage: 14 * 6, // 6 pellets at 14 dmg each
    fireRate: 3.2,
    reloadTime: 2.8,
    range: 50,
    recoilPitch: 0.05,
    recoilYaw: 0.02,
    bulletSpeed: 350,
    scopeType: 'iron',
    zoomFov: 55,
    description: 'Semi-automatic 12-gauge combat shotgun for close-quarters cleanup.',
  },
  pan: {
    id: 'pan',
    name: 'Cast Iron Pan',
    category: 'Melee',
    magSize: 1,
    damage: 45,
    fireRate: 1.5,
    reloadTime: 0.1,
    range: 3,
    recoilPitch: 0,
    recoilYaw: 0,
    bulletSpeed: 0,
    scopeType: 'iron',
    zoomFov: 60,
    description: 'Iconic melee weapon that deflects bullets hitting your lower back!',
  },
};

export type ConsumableType = 'first_aid' | 'medkit' | 'energy_drink' | 'painkiller' | 'bandage';

export interface ConsumableDef {
  id: ConsumableType;
  name: string;
  healAmount: number;
  boostAmount: number;
  useTime: number; // seconds
  maxHealLimit: number; // max health it can reach (e.g. 75 for first aid)
}

export const CONSUMABLE_DEFS: Record<ConsumableType, ConsumableDef> = {
  first_aid: {
    id: 'first_aid',
    name: 'First Aid Kit',
    healAmount: 75,
    boostAmount: 0,
    useTime: 3.0,
    maxHealLimit: 75,
  },
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    healAmount: 100,
    boostAmount: 0,
    useTime: 4.5,
    maxHealLimit: 100,
  },
  energy_drink: {
    id: 'energy_drink',
    name: 'Energy Drink',
    healAmount: 0,
    boostAmount: 40,
    useTime: 2.0,
    maxHealLimit: 100,
  },
  painkiller: {
    id: 'painkiller',
    name: 'Painkiller',
    healAmount: 0,
    boostAmount: 60,
    useTime: 2.5,
    maxHealLimit: 100,
  },
  bandage: {
    id: 'bandage',
    name: 'Bandage',
    healAmount: 10,
    boostAmount: 0,
    useTime: 1.5,
    maxHealLimit: 75,
  },
};

export interface InventoryState {
  ammo: Record<AmmoType, number>;
  consumables: Record<ConsumableType, number>;
  helmetLevel: 0 | 1 | 2 | 3;
  armorLevel: 0 | 1 | 2 | 3;
  backpackLevel: 1 | 2 | 3;
  weapon1: WeaponId | null;
  weapon1Ammo: number;
  weapon2: WeaponId | null;
  weapon2Ammo: number;
  melee: WeaponId | null;
  activeSlot: 1 | 2 | 3; // 1: weapon1, 2: weapon2, 3: melee
}

export interface SoundIndicator {
  id: string;
  type: 'gunshot' | 'footstep' | 'vehicle';
  angle: number; // direction relative to player look (-PI to PI, 0 is center/forward)
  distance?: number; // distance in meters from player
  worldBearing?: number; // 0 to 360 degrees world compass heading
  intensity: number;
  expiresAt: number;
}

export interface SquadMember {
  id: string;
  name: string;
  number: 1 | 2 | 3 | 4;
  isPlayer: boolean;
  health: number;
  maxHealth: number;
  isKnocked: boolean;
  isDead: boolean;
  kills: number;
  weapon: WeaponId;
}

export interface KillFeedItem {
  id: string;
  killer: string;
  victim: string;
  weapon: string;
  isHeadshot: boolean;
  isPlayerKiller: boolean;
  isPlayerVictim: boolean;
  isKnockout?: boolean;
  timestamp: number;
}

export interface RadarBotInfo {
  id: string;
  x: number;
  z: number;
  isKnocked: boolean;
  isTeammate: boolean;
}

export interface POILocation {
  name: string;
  x: number;
  z: number;
  radius: number;
  type: 'city' | 'military' | 'residential' | 'ruins' | 'port' | 'compound';
}

export const MAP_POIS: POILocation[] = [
  { name: 'Pecado (Center)', x: 0, z: 0, radius: 75, type: 'city' },
  { name: 'Los Leones', x: 180, z: 220, radius: 90, type: 'city' },
  { name: 'San Martin Suburbs', x: -100, z: -180, radius: 70, type: 'residential' },
  { name: 'El Pozo Industrial', x: -220, z: -130, radius: 75, type: 'port' },
  { name: 'Ruins Plateau', x: -180, z: 130, radius: 60, type: 'ruins' },
  { name: 'Hacienda del Patron', x: -220, z: 40, radius: 55, type: 'city' },
  { name: 'Military Camp', x: 130, z: -220, radius: 55, type: 'military' },
  { name: 'Minas de Carbón', x: 220, z: -90, radius: 55, type: 'compound' },
  { name: 'Chumacera Valley', x: -130, z: -40, radius: 60, type: 'residential' },
  { name: 'Valle del Mar', x: 220, z: 180, radius: 45, type: 'compound' },
];

export interface SafeZoneState {
  centerX: number;
  centerZ: number;
  currentRadius: number;
  targetCenterX: number;
  targetCenterZ: number;
  targetRadius: number;
  blueRadius: number;
  phase: number;
  totalPhases: number;
  timeRemaining: number;
  phaseDuration: number;
  isShrinking: boolean;
  damagePerSec: number;
}

export interface GraphicSettings {
  shadowMode: 'simple_blob' | 'directional_fast' | 'off';
  renderScale: 0.5 | 0.65 | 0.75 | 1.0;
  targetFps: 30 | 60 | 0; // 0 for uncapped
  drawDistance: 350 | 600 | 900;
  showTouchControls: boolean;
  showMinimap: boolean; // Clean GPS minimap (no radar/enemy markers) or hidden for hardcore
  mouseSensitivity: number;
  invertMouseY: boolean;
  masterVolume: number;
}

export const DEFAULT_GRAPHIC_SETTINGS: GraphicSettings = {
  shadowMode: 'simple_blob', // default to ultra-light blob shadows for older laptops
  renderScale: 0.65, // Little bit more pixelated for older laptops to lock 60 FPS
  targetFps: 60, // Locked to 60 FPS
  drawDistance: 600,
  showTouchControls: false,
  showMinimap: true,
  mouseSensitivity: 1.0,
  invertMouseY: false,
  masterVolume: 0.8,
};
