/**
 * Master Tactical HUD for BGMI
 * Health bar, boost gauge, weapon status, kill feed, dynamic crosshair,
 * hitmarkers, minimap integration, and interaction prompts.
 */

import React, { useState, useEffect } from 'react';
import {
  InventoryState,
  SafeZoneState,
  KillFeedItem,
  SoundIndicator,
  WEAPON_DEFS,
  GraphicSettings,
  ConsumableType,
  SquadMember,
  RadarBotInfo,
} from '../game/types';
import { Minimap } from './Minimap';
import { ScopeOverlay } from './ScopeOverlay';
import { Shield, HardHat, Skull, Users, HeartPulse, Zap, Settings as SettingsIcon, Map as MapIcon, Crosshair, UserCheck, AlertTriangle, ArrowUpDown, Compass, Eye, EyeOff } from 'lucide-react';
import { VehicleInstance } from '../game/worldBuilder';

interface HUDProps {
  playerHealth: number;
  playerBoost: number;
  inventory: InventoryState;
  safeZone: SafeZoneState;
  killFeed: KillFeedItem[];
  aliveCount: number;
  playerKills: number;
  hitmarker: { isHeadshot: boolean; isKill: boolean; timestamp: number } | null;
  soundIndicators: SoundIndicator[];
  interactionPrompt: string | null;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  vehicles: VehicleInstance[];
  isScoping: boolean;
  settings: GraphicSettings;
  squad: SquadMember[];
  radarBots: RadarBotInfo[];
  respawnChances: number;
  onOpenSettings: () => void;
  onOpenMap: () => void;
  onOpenInventory: () => void;
  onSwitchSlot: (slot: 1 | 2 | 3) => void;
  onUseConsumable: (type: ConsumableType) => void;
  onJump?: () => void;
  onToggleInvertMouse?: () => void;
  onToggleMinimap?: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  playerHealth,
  playerBoost,
  inventory,
  safeZone,
  killFeed,
  aliveCount,
  playerKills,
  hitmarker,
  soundIndicators,
  interactionPrompt,
  playerX,
  playerZ,
  playerYaw,
  vehicles,
  isScoping,
  settings,
  squad,
  radarBots,
  respawnChances,
  onOpenSettings,
  onOpenMap,
  onOpenInventory,
  onSwitchSlot,
  onUseConsumable,
  onJump,
  onToggleInvertMouse,
  onToggleMinimap,
}) => {
  const activeSlot = inventory.activeSlot;
  const activeWeaponId = activeSlot === 1 ? inventory.weapon1 : activeSlot === 2 ? inventory.weapon2 : inventory.melee;
  const activeDef = activeWeaponId ? WEAPON_DEFS[activeWeaponId] : null;

  const currentAmmo = activeSlot === 1 ? inventory.weapon1Ammo : activeSlot === 2 ? inventory.weapon2Ammo : 1;
  const reserveAmmo = activeDef?.ammoType ? inventory.ammo[activeDef.ammoType] || 0 : 0;

  // Safe zone countdown text
  const zoneMinutes = Math.floor(Math.max(0, safeZone.timeRemaining) / 60);
  const zoneSeconds = Math.floor(Math.max(0, safeZone.timeRemaining) % 60);
  const zoneTimeFormatted = `${zoneMinutes}:${zoneSeconds < 10 ? '0' : ''}${zoneSeconds}`;

  // Check if player is outside blue zone
  const distToZoneCenter = Math.hypot(playerX - safeZone.centerX, playerZ - safeZone.centerZ);
  const isOutsideBlue = distToZoneCenter > safeZone.blueRadius;

  // Compass degrees
  const currentDeg = Math.round(((-playerYaw * 180) / Math.PI + 360) % 360);

  // Hitmarker fade out
  const [showHitmarker, setShowHitmarker] = useState(false);
  useEffect(() => {
    if (hitmarker && Date.now() - hitmarker.timestamp < 350) {
      setShowHitmarker(true);
      const timer = setTimeout(() => setShowHitmarker(false), 300);
      return () => clearTimeout(timer);
    }
  }, [hitmarker]);

  // Damage flash when player takes bullet hits
  const [damageFlash, setDamageFlash] = useState(false);
  const prevHealthRef = React.useRef(playerHealth);
  useEffect(() => {
    if (playerHealth < prevHealthRef.current && playerHealth > 0) {
      setDamageFlash(true);
      const timer = setTimeout(() => setDamageFlash(false), 240);
      prevHealthRef.current = playerHealth;
      return () => clearTimeout(timer);
    }
    prevHealthRef.current = playerHealth;
  }, [playerHealth]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans">
      {/* 1. Outside Blue Zone Vignette Glow */}
      {isOutsideBlue && (
        <div className="absolute inset-0 pointer-events-none z-10 border-[16px] md:border-[28px] border-blue-500/30 shadow-[inset_0_0_80px_rgba(59,130,246,0.6)] animate-pulse" />
      )}

      {/* 1b. Hit Damage Vignette (Red flash on being hit by enemy bullets) */}
      {damageFlash && (
        <div className="absolute inset-0 pointer-events-none z-12 border-[16px] md:border-[24px] border-red-600/70 shadow-[inset_0_0_100px_rgba(239,68,68,0.7)] animate-out fade-out duration-200" />
      )}

      {/* 1b. Player Knocked Down Vignette */}
      {playerHealth <= 0 && (
        <div className="absolute inset-0 pointer-events-none z-15 bg-red-950/40 border-[16px] md:border-[24px] border-red-600/60 shadow-[inset_0_0_120px_rgba(220,38,38,0.7)] animate-pulse flex flex-col items-center justify-center">
          <div className="px-6 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-red-500/80 shadow-2xl text-center space-y-1 animate-in zoom-in-95 duration-150">
            <div className="text-xl md:text-2xl font-black text-red-500 tracking-wider font-sans">
              YOU ARE KNOCKED DOWN
            </div>
            <div className="text-xs md:text-sm text-amber-300 font-mono">
              Crawl to cover · Squadmates are rushing to revive you!
            </div>
          </div>
        </div>
      )}

      {/* 2. Aim Down Sights (ADS) Scope Reticle */}
      <ScopeOverlay weapon={activeDef} isScoping={isScoping} />

      {/* 3. Crosshair & Hitmarker (Hidden when scoping) */}
      {!isScoping && (
        <div className="absolute inset-0 flex items-center justify-center z-15">
          {/* Dynamic Hipfire Crosshair */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute w-2 h-[1.5px] bg-white/90 left-0 shadow-[0_0_2px_#000]" />
            <div className="absolute w-2 h-[1.5px] bg-white/90 right-0 shadow-[0_0_2px_#000]" />
            <div className="absolute h-2 w-[1.5px] bg-white/90 top-0 shadow-[0_0_2px_#000]" />
            <div className="absolute h-2 w-[1.5px] bg-white/90 bottom-0 shadow-[0_0_2px_#000]" />
            <div className="w-1 h-1 rounded-full bg-white/70" />
          </div>

          {/* Hitmarker 4-prong tick animation */}
          {showHitmarker && hitmarker && (
            <div className="absolute w-10 h-10 animate-in zoom-in duration-75">
              <div
                className={`absolute w-3 h-[2px] -rotate-45 top-1 left-1 ${
                  hitmarker.isHeadshot ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-white'
                }`}
              />
              <div
                className={`absolute w-3 h-[2px] rotate-45 top-1 right-1 ${
                  hitmarker.isHeadshot ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-white'
                }`}
              />
              <div
                className={`absolute w-3 h-[2px] rotate-45 bottom-1 left-1 ${
                  hitmarker.isHeadshot ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-white'
                }`}
              />
              <div
                className={`absolute w-3 h-[2px] -rotate-45 bottom-1 right-1 ${
                  hitmarker.isHeadshot ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-white'
                }`}
              />
              {hitmarker.isKill && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Skull className="w-5 h-5 text-red-500 animate-bounce" />
                </div>
              )}
            </div>
          )}
        </div>
      )}



      {/* 4. Top Header Bar */}
      <div className="absolute top-3 inset-x-4 flex items-start justify-between z-20">
        {/* Left: Alive & Kills Cluster + Squad Team List */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {/* Alive count */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-stone-100 font-mono shadow-lg">
              <Users className="w-4 h-4 text-emerald-400" />
              <div className="text-xs">
                <span className="text-stone-400 text-[10px] mr-1">ALIVE</span>
                <span className="font-bold text-sm text-stone-100">{aliveCount}</span>
              </div>
            </div>

            {/* Kills count */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-stone-100 font-mono shadow-lg">
              <Skull className="w-4 h-4 text-red-400" />
              <div className="text-xs">
                <span className="text-stone-400 text-[10px] mr-1">KILLS</span>
                <span className="font-bold text-sm text-amber-400">{playerKills}</span>
              </div>
            </div>
          </div>

          {/* SQUAD TEAMMATES LIST (Team 4-Man Squad) */}
          <div className="flex flex-col gap-1 w-44 md:w-52">
            {/* Player Row #1 */}
            <div className="px-2 py-1 rounded bg-black/60 backdrop-blur-sm border border-emerald-500/40 text-[11px] font-mono shadow-md flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                  1
                </span>
                <span className="font-semibold text-stone-200 truncate">You</span>
              </div>
              <div className="w-16 h-2 rounded-full bg-stone-800 overflow-hidden">
                <div
                  style={{ width: `${Math.max(0, playerHealth)}%` }}
                  className="h-full bg-emerald-400 rounded-full"
                />
              </div>
            </div>

            {/* Teammates Rows (#2, #3, #4) */}
            {squad.map((tm) => (
              <div
                key={tm.id}
                className={`px-2 py-1 rounded backdrop-blur-sm border text-[11px] font-mono shadow-md flex items-center justify-between transition-all ${
                  tm.isKnocked
                    ? 'bg-amber-950/80 border-amber-500 text-amber-300 animate-pulse'
                    : tm.isDead
                    ? 'bg-black/40 border-stone-800 text-stone-500 line-through'
                    : 'bg-black/60 border-sky-500/30 text-stone-200'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className={`w-4 h-4 rounded-full font-bold flex items-center justify-center text-[10px] ${
                    tm.isKnocked
                      ? 'bg-amber-500 text-stone-950'
                      : tm.isDead
                      ? 'bg-stone-800 text-stone-600'
                      : 'bg-sky-500/20 text-sky-400'
                  }`}>
                    {tm.number}
                  </span>
                  <span className="font-medium truncate">{tm.name}</span>
                </div>
                {tm.isKnocked ? (
                  <span className="text-[9px] font-bold text-amber-400 tracking-wider">
                    [HELP!]
                  </span>
                ) : tm.isDead ? (
                  <span className="text-[9px] text-stone-600">DEAD</span>
                ) : (
                  <div className="w-16 h-2 rounded-full bg-stone-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(0, tm.health)}%` }}
                      className="h-full bg-sky-400 rounded-full"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: Tactical Horizontal Compass Tape + Blue Zone Banner */}
        <div className="flex flex-col items-center gap-1.5">
          {/* Tactical Compass Tape (BGMI / PUBG style with directional sound cues) */}
          <div className="relative w-64 md:w-80 h-7 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 shadow-xl flex items-center justify-center overflow-hidden px-4">
            {/* Center Heading Reticle */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 shadow-[0_0_6px_#f59e0b]" />
            <div className="absolute top-0 w-2 h-1 bg-amber-400 z-10 rounded-b-sm" />

            {/* Compass Tape Labels */}
            <div className="relative w-full h-full flex items-center justify-center font-mono text-[10px] select-none">
              {[-60, -45, -30, -15, 0, 15, 30, 45, 60].map((offset) => {
                const tickBearing = (currentDeg + offset + 360) % 360;
                let label = `${tickBearing}`;
                let isCardinal = false;
                if (tickBearing === 0 || tickBearing === 360) {
                  label = 'N';
                  isCardinal = true;
                } else if (tickBearing === 45) {
                  label = 'NE';
                  isCardinal = true;
                } else if (tickBearing === 90) {
                  label = 'E';
                  isCardinal = true;
                } else if (tickBearing === 135) {
                  label = 'SE';
                  isCardinal = true;
                } else if (tickBearing === 180) {
                  label = 'S';
                  isCardinal = true;
                } else if (tickBearing === 225) {
                  label = 'SW';
                  isCardinal = true;
                } else if (tickBearing === 270) {
                  label = 'W';
                  isCardinal = true;
                } else if (tickBearing === 315) {
                  label = 'NW';
                  isCardinal = true;
                }

                const xPercent = 50 + (offset / 60) * 45;

                return (
                  <div
                    key={offset}
                    style={{ left: `${xPercent}%` }}
                    className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  >
                    <div
                      className={`w-[1px] ${
                        offset === 0 ? 'h-0' : isCardinal ? 'h-2 bg-amber-300' : 'h-1.5 bg-white/30'
                      }`}
                    />
                    <span
                      className={`text-[9px] font-bold ${
                        offset === 0
                          ? 'text-amber-400 text-[11px] drop-shadow-[0_0_4px_#f59e0b]'
                          : isCardinal
                          ? 'text-amber-300'
                          : 'text-stone-400'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}

            </div>
          </div>

          {/* Blue Zone Banner */}
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-lg backdrop-blur-md border font-mono text-xs shadow-lg flex items-center gap-2 ${
                safeZone.isShrinking
                  ? 'bg-blue-950/80 border-blue-500/80 text-blue-200 animate-pulse'
                  : 'bg-black/60 border-white/10 text-stone-200'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${safeZone.isShrinking ? 'bg-blue-400' : 'bg-emerald-400'}`} />
              <span>
                {safeZone.isShrinking ? 'PLAYZONE SHRINKING' : `NEXT PLAYZONE IN ${zoneTimeFormatted}`}
              </span>
              <span className="text-[10px] text-stone-400">· Phase {safeZone.phase}/{safeZone.totalPhases}</span>
            </div>
          </div>

          {isOutsideBlue && (
            <div className="mt-0.5 px-2.5 py-0.5 rounded bg-red-600/90 text-white text-[10px] font-mono font-bold tracking-wider animate-bounce shadow-md">
              WARNING: YOU ARE OUTSIDE PLAYZONE!
            </div>
          )}
        </div>

        {/* Right: Tactical Minimap & Quick Control Buttons */}
        <div className="flex items-start gap-2">
          {/* Quick buttons */}
          <div className="flex flex-col gap-2 pointer-events-auto">
            <button
              onClick={onOpenSettings}
              title="Settings & Optimization (ESC)"
              className="p-2 rounded-lg bg-black/60 hover:bg-stone-800 backdrop-blur-md border border-white/10 text-stone-300 transition-colors shadow-lg"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleInvertMouse}
              title={`Vertical Look: ${settings.invertMouseY ? 'Inverted (Mouse Up = Look Down)' : 'Standard (Mouse Up = Look Up)'} - Press [Y]`}
              className={`p-2 rounded-lg backdrop-blur-md border transition-colors shadow-lg flex items-center justify-center ${
                settings.invertMouseY
                  ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                  : 'bg-black/60 hover:bg-stone-800 border-white/10 text-stone-300'
              }`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleMinimap}
              title={`Minimap: ${settings.showMinimap !== false ? 'Shown (Clean GPS) - Click to Hide' : 'Hidden (Hardcore) - Click to Show'} - Press [N]`}
              className={`p-2 rounded-lg backdrop-blur-md border transition-colors shadow-lg flex items-center justify-center ${
                settings.showMinimap !== false
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                  : 'bg-black/60 hover:bg-stone-800 border-white/10 text-stone-400'
              }`}
            >
              <Compass className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenMap}
              title="1000m Tactical Map (M)"
              className="p-2 rounded-lg bg-black/60 hover:bg-stone-800 backdrop-blur-md border border-white/10 text-amber-400 transition-colors shadow-lg"
            >
              <MapIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Minimap (Pure GPS mode or Hardcore Compact Status) */}
          {settings.showMinimap !== false ? (
            <Minimap
              playerX={playerX}
              playerZ={playerZ}
              playerYaw={playerYaw}
              safeZone={safeZone}
              vehicles={vehicles}
              radarBots={radarBots}
              onOpenFullMap={onOpenMap}
            />
          ) : (
            <div
              onClick={onOpenMap}
              className="cursor-pointer group flex flex-col items-end gap-1.5 p-2.5 rounded-lg bg-black/70 hover:bg-stone-900/90 backdrop-blur-md border border-white/15 text-stone-200 shadow-xl transition-all select-none"
              title="Minimap Hidden (Hardcore Mode). Click or press [M] to open 1000m Map"
            >
              <div className="flex items-center gap-2 text-xs font-mono">
                <Compass className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" />
                <span className="font-bold text-emerald-400">
                  {currentDeg >= 338 || currentDeg < 23 ? 'N' : currentDeg < 68 ? 'NE' : currentDeg < 113 ? 'E' : currentDeg < 158 ? 'SE' : currentDeg < 203 ? 'S' : currentDeg < 248 ? 'SW' : currentDeg < 293 ? 'W' : 'NW'} {currentDeg}°
                </span>
                <span className="text-amber-400 font-bold">
                  {Math.max(0, Math.round(Math.hypot(playerX - safeZone.targetCenterX, playerZ - safeZone.targetCenterZ) - safeZone.targetRadius))}m
                </span>
              </div>
              <div className="text-[10px] font-mono text-stone-400 group-hover:text-amber-300 transition-colors">
                HARDCORE · [M] MAP · [N] GPS
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Kill Feed (Under Minimap on top right) */}
      <div className="absolute top-44 right-4 flex flex-col items-end gap-1 pointer-events-none z-20 max-w-xs">
        {killFeed.slice(-3).map((item) => (
          <div
            key={item.id}
            className={`px-2.5 py-1 rounded bg-black/60 backdrop-blur-sm border text-[11px] font-mono shadow-md flex items-center gap-1.5 transition-all ${
              item.isKnockout
                ? 'border-amber-400/80 text-amber-300'
                : item.isPlayerKiller
                ? 'border-emerald-500/80 text-emerald-300'
                : item.isPlayerVictim
                ? 'border-red-500/80 text-red-300'
                : 'border-white/10 text-stone-300'
            }`}
          >
            <span className="font-semibold">{item.killer}</span>
            <span className={item.isKnockout ? 'text-amber-400 font-bold' : 'text-stone-500'}>
              {item.isKnockout ? 'knocked out' : 'finished'}
            </span>
            <span className="font-semibold">{item.victim}</span>
            <span className="text-stone-400">[{item.weapon}]</span>
            {item.isHeadshot && <span className="text-red-400 font-bold">🎯</span>}
          </div>
        ))}
      </div>

      {/* 6. Center Contextual Interaction Banner */}
      {interactionPrompt && (
        <div className="absolute inset-x-0 bottom-44 flex justify-center z-20 pointer-events-none">
          <div className="px-5 py-2 rounded-xl bg-black/75 backdrop-blur-md border border-amber-400/60 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
            <span className="text-xs md:text-sm font-mono font-bold text-amber-300 tracking-wider">
              {interactionPrompt}
            </span>
          </div>
        </div>
      )}

      {/* 7. Bottom Main Tactical Bar */}
      <div className="absolute bottom-4 inset-x-4 flex items-end justify-between z-20">
        {/* Bottom Left: Medical Supplies Quick Bar */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {(['first_aid', 'energy_drink', 'medkit'] as ConsumableType[]).map((type) => {
            const count = inventory.consumables[type] || 0;
            const isBoost = type === 'energy_drink';
            return (
              <button
                key={type}
                onClick={() => onUseConsumable(type)}
                disabled={count <= 0}
                className="relative group p-2 rounded-xl bg-black/60 hover:bg-stone-800 disabled:opacity-40 disabled:hover:bg-black/60 backdrop-blur-md border border-white/10 text-stone-200 transition-all flex flex-col items-center shadow-lg"
              >
                {isBoost ? (
                  <Zap className="w-5 h-5 text-amber-400" />
                ) : (
                  <HeartPulse className="w-5 h-5 text-red-400" />
                )}
                <span className="text-[10px] font-mono font-semibold text-stone-300 mt-0.5">
                  x{count}
                </span>
                <span className="text-[9px] font-mono text-stone-500 uppercase">
                  {type === 'first_aid' ? 'First Aid' : type === 'energy_drink' ? 'Drink' : 'Medkit'}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => onUseConsumable('medkit')}
            className="p-2 rounded-xl bg-black/60 hover:bg-stone-800 backdrop-blur-md border border-white/10 text-stone-300 transition-colors flex flex-col items-center shadow-lg pointer-events-auto"
          >
            <span className="text-xs font-mono font-bold text-amber-400">[H]</span>
            <span className="text-[9px] font-mono text-stone-400 uppercase">Heal</span>
          </button>

          <button
            onClick={onOpenInventory}
            className="p-2 rounded-xl bg-black/60 hover:bg-stone-800 backdrop-blur-md border border-white/10 text-stone-300 transition-colors flex flex-col items-center shadow-lg pointer-events-auto"
          >
            <span className="text-xs font-mono font-bold text-amber-400">[TAB]</span>
            <span className="text-[9px] font-mono text-stone-400 uppercase">Bag</span>
          </button>

          <button
            onClick={onJump}
            className="p-2 rounded-xl bg-amber-500/80 hover:bg-amber-400 backdrop-blur-md border border-amber-400 text-stone-950 transition-colors flex flex-col items-center shadow-lg pointer-events-auto"
          >
            <span className="text-xs font-mono font-black">[SPACE]</span>
            <span className="text-[9px] font-mono uppercase font-bold">Jump</span>
          </button>
        </div>

        {/* Bottom Center: Health, Boost & Armor Status */}
        <div className="flex flex-col items-center w-72 md:w-96 space-y-1.5">
          {/* Armor & Helmet status badges */}
          <div className="flex items-center gap-4 text-xs font-mono text-stone-300">
            <div className="flex items-center gap-1">
              <HardHat className="w-3.5 h-3.5 text-amber-400" />
              <span>Lv{inventory.helmetLevel}</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Lv{inventory.armorLevel}</span>
            </div>
            {/* Recall Chances left */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 animate-pulse">
              <HeartPulse className="w-3.5 h-3.5 animate-bounce" />
              <span>{respawnChances} RECALLS</span>
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Mode: {settings.shadowMode === 'simple_blob' ? 'Simple Shadow (Fast)' : 'Directional'}
            </div>
          </div>

          {/* Boost Bar (4 segments) */}
          <div className="w-full h-1.5 rounded-full bg-stone-950/80 border border-white/10 overflow-hidden flex gap-0.5 p-0.5">
            <div
              style={{ width: `${Math.min(100, playerBoost)}%` }}
              className="h-full bg-amber-400 rounded-full transition-all duration-150 shadow-[0_0_6px_#f59e0b]"
            />
          </div>

          {/* Health Bar (100 HP) */}
          <div className="relative w-full h-5 rounded-lg bg-stone-950/80 border border-white/20 overflow-hidden shadow-xl">
            <div
              style={{ width: `${Math.max(0, Math.min(100, playerHealth))}%` }}
              className={`h-full transition-all duration-150 ${
                playerHealth > 40 ? 'bg-white shadow-[0_0_8px_#ffffff]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'
              }`}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-stone-900 drop-shadow">
              {Math.round(playerHealth)} / 100
            </div>
          </div>
        </div>

        {/* Bottom Right: Equipped Weapons & Ammo Counter */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Weapon Slot 1 */}
          <button
            onClick={() => onSwitchSlot(1)}
            className={`px-3 py-2 rounded-xl backdrop-blur-md border transition-all text-left shadow-lg ${
              activeSlot === 1
                ? 'bg-stone-900/90 border-amber-400 text-stone-100 shadow-amber-500/20'
                : 'bg-black/60 border-white/10 text-stone-400 hover:text-stone-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-[10px] font-mono">
              <span className="text-amber-400 font-bold">[1] PRIMARY</span>
              <span>{inventory.weapon1 ? WEAPON_DEFS[inventory.weapon1].scopeType : 'None'}</span>
            </div>
            <div className="text-xs md:text-sm font-bold mt-0.5">
              {inventory.weapon1 ? WEAPON_DEFS[inventory.weapon1].name : 'Empty'}
            </div>
            {inventory.weapon1 && (
              <div className="text-xs font-mono text-stone-300 mt-0.5">
                <span className="text-amber-400 font-bold text-sm">{inventory.weapon1Ammo}</span>
                <span className="text-stone-500"> / {WEAPON_DEFS[inventory.weapon1].magSize}</span>
              </div>
            )}
          </button>

          {/* Weapon Slot 2 */}
          <button
            onClick={() => onSwitchSlot(2)}
            className={`px-3 py-2 rounded-xl backdrop-blur-md border transition-all text-left shadow-lg ${
              activeSlot === 2
                ? 'bg-stone-900/90 border-amber-400 text-stone-100 shadow-amber-500/20'
                : 'bg-black/60 border-white/10 text-stone-400 hover:text-stone-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-[10px] font-mono">
              <span className="text-amber-400 font-bold">[2] SECONDARY</span>
              <span>{inventory.weapon2 ? WEAPON_DEFS[inventory.weapon2].scopeType : 'None'}</span>
            </div>
            <div className="text-xs md:text-sm font-bold mt-0.5">
              {inventory.weapon2 ? WEAPON_DEFS[inventory.weapon2].name : 'Empty'}
            </div>
            {inventory.weapon2 && (
              <div className="text-xs font-mono text-stone-300 mt-0.5">
                <span className="text-amber-400 font-bold text-sm">{inventory.weapon2Ammo}</span>
                <span className="text-stone-500"> / {WEAPON_DEFS[inventory.weapon2].magSize}</span>
              </div>
            )}
          </button>

          {/* Active Ammo Reserve Cluster */}
          <div className="px-4 py-2 rounded-xl bg-black/70 backdrop-blur-md border border-white/15 text-center shadow-lg font-mono">
            <div className="text-[10px] text-stone-400 uppercase tracking-wider">Reserve</div>
            <div className="text-lg md:text-xl font-extrabold text-amber-400 leading-tight">
              {reserveAmmo}
            </div>
            <div className="text-[9px] text-stone-500">
              {activeDef?.ammoType || 'MELEE'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
