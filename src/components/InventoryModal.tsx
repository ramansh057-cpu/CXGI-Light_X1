/**
 * Tactical Inventory Modal for BGMI
 * Equipment slots, weapons, ammo reserves, and click-to-use medical supplies.
 */

import React from 'react';
import { InventoryState, WEAPON_DEFS, ConsumableType, CONSUMABLE_DEFS } from '../game/types';
import { X, Shield, HardHat, Backpack, HeartPulse, Zap } from 'lucide-react';

interface InventoryModalProps {
  inventory: InventoryState;
  onUseConsumable: (type: ConsumableType) => void;
  onSwitchSlot: (slot: 1 | 2 | 3) => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  inventory,
  onUseConsumable,
  onSwitchSlot,
  onClose,
}) => {
  const w1 = inventory.weapon1 ? WEAPON_DEFS[inventory.weapon1] : null;
  const w2 = inventory.weapon2 ? WEAPON_DEFS[inventory.weapon2] : null;
  const melee = inventory.melee ? WEAPON_DEFS[inventory.melee] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col bg-stone-900 border border-stone-800 rounded-xl shadow-2xl p-5 max-w-2xl w-full text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
          <div className="flex items-center gap-2">
            <Backpack className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-stone-100 tracking-wide">
              Tactical Inventory (Tab)
            </h2>
            <span className="text-xs font-mono text-stone-400">· Lv{inventory.backpackLevel} Backpack</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: Weapons & Melee */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Equipped Weapons</h3>

            {/* Weapon 1 */}
            <div
              onClick={() => onSwitchSlot(1)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                inventory.activeSlot === 1
                  ? 'border-amber-500/80 bg-stone-800/80 shadow-md'
                  : 'border-stone-800 bg-stone-950/60 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 font-semibold">[1] Primary</span>
                {inventory.activeSlot === 1 && (
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Active</span>
                )}
              </div>
              <div className="text-sm font-semibold text-stone-100 mt-1">{w1 ? w1.name : 'Empty Slot'}</div>
              {w1 && (
                <div className="text-xs font-mono text-stone-400 mt-1 flex justify-between">
                  <span>Ammo: {inventory.weapon1Ammo} / {w1.magSize}</span>
                  <span>Scope: {w1.scopeType}</span>
                </div>
              )}
            </div>

            {/* Weapon 2 */}
            <div
              onClick={() => onSwitchSlot(2)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                inventory.activeSlot === 2
                  ? 'border-amber-500/80 bg-stone-800/80 shadow-md'
                  : 'border-stone-800 bg-stone-950/60 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 font-semibold">[2] Secondary</span>
                {inventory.activeSlot === 2 && (
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Active</span>
                )}
              </div>
              <div className="text-sm font-semibold text-stone-100 mt-1">{w2 ? w2.name : 'Empty Slot'}</div>
              {w2 && (
                <div className="text-xs font-mono text-stone-400 mt-1 flex justify-between">
                  <span>Ammo: {inventory.weapon2Ammo} / {w2.magSize}</span>
                  <span>Scope: {w2.scopeType}</span>
                </div>
              )}
            </div>

            {/* Melee Slot */}
            <div
              onClick={() => onSwitchSlot(3)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                inventory.activeSlot === 3
                  ? 'border-amber-500/80 bg-stone-800/80 shadow-md'
                  : 'border-stone-800 bg-stone-950/60 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 font-semibold">[3] Melee</span>
              </div>
              <div className="text-sm font-semibold text-stone-100 mt-1">{melee ? melee.name : 'Cast Iron Pan'}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">Deflects bullets from behind</div>
            </div>
          </div>

          {/* Column 2: Armor & Gear */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Armor & Protection</h3>

            {/* Helmet */}
            <div className="p-3 rounded-lg border border-stone-800 bg-stone-950/60 flex items-center gap-3">
              <div className="p-2 rounded bg-stone-800/80 text-amber-400">
                <HardHat className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-mono text-stone-400">Head Armor</div>
                <div className="text-sm font-semibold text-stone-100">
                  {inventory.helmetLevel > 0 ? `Level ${inventory.helmetLevel} Helmet` : 'No Helmet'}
                </div>
                <div className="text-[11px] text-stone-400">
                  {inventory.helmetLevel === 3 ? '55% Headshot Reduction' : inventory.helmetLevel === 2 ? '40% Reduction' : '30% Reduction'}
                </div>
              </div>
            </div>

            {/* Vest */}
            <div className="p-3 rounded-lg border border-stone-800 bg-stone-950/60 flex items-center gap-3">
              <div className="p-2 rounded bg-stone-800/80 text-emerald-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-mono text-stone-400">Body Armor</div>
                <div className="text-sm font-semibold text-stone-100">
                  {inventory.armorLevel > 0 ? `Level ${inventory.armorLevel} Police Vest` : 'No Vest'}
                </div>
                <div className="text-[11px] text-stone-400">
                  {inventory.armorLevel === 3 ? '55% Body Damage Reduction' : inventory.armorLevel === 2 ? '40% Reduction' : '30% Reduction'}
                </div>
              </div>
            </div>

            {/* Ammo Reserves */}
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider pt-2">Ammo Reserves</h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-stone-950/80 border border-stone-800 flex justify-between">
                <span className="text-emerald-400">5.56mm</span>
                <span className="font-semibold text-stone-100">{inventory.ammo['5.56mm']}</span>
              </div>
              <div className="p-2 rounded bg-stone-950/80 border border-stone-800 flex justify-between">
                <span className="text-amber-400">7.62mm</span>
                <span className="font-semibold text-stone-100">{inventory.ammo['7.62mm']}</span>
              </div>
              <div className="p-2 rounded bg-stone-950/80 border border-stone-800 flex justify-between">
                <span className="text-sky-400">.300 Mag</span>
                <span className="font-semibold text-stone-100">{inventory.ammo['300mag']}</span>
              </div>
              <div className="p-2 rounded bg-stone-950/80 border border-stone-800 flex justify-between">
                <span className="text-red-400">12 Gauge</span>
                <span className="font-semibold text-stone-100">{inventory.ammo['12gauge']}</span>
              </div>
            </div>
          </div>

          {/* Column 3: Medical Supplies & Consumables */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Medical & Boosts</h3>

            {(['medkit', 'first_aid', 'energy_drink', 'painkiller', 'bandage'] as ConsumableType[]).map((type) => {
              const def = CONSUMABLE_DEFS[type];
              const count = inventory.consumables[type] || 0;
              const isBoost = def.boostAmount > 0;

              return (
                <div
                  key={type}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-stone-800 bg-stone-950/60"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded ${isBoost ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                      {isBoost ? <Zap className="w-4 h-4" /> : <HeartPulse className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-stone-200">{def.name}</div>
                      <div className="text-[10px] text-stone-400">
                        {isBoost ? `+${def.boostAmount} Boost` : `+${def.healAmount} HP (${def.useTime}s)`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-stone-300">x{count}</span>
                    <button
                      disabled={count <= 0}
                      onClick={() => onUseConsumable(type)}
                      className="px-2.5 py-1 text-[11px] font-mono rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:hover:bg-stone-800 text-stone-200 transition-colors"
                    >
                      Use
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-stone-800 text-center text-xs text-stone-500 font-mono">
          Press [TAB] or [ESC] to return to battle
        </div>
      </div>
    </div>
  );
};
