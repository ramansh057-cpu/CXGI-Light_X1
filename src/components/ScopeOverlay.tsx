/**
 * ADS (Aim Down Sights) Reticles for BGMI
 * Supports Red Dot, 4x ACOG Scope, and 8x Sniper Scope.
 */

import React from 'react';
import { WeaponDef } from '../game/types';

interface ScopeOverlayProps {
  weapon: WeaponDef | null;
  isScoping: boolean;
}

export const ScopeOverlay: React.FC<ScopeOverlayProps> = ({ weapon, isScoping }) => {
  if (!isScoping || !weapon) return null;

  const scopeType = weapon.scopeType;

  if (scopeType === 'red_dot') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
        {/* Subtle glass optic circle */}
        <div className="w-48 h-48 rounded-full border border-emerald-500/20 bg-emerald-950/10 flex items-center justify-center backdrop-brightness-95 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
          {/* Glowing Red Dot */}
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
        </div>
      </div>
    );
  }

  if (scopeType === '4x') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 bg-black/40">
        {/* Scope barrel vignette */}
        <div className="relative w-[340px] h-[340px] md:w-[480px] md:h-[480px] rounded-full border-[18px] md:border-[28px] border-stone-900 bg-stone-900/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.85)] flex items-center justify-center overflow-hidden">
          {/* Crosshairs */}
          <div className="absolute w-full h-[1px] bg-stone-900/80" />
          <div className="absolute h-full w-[1px] bg-stone-900/80" />

          {/* Red Chevron Reticle */}
          <div className="relative flex flex-col items-center">
            {/* Illuminated Red Tip */}
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-red-500" />
            <div className="w-[1.5px] h-12 bg-red-500" />
            {/* Range markers */}
            <div className="w-8 h-[1px] bg-stone-900 my-1" />
            <div className="w-5 h-[1px] bg-stone-900 my-1" />
            <div className="w-3 h-[1px] bg-stone-900 my-1" />
          </div>

          {/* Compass / Range text */}
          <div className="absolute bottom-6 font-mono text-[10px] text-red-500/80 tracking-widest">
            4X ACOG · 400M
          </div>
        </div>
      </div>
    );
  }

  if (scopeType === '8x') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 bg-black/60">
        {/* Full Sniper Vignette */}
        <div className="relative w-[380px] h-[380px] md:w-[560px] md:h-[560px] rounded-full border-[24px] md:border-[38px] border-stone-950 bg-stone-900/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.95)] flex items-center justify-center overflow-hidden">
          {/* Mil-dot Crosshair lines */}
          <div className="absolute w-full h-[1.5px] bg-stone-950" />
          <div className="absolute h-full w-[1.5px] bg-stone-950" />

          {/* Mil-dots on horizontal */}
          <div className="absolute flex gap-6 items-center">
            {[-3, -2, -1, 1, 2, 3].map((n) => (
              <div key={n} className="w-1.5 h-1.5 rounded-full bg-stone-950" />
            ))}
          </div>

          {/* Mil-dots on vertical */}
          <div className="absolute flex flex-col gap-6 items-center">
            {[-3, -2, -1, 1, 2, 3].map((n) => (
              <div key={n} className="w-1.5 h-1.5 rounded-full bg-stone-950" />
            ))}
          </div>

          {/* Center glowing bead */}
          <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-[0_0_6px_#dc2626]" />

          {/* Elevation Mil text */}
          <div className="absolute top-10 font-mono text-[11px] text-stone-400 tracking-wider">
            8X CQB-MIL
          </div>
          <div className="absolute bottom-10 font-mono text-[11px] text-stone-400 tracking-wider">
            ELEV 100M
          </div>
        </div>
      </div>
    );
  }

  return null;
};
