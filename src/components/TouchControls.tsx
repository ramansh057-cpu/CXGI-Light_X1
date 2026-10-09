/**
 * Touch Controls for Touchscreen Laptops & Mobile
 * On-screen virtual joystick, fire button, scope button, jump, crouch, reload.
 */

import React, { useRef, useState } from 'react';
import { Crosshair, ShieldAlert, RotateCw, ArrowUp, User } from 'lucide-react';
import { GameEngine } from '../game/gameEngine';

interface TouchControlsProps {
  engine: GameEngine | null;
  isDriving: boolean;
}

export const TouchControls: React.FC<TouchControlsProps> = ({ engine, isDriving }) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  if (!engine) return null;

  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleJoystickTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setStickPos({ x: 0, y: 0 });
        if (engine) {
          engine.keys['KeyW'] = false;
          engine.keys['KeyS'] = false;
          engine.keys['KeyA'] = false;
          engine.keys['KeyD'] = false;
        }
        break;
      }
    }
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickRef.current || !engine) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 40;

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * clampedDist;
    const sy = Math.sin(angle) * clampedDist;

    setStickPos({ x: sx, y: sy });

    // Thresholds for directional keys
    const normX = sx / maxRadius;
    const normY = sy / maxRadius;

    engine.keys['KeyW'] = normY < -0.3;
    engine.keys['KeyS'] = normY > 0.3;
    engine.keys['KeyA'] = normX < -0.3;
    engine.keys['KeyD'] = normX > 0.3;
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4">
      {/* Top right quick actions */}
      <div className="flex justify-end gap-2 pointer-events-auto">
        <div className="px-3 py-1 rounded-full bg-black/60 border border-white/20 text-[10px] font-mono text-amber-400 backdrop-blur-sm">
          PURE FPP
        </div>
      </div>

      {/* Bottom Area */}
      <div className="flex items-end justify-between w-full">
        {/* Left: Virtual Movement Joystick */}
        <div
          ref={joystickRef}
          onTouchStart={handleJoystickTouchStart}
          onTouchMove={handleJoystickTouchMove}
          onTouchEnd={handleJoystickTouchEnd}
          onTouchCancel={handleJoystickTouchEnd}
          className="relative w-32 h-32 rounded-full border-2 border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto select-none touch-none"
        >
          <div
            style={{ transform: `translate(${stickPos.x}px, ${stickPos.y}px)` }}
            className="w-12 h-12 rounded-full bg-amber-500/80 shadow-lg pointer-events-none transition-transform duration-75"
          />
        </div>

        {/* Right: Tactical Action Buttons */}
        <div className="flex flex-col items-end gap-3 pointer-events-auto select-none">
          {/* Top row of action buttons: Scope & Reload */}
          <div className="flex items-center gap-3">
            <button
              onTouchStart={() => {
                engine.isScoping = !engine.isScoping;
              }}
              className={`w-14 h-14 rounded-full border-2 flex items-center justify-center backdrop-blur-sm shadow-lg ${
                engine.isScoping
                  ? 'bg-amber-500 border-amber-400 text-stone-950 font-bold'
                  : 'bg-black/60 border-white/30 text-stone-200'
              }`}
            >
              <Crosshair className="w-6 h-6" />
            </button>

            <button
              onTouchStart={() => {
                engine.keys['KeyR'] = true;
                setTimeout(() => { engine.keys['KeyR'] = false; }, 100);
              }}
              className="w-12 h-12 rounded-full bg-black/60 border-2 border-white/30 text-stone-200 flex items-center justify-center backdrop-blur-sm shadow-lg active:bg-stone-700"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>

          {/* Jump, Crouch & Primary FIRE */}
          <div className="flex items-center gap-3">
            <button
              onTouchStart={() => {
                engine.keys['KeyC'] = !engine.keys['KeyC'];
              }}
              className="w-12 h-12 rounded-full bg-black/60 border border-white/20 text-stone-300 flex items-center justify-center text-xs font-mono backdrop-blur-sm shadow-lg active:bg-stone-700"
            >
              C
            </button>

            <button
              onTouchStart={() => {
                engine.keys['Space'] = true;
                setTimeout(() => { engine.keys['Space'] = false; }, 200);
              }}
              className="w-12 h-12 rounded-full bg-black/60 border border-white/20 text-stone-300 flex items-center justify-center backdrop-blur-sm shadow-lg active:bg-stone-700"
            >
              <ArrowUp className="w-5 h-5" />
            </button>

            {/* Fire Button (Big Red Trigger) */}
            <button
              onTouchStart={() => { engine.isMouseDown = true; }}
              onTouchEnd={() => { engine.isMouseDown = false; }}
              className="w-18 h-18 rounded-full bg-red-600/90 active:bg-red-500 border-2 border-red-400 text-white flex items-center justify-center shadow-xl active:scale-95 transition-transform"
            >
              <div className="w-8 h-8 rounded-full border border-white/80 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-white" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
