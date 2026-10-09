/**
 * Settings & Optimization Modal for BGMI
 * Specifically optimized for older laptops with shadow mode switches,
 * render scale selector, draw distance, and controls guide.
 */

import React from 'react';
import { GraphicSettings } from '../game/types';
import { X, Sliders, Monitor, Volume2, Gamepad2, Laptop } from 'lucide-react';
import { sound } from '../game/audio';

interface SettingsModalProps {
  settings: GraphicSettings;
  onUpdateSettings: (newSettings: GraphicSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const applyPreset = (preset: 'low_spec' | 'balanced' | 'high') => {
    if (preset === 'low_spec') {
      onUpdateSettings({
        ...settings,
        shadowMode: 'simple_blob',
        renderScale: 0.75,
        drawDistance: 350,
        targetFps: 60,
      });
    } else if (preset === 'balanced') {
      onUpdateSettings({
        ...settings,
        shadowMode: 'simple_blob',
        renderScale: 1.0,
        drawDistance: 600,
        targetFps: 60,
      });
    } else {
      onUpdateSettings({
        ...settings,
        shadowMode: 'directional_fast',
        renderScale: 1.0,
        drawDistance: 900,
        targetFps: 60,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col bg-stone-900 border border-stone-800 rounded-xl shadow-2xl p-5 max-w-xl w-full text-stone-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-stone-100 tracking-wide">
              Game Settings & Laptop Optimization
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets for Older Laptops */}
        <div className="mb-4 p-3 rounded-lg bg-stone-950/70 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-amber-400">
            <Laptop className="w-4 h-4" />
            <span>Older Laptop Optimization Presets</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => applyPreset('low_spec')}
              className="py-1.5 px-2 text-xs rounded font-medium bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 transition-colors"
            >
              Older Laptop (60 FPS)
            </button>
            <button
              onClick={() => applyPreset('balanced')}
              className="py-1.5 px-2 text-xs rounded font-medium bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 transition-colors"
            >
              Balanced (Default)
            </button>
            <button
              onClick={() => applyPreset('high')}
              className="py-1.5 px-2 text-xs rounded font-medium bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 transition-colors"
            >
              High Quality
            </button>
          </div>
        </div>

        {/* Graphics Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-400 uppercase tracking-wider">
            <Monitor className="w-4 h-4" />
            <span>Graphics & Performance</span>
          </div>

          {/* Shadow Mode */}
          <div className="space-y-1.5">
            <label className="text-xs text-stone-300 font-medium flex justify-between">
              <span>Shadow Mode</span>
              <span className="text-amber-400 text-[11px]">
                {settings.shadowMode === 'simple_blob' ? 'Simple Shadow (Fastest)' : settings.shadowMode === 'directional_fast' ? 'Directional Shadow' : 'Off'}
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'simple_blob', label: 'Simple Shadow (Blob)' },
                { id: 'directional_fast', label: 'Directional' },
                { id: 'off', label: 'Shadows Off' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onUpdateSettings({ ...settings, shadowMode: opt.id as any })}
                  className={`py-1.5 text-xs rounded font-mono border transition-colors ${
                    settings.shadowMode === opt.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-500">
              * Simple Shadow uses lightweight terrain contact decals with zero shadow map overhead, optimal for older dual-core / Intel HD laptops.
            </p>
          </div>

          {/* Render Scale */}
          <div className="space-y-1.5">
            <label className="text-xs text-stone-300 font-medium flex justify-between">
              <span>Resolution / Render Scale</span>
              <span className="text-stone-400 text-[11px]">{Math.round(settings.renderScale * 100)}%</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onUpdateSettings({ ...settings, renderScale: 0.75 })}
                className={`py-1.5 text-xs rounded font-mono border transition-colors ${
                  settings.renderScale === 0.75
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                75% (Smooth 60 FPS on older GPUs)
              </button>
              <button
                onClick={() => onUpdateSettings({ ...settings, renderScale: 1.0 })}
                className={`py-1.5 text-xs rounded font-mono border transition-colors ${
                  settings.renderScale === 1.0
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                100% (Native Sharp)
              </button>
            </div>
          </div>

          {/* Draw Distance */}
          <div className="space-y-1.5">
            <label className="text-xs text-stone-300 font-medium flex justify-between">
              <span>View Distance</span>
              <span className="text-stone-400 text-[11px]">{settings.drawDistance} meters</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { dist: 350, label: '350m (Low-Spec)' },
                { dist: 600, label: '600m (Medium)' },
                { dist: 900, label: '900m (High)' },
              ].map((d) => (
                <button
                  key={d.dist}
                  onClick={() => onUpdateSettings({ ...settings, drawDistance: d.dist as any })}
                  className={`py-1.5 text-xs rounded font-mono border transition-colors ${
                    settings.drawDistance === d.dist
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                      : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audio & Mouse Sensitivity */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-stone-300 font-medium flex justify-between">
                <span>Mouse Sensitivity</span>
                <span className="text-stone-400 text-[11px]">{settings.mouseSensitivity.toFixed(1)}x</span>
              </label>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.1"
                value={settings.mouseSensitivity}
                onChange={(e) => onUpdateSettings({ ...settings, mouseSensitivity: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-stone-300 font-medium flex justify-between">
                <span>Master Volume</span>
                <span className="text-stone-400 text-[11px]">{Math.round(settings.masterVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={settings.masterVolume}
                onChange={(e) => {
                  const vol = parseFloat(e.target.value);
                  sound.setVolume(vol);
                  onUpdateSettings({ ...settings, masterVolume: vol });
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Mouse Vertical Look Direction Toggle (Invert Mouse Y) */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-stone-950/60 border border-stone-800">
            <div>
              <div className="text-xs font-medium text-stone-200">Mouse Vertical Look (Pitch)</div>
              <div className="text-[11px] text-stone-500">
                {settings.invertMouseY
                  ? 'Inverted (Mouse Up tilts down, Mouse Down tilts up)'
                  : 'Standard (Mouse Up looks up, Mouse Down looks down)'}
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ ...settings, invertMouseY: !settings.invertMouseY })}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                settings.invertMouseY
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {settings.invertMouseY ? 'INVERTED' : 'STANDARD (UP=UP)'}
            </button>
          </div>

          {/* On-Screen Touch Controls toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-stone-950/60 border border-stone-800">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-stone-400" />
              <div>
                <div className="text-xs font-medium text-stone-200">On-Screen Touch Controls</div>
                <div className="text-[11px] text-stone-500">Virtual joystick & buttons for touchscreens / tablets</div>
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ ...settings, showTouchControls: !settings.showTouchControls })}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                settings.showTouchControls
                  ? 'bg-amber-500 text-stone-950 font-semibold'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {settings.showTouchControls ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* Controls Quick Reference */}
          <div className="pt-2 border-t border-stone-800">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Pure FPP Controls</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-stone-400">
              <div><strong className="text-stone-200">WASD:</strong> Move / Glide / Steer</div>
              <div><strong className="text-stone-200">Mouse:</strong> Look around (Pure FPP)</div>
              <div><strong className="text-stone-200">Y:</strong> Toggle Look Invert (Up/Down)</div>
              <div><strong className="text-stone-200">Left Click:</strong> Fire weapon (4-5 hits knock)</div>
              <div><strong className="text-stone-200">Right Click:</strong> ADS Scope (Red Dot / 4x / 8x)</div>
              <div><strong className="text-stone-200">F:</strong> Drop / Interact / Drive / Revive</div>
              <div><strong className="text-stone-200">1 / 2 / 3:</strong> Weapon Slots</div>
              <div><strong className="text-stone-200">R:</strong> Reload</div>
              <div><strong className="text-stone-200">Shift:</strong> Sprint / Boost</div>
              <div><strong className="text-stone-200">Space:</strong> Jump / Handbrake</div>
              <div><strong className="text-stone-200">C / Z:</strong> Crouch / Prone</div>
              <div><strong className="text-stone-200">Tab / M:</strong> Inventory / 1000m Map</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
