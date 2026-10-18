/**
 * Tactical Circular Minimap & Compass for BGMI
 * Renders player position, safe white circle, blue zone boundary,
 * nearby vehicles, sound indicators, and click-to-open map.
 */

import React, { useRef, useEffect } from 'react';
import { RadarBotInfo, SafeZoneState, SoundIndicator } from '../game/types';
import { MAP_SIZE, HALF_MAP } from '../game/terrain';
import { VehicleInstance } from '../game/worldBuilder';

interface MinimapProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  safeZone: SafeZoneState;
  vehicles: VehicleInstance[];
  soundIndicators?: SoundIndicator[];
  radarBots: RadarBotInfo[];
  onOpenFullMap: () => void;
}

export const Minimap: React.FC<MinimapProps> = ({
  playerX,
  playerZ,
  playerYaw,
  safeZone,
  vehicles,
  soundIndicators,
  radarBots,
  onOpenFullMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compass degrees
  const deg = Math.round(((-playerYaw * 180) / Math.PI + 360) % 360);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const viewRadiusMeters = 160; // 160m visible radius around player
    const scale = (size / 2) / viewRadiusMeters;

    ctx.clearRect(0, 0, size, size);

    // Save clip circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.clip();

    // Background terrain representation (topographic GPS)
    ctx.fillStyle = '#1c241e';
    ctx.fillRect(0, 0, size, size);

    // Clean subtle tactical GPS grid (No radar range rings)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(size, center);
    ctx.moveTo(center, 0);
    ctx.lineTo(center, size);
    ctx.stroke();

    // Transform world coordinates relative to player
    // Blue Zone
    const blueDistX = (safeZone.centerX - playerX) * scale;
    const blueDistZ = (safeZone.centerZ - playerZ) * scale;
    const blueR = safeZone.blueRadius * scale;

    ctx.beginPath();
    ctx.arc(center + blueDistX, center + blueDistZ, blueR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // White Safe Circle
    const whiteDistX = (safeZone.targetCenterX - playerX) * scale;
    const whiteDistZ = (safeZone.targetCenterZ - playerZ) * scale;
    const whiteR = safeZone.targetRadius * scale;

    ctx.beginPath();
    ctx.arc(center + whiteDistX, center + whiteDistZ, whiteR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vehicles nearby
    vehicles.forEach((v) => {
      const vx = (v.position.x - playerX) * scale;
      const vz = (v.position.z - playerZ) * scale;
      if (Math.hypot(vx, vz) < center - 6) {
        ctx.fillStyle = '#f59e0b'; // amber
        ctx.beginPath();
        ctx.arc(center + vx, center + vz, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Friendly Squadmates only (Enemies are strictly NOT tracked on radar/map)
    radarBots.forEach((rb) => {
      if (!rb.isTeammate) return;
      const rx = (rb.x - playerX) * scale;
      const rz = (rb.z - playerZ) * scale;
      const dist = Math.hypot(rx, rz);

      if (dist < center - 4) {
        ctx.fillStyle = rb.isKnocked ? '#f59e0b' : '#22c55e';
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Player arrow in center
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-playerYaw);

    ctx.fillStyle = '#22c55e'; // green triangle
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.restore();

    // Border ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, center - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [playerX, playerZ, playerYaw, safeZone, vehicles, radarBots]);

  // Calculate distance to safe circle boundary
  const distToSafeCenter = Math.hypot(playerX - safeZone.targetCenterX, playerZ - safeZone.targetCenterZ);
  const distToSafeEdge = Math.max(0, Math.round(distToSafeCenter - safeZone.targetRadius));

  return (
    <div className="flex flex-col items-end gap-1.5 select-none">
      {/* Compass Tape */}
      <div className="flex items-center justify-between w-36 px-2 py-0.5 rounded bg-black/50 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-stone-200">
        <span className="font-semibold text-emerald-400">
          {deg >= 338 || deg < 23 ? 'N' : deg < 68 ? 'NE' : deg < 113 ? 'E' : deg < 158 ? 'SE' : deg < 203 ? 'S' : deg < 248 ? 'SW' : deg < 293 ? 'W' : 'NW'}
        </span>
        <span className="text-stone-400">{deg}°</span>
        <span className="text-[10px] text-amber-400">{distToSafeEdge}m</span>
      </div>

      {/* Tactical GPS Minimap */}
      <div
        onClick={onOpenFullMap}
        title="Click to view 1000m Tactical Map (M)"
        className="relative group cursor-pointer w-36 h-36 rounded-full p-1 bg-stone-950/70 backdrop-blur-sm border border-white/15 shadow-xl hover:border-amber-400/60 transition-colors"
      >
        <canvas ref={canvasRef} width={136} height={136} className="w-full h-full rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded-full transition-opacity">
          <span className="text-[10px] font-mono text-amber-300 font-semibold tracking-wider">
            [M] 1000m MAP
          </span>
        </div>
      </div>
    </div>
  );
};
