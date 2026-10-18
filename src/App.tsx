/**
 * BGMI: Battlegrounds 1000m Low-Spec Edition
 * Full application entry point with Tactical Lobby, Game Canvas, HUD,
 * and older laptop optimization controls.
 */

import React, { useRef, useState, useEffect } from 'react';
import { GameEngine } from './game/gameEngine';
import {
  InventoryState,
  SafeZoneState,
  KillFeedItem,
  SoundIndicator,
  GraphicSettings,
  DEFAULT_GRAPHIC_SETTINGS,
  ConsumableType,
  SquadMember,
  RadarBotInfo,
} from './game/types';
import { HUD } from './components/HUD';
import { FullMapModal } from './components/FullMapModal';
import { InventoryModal } from './components/InventoryModal';
import { SettingsModal } from './components/SettingsModal';
import { GameOverModal } from './components/GameOverModal';
import { TouchControls } from './components/TouchControls';
import { Play, Laptop, ShieldCheck, MapPin, Crosshair, Users, Sliders, Volume2, UserCheck } from 'lucide-react';
import bgmiCoverArt from './assets/images/bgmi_cover_art_1790771276444.jpg';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // App state
  const [inGame, setInGame] = useState(false);
  const [settings, setSettings] = useState<GraphicSettings>(DEFAULT_GRAPHIC_SETTINGS);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFullMap, setShowFullMap] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [gameOverStats, setGameOverStats] = useState<{
    isVictory: boolean;
    stats: { kills: number; damage: number; rank: number; survivalTime: number };
  } | null>(null);

  // Squad State
  const [squad, setSquad] = useState<SquadMember[]>([]);

  // HUD dynamic states from engine
  const [playerHealth, setPlayerHealth] = useState(100);
  const [playerBoost, setPlayerBoost] = useState(0);
  const [inventory, setInventory] = useState<InventoryState>({
    ammo: { '5.56mm': 0, '7.62mm': 0, '300mag': 0, '12gauge': 0 },
    consumables: { first_aid: 3, medkit: 2, energy_drink: 4, painkiller: 2, bandage: 10 },
    helmetLevel: 0,
    armorLevel: 0,
    backpackLevel: 1,
    weapon1: null,
    weapon1Ammo: 0,
    weapon2: null,
    weapon2Ammo: 0,
    melee: null,
    activeSlot: 3,
  });
  const [safeZone, setSafeZone] = useState<SafeZoneState>({
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
    damagePerSec: 1.5,
  });
  const [aliveCount, setAliveCount] = useState(50);
  const [playerKills, setPlayerKills] = useState(0);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [hitmarker, setHitmarker] = useState<{ isHeadshot: boolean; isKill: boolean; timestamp: number } | null>(null);
  const [soundIndicators, setSoundIndicators] = useState<SoundIndicator[]>([]);
  const [interactionPrompt, setInteractionPrompt] = useState<string | null>(null);
  const [playerCoords, setPlayerCoords] = useState({ x: 0, z: 0, yaw: 0 });
  const [radarBots, setRadarBots] = useState<RadarBotInfo[]>([]);
  const [isScoping, setIsScoping] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [respawnChances, setRespawnChances] = useState(2);

  // Start Match
  const handleStartGame = () => {
    setInGame(true);
    setGameOverStats(null);
  };

  // Initialize GameEngine when container is ready
  useEffect(() => {
    if (!inGame || !containerRef.current) return;

    const engine = new GameEngine(containerRef.current, {
      onHealthChange: (hp, boost) => {
        setPlayerHealth(hp);
        setPlayerBoost(boost);
      },
      onInventoryChange: (inv) => {
        setInventory({ ...inv });
      },
      onSafeZoneChange: (zone) => {
        setSafeZone({ ...zone });
      },
      onKillFeed: (item) => {
        setKillFeed((prev) => [...prev.slice(-6), item]);
      },
      onAliveCountChange: (alive, kills) => {
        setAliveCount(alive);
        setPlayerKills(kills);
      },
      onHitmarker: (isHeadshot, isKill) => {
        setHitmarker({ isHeadshot, isKill, timestamp: Date.now() });
      },
      onSoundIndicator: (ind) => {
        setSoundIndicators((prev) => [...prev.filter((i) => i.expiresAt > Date.now()), ind]);
      },
      onSquadChange: (newSquad) => {
        setSquad([...newSquad]);
      },
      onGameEnd: (isVictory, stats) => {
        setGameOverStats({ isVictory, stats });
      },
      onPromptChange: (prompt) => {
        setInteractionPrompt(prompt);
      },
    });

    engine.applyGraphicSettings(settings);
    engine.init();
    engineRef.current = engine;

    // Polling player coordinate for minimap/HUD (15 FPS update is plenty and light on CPU)
    const coordInterval = setInterval(() => {
      if (engineRef.current) {
        setPlayerCoords({
          x: engineRef.current.playerPos.x,
          z: engineRef.current.playerPos.z,
          yaw: engineRef.current.cameraYaw,
        });

        // Realistic enemy scouting: enemies are NOT displayed on the radar/map!
        // Players must realistically spot enemies visually and listen to positional audio.
        const teammates = engineRef.current.squadManager.teammates
          .filter(
            (tm) =>
              tm.state !== 'dead' &&
              tm.state !== 'in_plane' &&
              tm.position.distanceTo(engineRef.current!.playerPos) < 180
          )
          .map((tm) => ({
            id: tm.member.id,
            x: tm.position.x,
            z: tm.position.z,
            isKnocked: tm.state === 'knocked',
            isTeammate: true,
          }));

        setRadarBots(teammates);
        setIsScoping(engineRef.current.isScoping);
        setIsPointerLocked(engineRef.current.isPointerLocked);
        setRespawnChances(engineRef.current.respawnChances);

        // Clean up expired sound cues
        setSoundIndicators((prev) => {
          const now = Date.now();
          if (prev.length > 0 && prev.some((i) => i.expiresAt <= now)) {
            return prev.filter((i) => i.expiresAt > now);
          }
          return prev;
        });
      }
    }, 66);

    // Global Keybinds for Modals
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        setShowFullMap((prev) => !prev);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setShowInventory((prev) => !prev);
      } else if (e.code === 'Escape') {
        if (showFullMap || showInventory || showSettingsModal) {
          setShowFullMap(false);
          setShowInventory(false);
          setShowSettingsModal(false);
        } else {
          setShowSettingsModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(coordInterval);
      window.removeEventListener('keydown', handleKeyDown);
      engine.destroy();
      engineRef.current = null;
    };
  }, [inGame]);

  const handleUpdateSettings = (newSettings: GraphicSettings) => {
    setSettings(newSettings);
    if (engineRef.current) {
      engineRef.current.applyGraphicSettings(newSettings);
    }
  };

  const handleRestartMatch = () => {
    setGameOverStats(null);
    if (engineRef.current) {
      engineRef.current.restartMatch();
      engineRef.current.requestPointerLock();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950 font-sans text-stone-100 select-none">
      {/* 1. LOBBY / START SCREEN */}
      {!inGame && (
        <div className="relative w-full h-full flex flex-col justify-between p-6 md:p-12 z-30 overflow-y-auto">
          {/* Background Hero Banner */}
          <div className="absolute inset-0 z-0">
            <img
              src={bgmiCoverArt}
              alt="BGMI Battlegrounds 1000m Low Spec Edition"
              className="w-full h-full object-cover object-center filter brightness-50"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-stone-950/80" />
          </div>

          {/* Top Bar Contract (3 zones) */}
          <header className="relative z-10 flex items-center justify-between pb-4 border-b border-stone-800/80">
            {/* Zone 1: Single Brand element */}
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-extrabold tracking-wider text-amber-400 font-sans">
                MIRAMAR STRIKE 3D
              </span>
              <span className="text-xs font-mono text-stone-400 hidden sm:inline">700m x 700m Desert Island</span>
            </div>

            {/* Zone 2: Navigation / Info */}
            <nav className="hidden md:flex items-center gap-6 text-xs font-mono text-stone-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Laptop className="w-3.5 h-3.5" />
                <span>Older Laptop Optimized (Simple Shadows)</span>
              </span>
              <span className="text-stone-600">/</span>
              <span className="flex items-center gap-1.5 text-stone-300">
                <MapPin className="w-3.5 h-3.5 text-amber-500" />
                <span>1000m Miramar Desert Map</span>
              </span>
              <span className="text-stone-600">/</span>
              <span className="flex items-center gap-1.5 text-stone-300">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span>60 Players (Solo Mode + Recall)</span>
              </span>
            </nav>

            {/* Zone 3: Primary Action */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="px-3 py-1.5 text-xs font-mono rounded-lg bg-stone-900/80 hover:bg-stone-800 border border-stone-700 text-stone-200 transition-colors flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Graphics Presets</span>
              </button>
            </div>
          </header>

          {/* Main Hero Content */}
          <main className="relative z-10 my-auto py-8 max-w-2xl">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Optimized for Intel HD & Dual-Core Older Laptops</span>
              </div>

              <h1 className="text-4xl md:text-6xl font-extrabold text-stone-100 tracking-tight leading-tight font-sans">
                Pure FPP Action. <br />
                <span className="text-amber-400">Survive 1000m.</span>
              </h1>

              <p className="text-sm md:text-base text-stone-300 leading-relaxed max-w-xl">
                Experience full-scale tactical battle royale in Pure First-Person Perspective (FPP).
                Watch enemies parachute out of the C-130 airplane across the 1000m island, enjoy natural
                simple mouse controls with zero lag, and drive tactical UAZs — engineered for smooth 60 FPS on older laptops.
              </p>

              {/* Start Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <button
                  onClick={handleStartGame}
                  className="py-4 px-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-base tracking-wider uppercase flex items-center justify-center gap-3 shadow-xl shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Start Match (Drop In)</span>
                </button>

                <div className="text-xs font-mono text-stone-400">
                  <div>View: <strong className="text-amber-400">Pure FPP (First Person)</strong></div>
                  <div>Shadow: <strong className="text-amber-400">{settings.shadowMode === 'simple_blob' ? 'Simple Shadow (Fast)' : 'Directional'}</strong></div>
                  <div>Map: <strong className="text-stone-200">1000m x 1000m Island</strong></div>
                </div>
              </div>
            </div>

            {/* Quick Features Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10 pt-6 border-t border-stone-800/80 text-xs font-mono text-stone-400">
              <div className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800">
                <div className="text-amber-400 font-bold text-sm">Pure FPP View</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Tactical 3D viewmodel</div>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800">
                <div className="text-emerald-400 font-bold text-sm">Airplane Bot Drops</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Enemies jump from plane</div>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800">
                <div className="text-sky-400 font-bold text-sm">Simple Mouse Look</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Intuitive Up = Up pitch</div>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800">
                <div className="text-red-400 font-bold text-sm">Balanced Gameplay</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Rewarding & fun combat</div>
              </div>
            </div>
          </main>

          {/* Footer Controls Overview */}
          <footer className="relative z-10 pt-4 border-t border-stone-800/80 text-xs text-stone-500 font-mono flex flex-wrap items-center justify-between gap-2">
            <div>WASD to Move · Mouse to Aim · Left-Click to Shoot · Right-Click to ADS Scope · F to Drop/Drive/Loot · M for 1000m Map</div>
            <div>Pure FPP 1000m Edition</div>
          </footer>
        </div>
      )}

      {/* 2. THREE.JS 3D CANVAS VIEWPORT */}
      <div
        ref={containerRef}
        className={`w-full h-full ${inGame ? 'block' : 'hidden'} cursor-crosshair`}
      />

      {/* 3. IN-GAME HUD & OVERLAYS */}
      {inGame && (
        <>
          <HUD
            playerHealth={playerHealth}
            playerBoost={playerBoost}
            inventory={inventory}
            safeZone={safeZone}
            killFeed={killFeed}
            aliveCount={aliveCount}
            playerKills={playerKills}
            hitmarker={hitmarker}
            soundIndicators={soundIndicators}
            interactionPrompt={interactionPrompt}
            playerX={playerCoords.x}
            playerZ={playerCoords.z}
            playerYaw={playerCoords.yaw}
            vehicles={engineRef.current ? engineRef.current.worldBuilder.vehicles : []}
            isScoping={isScoping}
            settings={settings}
            squad={squad}
            radarBots={radarBots}
            respawnChances={respawnChances}
            onOpenSettings={() => setShowSettingsModal(true)}
            onOpenMap={() => setShowFullMap(true)}
            onOpenInventory={() => setShowInventory(true)}
            onSwitchSlot={(slot) => engineRef.current?.switchWeaponSlot(slot)}
            onUseConsumable={(type) => engineRef.current?.useConsumable(type)}
            onJump={() => {
              if (engineRef.current) {
                // Manual jump trigger from UI
                engineRef.current.keys['KeyR'] = true;
                setTimeout(() => {
                  if (engineRef.current) engineRef.current.keys['KeyR'] = false;
                }, 100);
              }
            }}
            onToggleInvertMouse={() => {
              setSettings((prev) => {
                const next = { ...prev, invertMouseY: !prev.invertMouseY };
                if (engineRef.current) {
                  engineRef.current.applyGraphicSettings(next);
                }
                return next;
              });
            }}
          />

          {/* Pointer Lock Helper Prompt for Laptops & Desktops */}
          {!isPointerLocked && !showFullMap && !showInventory && !showSettingsModal && !gameOverStats && (
            <div
              onClick={() => engineRef.current?.requestPointerLock()}
              className="absolute inset-0 z-25 flex items-center justify-center bg-black/55 backdrop-blur-[3px] cursor-pointer"
            >
              <div className="px-7 py-5 rounded-2xl bg-stone-900/95 border-2 border-amber-500/70 shadow-2xl text-center space-y-3 max-w-md">
                <Crosshair className="w-10 h-10 text-amber-400 mx-auto animate-pulse" />
                <div className="text-lg font-black text-white font-sans tracking-wide">
                  CLICK ANYWHERE TO PLAY
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-stone-300 text-left bg-black/50 p-3 rounded-xl border border-white/10">
                  <div><span className="text-amber-400 font-bold">W A S D</span> : Move</div>
                  <div><span className="text-amber-400 font-bold">Mouse/Trackpad</span> : Look</div>
                  <div><span className="text-amber-400 font-bold">Left Click</span> : Shoot</div>
                  <div><span className="text-amber-400 font-bold">Right Click</span> : Aim Scope</div>
                  <div><span className="text-amber-400 font-bold">SPACE</span> : Jump / Vault</div>
                  <div><span className="text-amber-400 font-bold">R</span> : Reload</div>
                  <div><span className="text-amber-400 font-bold">SHIFT</span> : Sprint</div>
                  <div><span className="text-amber-400 font-bold">C / Z</span> : Crouch / Prone</div>
                  <div><span className="text-amber-400 font-bold">1 / 2</span> : Switch Gun</div>
                  <div><span className="text-amber-400 font-bold">F</span> : Drive Car / Loot</div>
                  <div><span className="text-amber-400 font-bold">M</span> : Full Map</div>
                  <div><span className="text-amber-400 font-bold">TAB</span> : Bag / Inventory</div>
                </div>
                <div className="text-[10px] text-amber-300/90 font-mono">
                  Press [ESC] at any time to release mouse or open settings
                </div>
              </div>
            </div>
          )}

          {/* Optional On-Screen Touch Controls */}
          {settings.showTouchControls && (
            <TouchControls
              engine={engineRef.current}
              isDriving={engineRef.current?.gamePhase === 'driving'}
            />
          )}

          {/* 1000m Full Map Modal (M) */}
          {showFullMap && (
            <FullMapModal
              playerX={playerCoords.x}
              playerZ={playerCoords.z}
              playerYaw={playerCoords.yaw}
              safeZone={safeZone}
              vehicles={engineRef.current ? engineRef.current.worldBuilder.vehicles : []}
              radarBots={radarBots}
              onClose={() => setShowFullMap(false)}
            />
          )}

          {/* Inventory Modal (Tab) */}
          {showInventory && (
            <InventoryModal
              inventory={inventory}
              onUseConsumable={(type) => {
                engineRef.current?.useConsumable(type);
              }}
              onSwitchSlot={(slot) => {
                engineRef.current?.switchWeaponSlot(slot);
              }}
              onClose={() => setShowInventory(false)}
            />
          )}

          {/* Settings & Optimization Modal */}
          {showSettingsModal && (
            <SettingsModal
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onClose={() => {
                setShowSettingsModal(false);
                engineRef.current?.requestPointerLock();
              }}
            />
          )}

          {/* Winner Winner Chicken Dinner / Defeat Screen */}
          {gameOverStats && (
            <GameOverModal
              isVictory={gameOverStats.isVictory}
              stats={gameOverStats.stats}
              onRestart={handleRestartMatch}
            />
          )}
        </>
      )}
    </div>
  );
}
