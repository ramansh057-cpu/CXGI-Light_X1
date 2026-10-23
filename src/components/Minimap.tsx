/**
 * Tactical Combat Radar & Minimap for BGMI
 * Tracks real-time enemy positions with high-tech sweeping radar beam,
 * distance range rings (50m, 100m, 150m), glowing pulsing hostile blips,
 * perimeter threat indicators, vehicle locations, and safe zone boundaries.
 */

import React, { useRef, useEffect, useState } from 'react';
import { RadarBotInfo, SafeZoneState, SoundIndicator } from '../game/types';
import { VehicleInstance } from '../game/worldBuilder';
import { Radio, AlertTriangle, Compass } from 'lucide-react';

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
  soundIndicators = [],
  radarBots,
  onOpenFullMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animTime, setAnimTime] = useState(0);

  // Compass degrees
  const deg = Math.round(((-playerYaw * 180) / Math.PI + 360) % 360);

  // Count active enemies within 180m radar envelope
  const enemyBots = radarBots.filter((rb) => !rb.isTeammate);
  const enemiesInRange = enemyBots.filter((rb) => {
    const d = Math.hypot(rb.x - playerX, rb.z - playerZ);
    return d <= 180;
  });

  const nearestEnemyDist = enemiesInRange.length > 0
    ? Math.min(...enemiesInRange.map((rb) => Math.round(Math.hypot(rb.x - playerX, rb.z - playerZ))))
    : null;

  // Animation frame loop for continuous sweeping radar beam
  useEffect(() => {
    let animId: number;
    const animate = () => {
      setAnimTime(Date.now());
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const viewRadiusMeters = 160; // 160m visible radius on radar scope
    const scale = (size / 2) / viewRadiusMeters;

    ctx.clearRect(0, 0, size, size);

    // Save clip circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.clip();

    // 1. Tactical Dark Radar Scope Background
    ctx.fillStyle = '#0a100d';
    ctx.fillRect(0, 0, size, size);

    // Subtle dark grid
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(size, center);
    ctx.moveTo(center, 0);
    ctx.lineTo(center, size);
    ctx.stroke();

    // 2. Concentric Radar Distance Range Rings (50m, 100m, 150m)
    const ranges = [50, 100, 150];
    ranges.forEach((range) => {
      const r = range * scale;
      ctx.beginPath();
      ctx.arc(center, center, r, 0, Math.PI * 2);
      ctx.strokeStyle = range === 100 ? 'rgba(34, 197, 94, 0.22)' : 'rgba(34, 197, 94, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Range text labels
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
      ctx.fillText(`${range}m`, center + 3, center - r + 8);
    });

    // 3. Sweeping Radar Beam (High-tech military radar sweep)
    const sweepSpeed = 0.0022; // Sweep rotation speed
    const sweepAngle = (animTime * sweepSpeed) % (Math.PI * 2);

    const sweepGradient = ctx.createRadialGradient(center, center, 0, center, center, center - 2);
    sweepGradient.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
    sweepGradient.addColorStop(1, 'rgba(34, 197, 94, 0.02)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, center - 2, sweepAngle - 0.45, sweepAngle);
    ctx.closePath();
    ctx.fillStyle = sweepGradient;
    ctx.fill();

    // Leading crisp sweep line
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.cos(sweepAngle) * (center - 2), center + Math.sin(sweepAngle) * (center - 2));
    ctx.stroke();
    ctx.restore();

    // 4. Safe White Zone Circle & Blue Zone Boundary
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Vehicles on Radar
    vehicles.forEach((v) => {
      const vx = (v.position.x - playerX) * scale;
      const vz = (v.position.z - playerZ) * scale;
      if (Math.hypot(vx, vz) < center - 6) {
        ctx.fillStyle = '#f59e0b'; // amber vehicle
        ctx.beginPath();
        ctx.arc(center + vx, center + vz, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 6. Friendly Squad Teammates (Bright Green)
    radarBots.forEach((rb) => {
      if (!rb.isTeammate) return;
      const rx = (rb.x - playerX) * scale;
      const rz = (rb.z - playerZ) * scale;
      const dist = Math.hypot(rx, rz);

      if (dist < center - 6) {
        ctx.fillStyle = rb.isKnocked ? '#f59e0b' : '#22c55e';
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, 4, 0, Math.PI * 2);
        ctx.fill();

        // White core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 7. ENEMY RADAR TRACKING (High-Visibility Pulsing Crimson Hostiles)
    enemyBots.forEach((enemy) => {
      const rx = (enemy.x - playerX) * scale;
      const rz = (enemy.z - playerZ) * scale;
      const distPixels = Math.hypot(rx, rz);
      const distMeters = Math.round(distPixels / scale);

      if (distMeters > 180) return; // Beyond 180m radar detection envelope

      if (distPixels < center - 8) {
        // Enemy is inside radar disk
        const pulsePhase = (animTime * 0.006 + enemy.x * 0.1) % 1;

        // Animated expanding radar ping echo wave
        ctx.strokeStyle = enemy.isKnocked
          ? `rgba(245, 158, 11, ${1 - pulsePhase})`
          : `rgba(239, 68, 68, ${1 - pulsePhase})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, 4 + pulsePhase * 10, 0, Math.PI * 2);
        ctx.stroke();

        // Outer glow
        ctx.fillStyle = enemy.isKnocked ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.4)';
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, 6, 0, Math.PI * 2);
        ctx.fill();

        // Solid hostile blip
        ctx.fillStyle = enemy.isKnocked ? '#f59e0b' : '#ef4444';
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, enemy.isKnocked ? 3.5 : 4.5, 0, Math.PI * 2);
        ctx.fill();

        // High-contrast center pip
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(center + rx, center + rz, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Distance text label for close threats (< 90m)
        if (distMeters <= 90) {
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = '#fca5a5';
          ctx.fillText(`${distMeters}m`, center + rx + 6, center + rz + 3);
        }
      } else {
        // Enemy is between 160m and 180m: render edge threat triangle on radar perimeter
        const edgeAngle = Math.atan2(rz, rx);
        const edgeX = center + Math.cos(edgeAngle) * (center - 7);
        const edgeY = center + Math.sin(edgeAngle) * (center - 7);

        ctx.save();
        ctx.translate(edgeX, edgeY);
        ctx.rotate(edgeAngle + Math.PI / 2);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(3.5, 3.5);
        ctx.lineTo(-3.5, 3.5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    });

    // 8. Player Arrow in Radar Center
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-playerYaw);

    // Green tactical directional triangle
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6.5);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5.5, 6.5);
    ctx.closePath();
    ctx.fill();

    // Center focal dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();

    // 9. Outer Radar Bezel / Border Ring
    ctx.strokeStyle = enemiesInRange.length > 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(center, center, center - 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle 4 cardinal notches on bezel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach((angle) => {
      ctx.beginPath();
      ctx.moveTo(center + Math.cos(angle) * (center - 5), center + Math.sin(angle) * (center - 5));
      ctx.lineTo(center + Math.cos(angle) * (center - 1), center + Math.sin(angle) * (center - 1));
      ctx.stroke();
    });
  }, [playerX, playerZ, playerYaw, safeZone, vehicles, radarBots, animTime]);

  // Calculate distance to safe circle boundary
  const distToSafeCenter = Math.hypot(playerX - safeZone.targetCenterX, playerZ - safeZone.targetCenterZ);
  const distToSafeEdge = Math.max(0, Math.round(distToSafeCenter - safeZone.targetRadius));

  return (
    <div className="flex flex-col items-end gap-1.5 select-none">
      {/* Dynamic Enemy Radar Status Banner */}
      <div
        className={`flex items-center justify-between w-40 px-2.5 py-1 rounded-md backdrop-blur-md border text-[10px] font-mono font-bold shadow-lg transition-all ${
          enemiesInRange.length > 0
            ? 'bg-red-950/80 border-red-500/70 text-red-200'
            : 'bg-black/60 border-emerald-500/30 text-emerald-300'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              enemiesInRange.length > 0 ? 'bg-red-500 animate-ping' : 'bg-emerald-400'
            }`}
          />
          <Radio className="w-3.5 h-3.5" />
          <span>RADAR</span>
        </span>
        <span className="tracking-tight">
          {enemiesInRange.length > 0
            ? `${enemiesInRange.length} HOSTILE${enemiesInRange.length > 1 ? 'S' : ''} (${nearestEnemyDist}m)`
            : '180M SCAN OK'}
        </span>
      </div>

      {/* Heading Tape & Safe Zone Distance */}
      <div className="flex items-center justify-between w-40 px-2.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-stone-200">
        <span className="font-semibold text-emerald-400">
          {deg >= 338 || deg < 23 ? 'N' : deg < 68 ? 'NE' : deg < 113 ? 'E' : deg < 158 ? 'SE' : deg < 203 ? 'S' : deg < 248 ? 'SW' : deg < 293 ? 'W' : 'NW'} {deg}°
        </span>
        <span className="text-[10px] text-amber-400 font-semibold">{distToSafeEdge}m to Zone</span>
      </div>

      {/* Tactical Radar Screen */}
      <div
        onClick={onOpenFullMap}
        title="Tactical Radar (Tracking Enemies within 180m) · Click or press [M] to open 1000m Full Map"
        className={`relative group cursor-pointer w-40 h-40 rounded-full p-1 bg-stone-950/85 backdrop-blur-md border shadow-2xl transition-all ${
          enemiesInRange.length > 0
            ? 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
            : 'border-emerald-500/30 hover:border-amber-400/60'
        }`}
      >
        <canvas ref={canvasRef} width={152} height={152} className="w-full h-full rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/50 rounded-full transition-opacity">
          <span className="text-[10px] font-mono text-amber-300 font-bold tracking-wider">
            [M] 1000m MAP
          </span>
        </div>
      </div>
    </div>
  );
};
