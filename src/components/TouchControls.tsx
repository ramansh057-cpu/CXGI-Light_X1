/**
 * Touch Controls for Touchscreen Laptops & Mobile Phones
 * Features:
 * - Simultaneous Fire & Aim: Move camera freely with any finger while holding fire button
 * - Drag-to-Aim on Both Fire Buttons (aim & control recoil with the shooting finger)
 * - Secondary Left Fire button for classic two-thumb / claw mobile aiming
 * - Virtual movement joystick with auto-sprint
 * - Action / Interact button (F) for airplane drop, vehicle drive/exit, looting, revives
 * - Quick weapon switch (1, 2, 3) and quick healing
 * - Scope (ADS), Jump, Crouch, and Reload buttons
 */

import React, { useRef, useState, useEffect } from 'react';
import { Crosshair, RotateCw, ArrowUp, Zap, Plus, Hand, Target, Sliders } from 'lucide-react';
import { GameEngine } from '../game/gameEngine';
import { sound } from '../game/audio';

interface TouchControlsProps {
  engine: GameEngine | null;
  isDriving: boolean;
  onOpenSettings?: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({ engine, isDriving, onOpenSettings }) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const rightFireBtnRef = useRef<HTMLButtonElement>(null);
  const leftFireBtnRef = useRef<HTMLButtonElement>(null);

  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [isLooking, setIsLooking] = useState(false);
  const [isFiringRight, setIsFiringRight] = useState(false);
  const [isFiringLeft, setIsFiringLeft] = useState(false);
  const [isSprintLocked, setIsSprintLocked] = useState(false);

  // Active touch tracking refs (persists across re-renders without dropping frames)
  const joystickTouchIdRef = useRef<number | null>(null);
  const fireTouchIdsRef = useRef<Set<number>>(new Set());
  const lookTouchIdsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const buttonTouchIdsRef = useRef<Set<number>>(new Set());
  const lastTouchPosRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const isSprintLockedRef = useRef(isSprintLocked);
  useEffect(() => {
    isSprintLockedRef.current = isSprintLocked;
  }, [isSprintLocked]);

  // JOYSTICK CALCULATION HELPER
  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickRef.current || !engine) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 42;

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * clampedDist;
    const sy = Math.sin(angle) * clampedDist;

    setStickPos({ x: sx, y: sy });

    const normX = sx / maxRadius;
    const normY = sy / maxRadius;

    engine.keys['KeyW'] = normY < -0.25;
    engine.keys['KeyS'] = normY > 0.25;
    engine.keys['KeyA'] = normX < -0.25;
    engine.keys['KeyD'] = normX > 0.25;

    // Auto-sprint if pushed all the way forward or sprint lock is toggled
    if (normY < -0.85 || isSprintLockedRef.current) {
      engine.keys['ShiftLeft'] = true;
    } else if (!isSprintLockedRef.current) {
      engine.keys['ShiftLeft'] = false;
    }
  };

  // FULL-SCREEN MULTI-TOUCH HANDLER
  // Handles:
  // 1. Drag-to-Aim on Fire Buttons
  // 2. Camera Look with other finger while holding Fire Button
  // 3. Virtual Joystick movement
  useEffect(() => {
    if (!engine) return;

    const handleWindowTouchStart = (e: TouchEvent) => {
      sound.resume();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = e.target as HTMLElement | null;

        // 1. Touch inside Virtual Joystick area
        if (joystickRef.current && (joystickRef.current.contains(target) || joystickRef.current === target)) {
          joystickTouchIdRef.current = touch.identifier;
          updateJoystick(touch.clientX, touch.clientY);
          continue;
        }

        // 2. Touch on Primary (Right) Fire Button
        if (rightFireBtnRef.current && (rightFireBtnRef.current.contains(target) || rightFireBtnRef.current === target)) {
          fireTouchIdsRef.current.add(touch.identifier);
          lastTouchPosRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
          engine.isMouseDown = true;
          setIsFiringRight(true);
          continue;
        }

        // 3. Touch on Secondary (Left) Fire Button
        if (leftFireBtnRef.current && (leftFireBtnRef.current.contains(target) || leftFireBtnRef.current === target)) {
          fireTouchIdsRef.current.add(touch.identifier);
          lastTouchPosRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
          engine.isMouseDown = true;
          setIsFiringLeft(true);
          continue;
        }

        // 4. Touch on other action buttons (Jump, Crouch, Scope, Reload, Heal, Sprint, Weapons, F)
        const btn = target?.closest('button');
        if (btn) {
          buttonTouchIdsRef.current.add(touch.identifier);
          continue;
        }

        // 5. ANY OTHER TOUCH on the screen -> Camera Look & Aiming (Works even while firing!)
        lookTouchIdsRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
        setIsLooking(true);
      }
    };

    const handleWindowTouchMove = (e: TouchEvent) => {
      // Prevent browser zooming / gesture navigation
      if (e.cancelable) {
        e.preventDefault();
      }

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // A. Move Joystick
        if (touch.identifier === joystickTouchIdRef.current) {
          updateJoystick(touch.clientX, touch.clientY);
          continue;
        }

        // B. Drag-to-Aim on Fire Buttons (aims and controls recoil with the shooting finger)
        if (fireTouchIdsRef.current.has(touch.identifier)) {
          const prev = lastTouchPosRef.current.get(touch.identifier);
          if (prev) {
            const dx = touch.clientX - prev.x;
            const dy = touch.clientY - prev.y;
            lastTouchPosRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            engine.rotateCamera(dx, dy, true);
          }
          continue;
        }

        // C. Look / Aim touch (including when firing with another finger!)
        if (lookTouchIdsRef.current.has(touch.identifier)) {
          const prev = lookTouchIdsRef.current.get(touch.identifier);
          if (prev) {
            const dx = touch.clientX - prev.x;
            const dy = touch.clientY - prev.y;
            lookTouchIdsRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            engine.rotateCamera(dx, dy);
          }
          continue;
        }
      }
    };

    const handleWindowTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // A. Joystick touch ended
        if (touch.identifier === joystickTouchIdRef.current) {
          joystickTouchIdRef.current = null;
          setStickPos({ x: 0, y: 0 });
          engine.keys['KeyW'] = false;
          engine.keys['KeyS'] = false;
          engine.keys['KeyA'] = false;
          engine.keys['KeyD'] = false;
          if (!isSprintLockedRef.current) {
            engine.keys['ShiftLeft'] = false;
          }
        }

        // B. Fire Button touch ended
        if (fireTouchIdsRef.current.has(touch.identifier)) {
          fireTouchIdsRef.current.delete(touch.identifier);
          lastTouchPosRef.current.delete(touch.identifier);

          if (fireTouchIdsRef.current.size === 0) {
            engine.isMouseDown = false;
            setIsFiringRight(false);
            setIsFiringLeft(false);
          } else {
            // Still firing with another finger
            setIsFiringRight(false);
          }
        }

        // C. Look touch ended
        if (lookTouchIdsRef.current.has(touch.identifier)) {
          lookTouchIdsRef.current.delete(touch.identifier);
          if (lookTouchIdsRef.current.size === 0) {
            setIsLooking(false);
          }
        }

        // D. Action button touch ended
        if (buttonTouchIdsRef.current.has(touch.identifier)) {
          buttonTouchIdsRef.current.delete(touch.identifier);
        }
      }
    };

    window.addEventListener('touchstart', handleWindowTouchStart, { passive: false });
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleWindowTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleWindowTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('touchstart', handleWindowTouchStart);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
      window.removeEventListener('touchcancel', handleWindowTouchEnd);
      if (engine) {
        engine.isMouseDown = false;
      }
    };
  }, [engine]);

  if (!engine) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden touch-none">
      {/* Visual Indicator when aiming with finger */}
      {isLooking && (
        <div className="absolute top-4 right-4 pointer-events-none px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-[10px] font-mono text-amber-300 backdrop-blur-sm animate-pulse">
          AIMING / LOOK
        </div>
      )}

      {/* TOP RIGHT QUICK CONTROLS */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto z-20">
        {/* Heal button */}
        <button
          onClick={() => {
            if (!engine) return;
            if (engine.inventory.consumables.medkit > 0) engine.useConsumable('medkit');
            else if (engine.inventory.consumables.first_aid > 0) engine.useConsumable('first_aid');
            else if (engine.inventory.consumables.bandage > 0) engine.useConsumable('bandage');
            else if (engine.inventory.consumables.energy_drink > 0) engine.useConsumable('energy_drink');
          }}
          className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1 backdrop-blur-sm active:bg-emerald-800 shadow-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          <span>HEAL</span>
        </button>

        {/* Sprint Lock Toggle */}
        <button
          onClick={() => {
            if (!engine) return;
            const next = !isSprintLocked;
            setIsSprintLocked(next);
            engine.keys['ShiftLeft'] = next;
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1 backdrop-blur-sm border transition-colors cursor-pointer ${
            isSprintLocked
              ? 'bg-amber-500 border-amber-400 text-stone-950 shadow-md'
              : 'bg-black/60 border-white/20 text-stone-300 active:bg-stone-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{isSprintLocked ? 'SPRINT ON' : 'RUN'}</span>
        </button>

        {/* Quick Sensitivity & Settings Button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-xs font-mono font-bold flex items-center gap-1 backdrop-blur-sm shadow-md cursor-pointer active:bg-amber-500/40"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>SENS</span>
          </button>
        )}
      </div>

      {/* LEFT FIRE BUTTON (Above joystick for two-thumb claw shooting while aiming with right thumb) */}
      <div className="absolute top-28 left-6 pointer-events-auto z-20">
        <button
          ref={leftFireBtnRef}
          onMouseDown={() => {
            if (!engine) return;
            engine.isMouseDown = true;
            setIsFiringLeft(true);
          }}
          onMouseUp={() => {
            if (!engine) return;
            if (fireTouchIdsRef.current.size === 0) {
              engine.isMouseDown = false;
              setIsFiringLeft(false);
            }
          }}
          className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center backdrop-blur-sm shadow-xl transition-all cursor-pointer touch-none ${
            isFiringLeft
              ? 'bg-red-500 border-red-300 scale-95 shadow-red-500/60'
              : 'bg-red-600/85 border-red-400/80 active:scale-95 shadow-lg'
          }`}
        >
          <Target className="w-6 h-6 text-white pointer-events-none" />
          <span className="text-[8px] font-mono font-bold text-white/90 pointer-events-none">
            FIRE
          </span>
        </button>
      </div>

      {/* BOTTOM LEFT: VIRTUAL MOVEMENT JOYSTICK */}
      <div className="absolute bottom-6 left-6 pointer-events-auto z-20 select-none">
        <div
          ref={joystickRef}
          className="relative w-36 h-36 rounded-full border-2 border-white/25 bg-black/45 backdrop-blur-md flex items-center justify-center touch-none shadow-2xl"
        >
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-white/25 pointer-events-none">
            DRAG TO MOVE
          </div>
          <div
            style={{ transform: `translate(${stickPos.x}px, ${stickPos.y}px)` }}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 border border-amber-300 shadow-xl pointer-events-none transition-transform duration-75 flex items-center justify-center"
          >
            <div className="w-4 h-4 rounded-full bg-stone-950/40" />
          </div>
        </div>
      </div>

      {/* BOTTOM CENTER: WEAPON SWITCH BUTTONS */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto z-20">
        <button
          onClick={() => {
            if (engine) engine.switchWeaponSlot(1);
          }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold backdrop-blur-sm transition-colors cursor-pointer ${
            engine.inventory.activeSlot === 1
              ? 'bg-amber-500 border-amber-300 text-stone-950 shadow-md'
              : 'bg-black/60 border-white/20 text-stone-300 active:bg-stone-800'
          }`}
        >
          1: {engine.inventory.weapon1 ? engine.inventory.weapon1.toUpperCase() : 'M416'}
        </button>

        <button
          onClick={() => {
            if (engine) engine.switchWeaponSlot(2);
          }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold backdrop-blur-sm transition-colors cursor-pointer ${
            engine.inventory.activeSlot === 2
              ? 'bg-amber-500 border-amber-300 text-stone-950 shadow-md'
              : 'bg-black/60 border-white/20 text-stone-300 active:bg-stone-800'
          }`}
        >
          2: {engine.inventory.weapon2 ? engine.inventory.weapon2.toUpperCase() : 'AKM'}
        </button>

        <button
          onClick={() => {
            if (engine) engine.switchWeaponSlot(3);
          }}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold backdrop-blur-sm transition-colors cursor-pointer ${
            engine.inventory.activeSlot === 3
              ? 'bg-amber-500 border-amber-300 text-stone-950 shadow-md'
              : 'bg-black/60 border-white/20 text-stone-300 active:bg-stone-800'
          }`}
        >
          PAN
        </button>
      </div>

      {/* BOTTOM RIGHT: TACTICAL COMBAT BUTTONS */}
      <div className="absolute bottom-6 right-5 flex flex-col items-end gap-3 pointer-events-auto z-20">
        {/* Row 1: Action (F / Loot / Drive / Plane Jump), Scope ADS & Reload */}
        <div className="flex items-center gap-2.5">
          {/* Action / Interact (F) Button */}
          <button
            onClick={() => {
              if (engine) engine.handleInteract();
            }}
            className="px-4 py-2.5 rounded-2xl bg-amber-500 active:bg-amber-400 border-2 border-amber-300 text-stone-950 font-bold text-xs font-mono shadow-xl flex items-center gap-1.5 backdrop-blur-sm cursor-pointer"
          >
            <Hand className="w-4 h-4 pointer-events-none" />
            <span className="pointer-events-none">
              {engine.gamePhase === 'in_plane'
                ? 'JUMP PLANE'
                : isDriving
                ? 'EXIT CAR'
                : 'ACTION (F)'}
            </span>
          </button>

          {/* Scope ADS Toggle */}
          <button
            onClick={() => {
              if (engine) engine.isScoping = !engine.isScoping;
            }}
            className={`w-13 h-13 rounded-2xl border-2 flex items-center justify-center backdrop-blur-sm shadow-xl transition-all cursor-pointer ${
              engine.isScoping
                ? 'bg-amber-500 border-amber-300 text-stone-950 shadow-amber-500/40'
                : 'bg-black/65 border-white/30 text-stone-100 active:bg-stone-800'
            }`}
          >
            <Crosshair className="w-6 h-6 pointer-events-none" />
          </button>

          {/* Reload Button */}
          <button
            onClick={() => {
              if (engine) engine.startReload();
            }}
            className="w-12 h-12 rounded-2xl bg-black/65 border-2 border-white/30 text-stone-200 flex items-center justify-center backdrop-blur-sm shadow-lg active:bg-stone-700 cursor-pointer"
          >
            <RotateCw className="w-5 h-5 pointer-events-none" />
          </button>
        </div>

        {/* Row 2: Crouch, Jump & Primary FIRE Trigger with Drag-to-Aim */}
        <div className="flex items-center gap-3">
          {/* Crouch Toggle */}
          <button
            onClick={() => {
              if (engine) engine.keys['KeyC'] = !engine.keys['KeyC'];
            }}
            className={`w-12 h-12 rounded-2xl border-2 text-xs font-mono font-bold flex items-center justify-center backdrop-blur-sm shadow-lg transition-colors cursor-pointer ${
              engine.isCrouched
                ? 'bg-amber-500 border-amber-300 text-stone-950'
                : 'bg-black/65 border-white/30 text-stone-200 active:bg-stone-700'
            }`}
          >
            CROUCH
          </button>

          {/* Jump / Parachute Impulse */}
          <button
            onClick={() => {
              if (!engine) return;
              if (engine.gamePhase === 'freefall') {
                engine.deployParachute();
              } else {
                engine.keys['Space'] = true;
                setTimeout(() => { if (engine) engine.keys['Space'] = false; }, 200);
              }
            }}
            className="w-13 h-13 rounded-2xl bg-black/65 border-2 border-white/35 text-stone-100 flex flex-col items-center justify-center backdrop-blur-sm shadow-xl active:bg-stone-700 cursor-pointer"
          >
            <ArrowUp className="w-5 h-5 pointer-events-none" />
            <span className="text-[9px] font-mono font-bold pointer-events-none">JUMP</span>
          </button>

          {/* Primary FIRE Trigger (Big Red Button with Drag-to-Aim Recoil Control) */}
          <div className="relative flex flex-col items-center">
            <button
              ref={rightFireBtnRef}
              onMouseDown={() => {
                if (!engine) return;
                engine.isMouseDown = true;
                setIsFiringRight(true);
              }}
              onMouseUp={() => {
                if (!engine) return;
                if (fireTouchIdsRef.current.size === 0) {
                  engine.isMouseDown = false;
                  setIsFiringRight(false);
                }
              }}
              className={`w-20 h-20 rounded-full border-3 text-white flex flex-col items-center justify-center shadow-2xl transition-transform touch-none select-none cursor-pointer ${
                isFiringRight
                  ? 'bg-red-500 border-white scale-105 shadow-red-500/60'
                  : 'bg-gradient-to-tr from-red-700 to-red-500 border-red-300 active:scale-95'
              }`}
            >
              <div className="w-8 h-8 rounded-full border-2 border-white/80 flex items-center justify-center shadow-inner pointer-events-none">
                <div className={`w-3.5 h-3.5 rounded-full ${isFiringRight ? 'bg-amber-300 animate-ping' : 'bg-white'}`} />
              </div>
              <span className="text-[8px] font-mono font-bold mt-1 tracking-tighter text-white/90 pointer-events-none">
                DRAG TO AIM
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
