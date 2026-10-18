/**
 * 1000m x 1000m Full Tactical Map Modal for BGMI
 * Full map tactical overview with grid, POIs, safe zone, blue zone, player marker, and road network.
 */

import React, { useRef, useEffect } from 'react';
import { RadarBotInfo, SafeZoneState, MAP_POIS } from '../game/types';
import { MAP_SIZE, HALF_MAP, ROAD_NETWORK } from '../game/terrain';
import { VehicleInstance } from '../game/worldBuilder';
import { X, Navigation } from 'lucide-react';

interface FullMapModalProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  safeZone: SafeZoneState;
  vehicles: VehicleInstance[];
  radarBots: RadarBotInfo[];
  onClose: () => void;
}

export const FullMapModal: React.FC<FullMapModalProps> = ({
  playerX,
  playerZ,
  playerYaw,
  safeZone,
  vehicles,
  radarBots,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // World to canvas coordinate transform
    const toCanvasX = (worldX: number) => ((worldX + HALF_MAP) / MAP_SIZE) * size;
    const toCanvasZ = (worldZ: number) => ((worldZ + HALF_MAP) / MAP_SIZE) * size;
    const toCanvasScale = (dist: number) => (dist / MAP_SIZE) * size;

    // 1. Ocean Background
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(0, 0, size, size);

    // 2. Island Landmass (approximate polygon / ellipse with texture)
    ctx.fillStyle = '#365331'; // tactical olive terrain
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size * 0.44, size * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. River Canal cutting across southern strait
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.moveTo(toCanvasX(-420), toCanvasZ(170));
    ctx.bezierCurveTo(
      toCanvasX(-100), toCanvasZ(190),
      toCanvasX(120), toCanvasZ(165),
      toCanvasX(420), toCanvasZ(195)
    );
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1e3a5f';
    ctx.stroke();

    // 4. Roads
    ctx.strokeStyle = '#4a4843';
    ctx.lineWidth = 3.5;
    ROAD_NETWORK.forEach((road) => {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(road.startX), toCanvasZ(road.startZ));
      ctx.lineTo(toCanvasX(road.endX), toCanvasZ(road.endZ));
      ctx.stroke();
    });

    // 5. Grid Lines (100m squares)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += size / 10) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // 6. Points of Interest (POIs)
    MAP_POIS.forEach((poi) => {
      const px = toCanvasX(poi.x);
      const pz = toCanvasZ(poi.z);

      // Circle marker
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(px, pz, toCanvasScale(poi.radius * 0.45), 0, Math.PI * 2);
      ctx.fill();

      // Label text
      ctx.fillStyle = '#f3f4f6';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(poi.name, px, pz);
    });

    // 7. Blue Zone (Electric circle)
    const blueX = toCanvasX(safeZone.centerX);
    const blueZ = toCanvasZ(safeZone.centerZ);
    const blueR = toCanvasScale(safeZone.blueRadius);

    ctx.beginPath();
    ctx.arc(blueX, blueZ, blueR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Blue zone shaded exterior
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(blueX, blueZ, blueR, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(30, 64, 175, 0.22)';
    ctx.fill();
    ctx.restore();

    // 8. White Safe Zone Circle
    const whiteX = toCanvasX(safeZone.targetCenterX);
    const whiteZ = toCanvasZ(safeZone.targetCenterZ);
    const whiteR = toCanvasScale(safeZone.targetRadius);

    ctx.beginPath();
    ctx.arc(whiteX, whiteZ, whiteR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 9. Vehicles
    vehicles.forEach((v) => {
      const vx = toCanvasX(v.position.x);
      const vz = toCanvasZ(v.position.z);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(vx, vz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 10. Friendly Squadmates only (Enemies are NOT shown on map for realistic scouting)
    radarBots.forEach((rb) => {
      if (!rb.isTeammate) return;
      const rx = toCanvasX(rb.x);
      const rz = toCanvasZ(rb.z);
      
      ctx.fillStyle = rb.isKnocked ? '#f59e0b' : '#22c55e';
      ctx.beginPath();
      ctx.arc(rx, rz, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 11. Player Marker (Bright green directional triangle)
    const pX = toCanvasX(playerX);
    const pZ = toCanvasZ(playerZ);

    ctx.save();
    ctx.translate(pX, pZ);
    ctx.rotate(-playerYaw);

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();

    // Surrounding pulse ring
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }, [playerX, playerZ, playerYaw, safeZone, vehicles, radarBots]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col items-center bg-stone-900 border border-stone-800 rounded-xl shadow-2xl p-4 max-w-xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between w-full pb-3 border-b border-stone-800 mb-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-stone-100 tracking-wide font-sans">
              1000m x 1000m Battlefield Map
            </h2>
            <span className="text-xs font-mono text-stone-400">· Phase {safeZone.phase}/{safeZone.totalPhases}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Canvas */}
        <div className="relative border border-stone-700/60 rounded-lg overflow-hidden shadow-inner">
          <canvas ref={canvasRef} width={480} height={480} className="w-full max-w-[480px] aspect-square block" />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-stone-400 mt-3 pt-2 border-t border-stone-800 w-full">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>You/Teammate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 border-t border-dashed border-white" />
            <span>Safe Circle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span>Blue Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Vehicle</span>
          </div>
          <span className="text-stone-500">Press [M] or [ESC] to exit</span>
        </div>
      </div>
    </div>
  );
};
