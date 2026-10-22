/**
 * Victory / Defeat Modal for BGMI
 * Iconic "Winner Winner Chicken Dinner!" screen with match statistics and restart button.
 */

import React from 'react';
import { Trophy, Skull, Target, Clock, RotateCcw } from 'lucide-react';

interface GameOverModalProps {
  isVictory: boolean;
  stats: {
    kills: number;
    damage: number;
    rank: number;
    survivalTime: number;
  };
  onRestart: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isVictory,
  stats,
  onRestart,
}) => {
  const [countdown, setCountdown] = React.useState(3);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(stats.survivalTime / 60);
  const seconds = stats.survivalTime % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in zoom-in-95 duration-200">
      <div className="relative flex flex-col items-center bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-md w-full text-center">
        {/* Banner Badge */}
        {isVictory ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.5)]">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-amber-400 tracking-wider font-sans drop-shadow-md">
              WINNER WINNER
            </h1>
            <h2 className="text-xl md:text-2xl font-bold text-amber-300 tracking-wide font-sans">
              CHICKEN DINNER!
            </h2>
            <div className="text-xs font-mono text-stone-400 tracking-widest uppercase">
              #1 / 29 SURVIVORS · BATTLEFIELD CHAMPION
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
              <Skull className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-100 tracking-wider font-sans">
              BETTER LUCK NEXT TIME!
            </h1>
            <div className="text-xs font-mono text-stone-400 tracking-widest uppercase">
              RANK #{stats.rank} / 29
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 w-full my-6 font-mono text-left">
          <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
              <Skull className="w-3.5 h-3.5 text-amber-500" />
              <span>Kills</span>
            </div>
            <div className="text-xl font-bold text-stone-100">{stats.kills}</div>
          </div>

          <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
              <Target className="w-3.5 h-3.5 text-red-500" />
              <span>Damage</span>
            </div>
            <div className="text-xl font-bold text-stone-100">{stats.damage}</div>
          </div>

          <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Final Rank</span>
            </div>
            <div className="text-xl font-bold text-stone-100">#{stats.rank}</div>
          </div>

          <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-sky-500" />
              <span>Survival Time</span>
            </div>
            <div className="text-xl font-bold text-stone-100">{timeFormatted}</div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => window.location.reload()}
          className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all ${
            isVictory
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-500/30'
              : 'bg-stone-100 hover:bg-white text-stone-950 shadow-stone-100/20'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reload & Play Again</span>
        </button>

        <div className="mt-3 text-xs font-mono text-stone-400">
          Reloading match in <span className="text-amber-400 font-bold">{countdown}s</span>...
        </div>
      </div>
    </div>
  );
};
