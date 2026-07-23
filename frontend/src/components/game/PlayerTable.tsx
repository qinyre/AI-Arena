/**
 * 左栏：玩家圆桌。上帝视角——开局即显示所有人身份。
 * 存活/死亡状态、当前发言者高亮、死因标注。
 */
import { cn } from '../../utils/cn';
import { getRoleConfig, deathCauseLabel, avatarColor } from './roleConfig';
import type { PlayerWithRole } from '../../types/api';

interface Props {
  players: PlayerWithRole[];
  currentSpeaker: string | null;
  selectedPlayer: string | null;
  onSelectPlayer: (id: string) => void;
}

export default function PlayerTable({
  players,
  currentSpeaker,
  selectedPlayer,
  onSelectPlayer,
}: Props) {
  if (players.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8 text-sm">等待玩家加入...</div>
    );
  }

  const alive = players.filter((p) => p.alive);
  const dead = players.filter((p) => !p.alive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">玩家</h3>
        <span className="text-xs text-gray-500">
          {alive.length} 存活 / {dead.length} 出局
        </span>
      </div>

      {/* 存活玩家 */}
      <div className="space-y-2">
        {alive.map((p) => {
          const rc = getRoleConfig(p.role);
          const isSpeaking = p.id === currentSpeaker;
          const isSelected = p.id === selectedPlayer;
          return (
            <button
              key={p.id}
              onClick={() => onSelectPlayer(p.id)}
              className={cn(
                'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left',
                isSpeaking
                  ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                  : isSelected
                  ? 'border-sky-400/40 bg-sky-500/10'
                  : 'border-transparent bg-gray-750/40 hover:bg-gray-700/50',
              )}
            >
              <div className="relative shrink-0">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold',
                    avatarColor(p.id),
                  )}
                >
                  {p.id.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || p.id.slice(0, 2)}
                </div>
                {isSpeaking && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-gray-800 animate-pulse" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-100 truncate">{p.id}</span>
                  {isSpeaking && (
                    <span className="text-[10px] text-amber-300 animate-pulse">发言中</span>
                  )}
                </div>
                <span
                  className={cn(
                    'inline-block text-[11px] px-1.5 py-0.5 rounded mt-0.5',
                    rc.badgeClass,
                  )}
                >
                  {rc.icon} {rc.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 出局玩家 */}
      {dead.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-700/50">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">出局</div>
          {dead.map((p) => {
            const rc = getRoleConfig(p.role);
            return (
              <button
                key={p.id}
                onClick={() => onSelectPlayer(p.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-lg text-left opacity-70 hover:opacity-100 transition-opacity',
                  p.id === selectedPlayer && 'bg-sky-500/10',
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold grayscale',
                    avatarColor(p.id),
                  )}
                >
                  {p.id.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || p.id.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-400 line-through">{p.id}</span>
                  <span className={cn('ml-1.5 text-[11px]', rc.badgeClass, 'rounded px-1 py-0.5')}>
                    {rc.icon}
                  </span>
                  <div className="text-[10px] text-gray-500">
                    {deathCauseLabel(p.deathCause)}
                    {p.deathRound ? ` · 第${p.deathRound}轮` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
