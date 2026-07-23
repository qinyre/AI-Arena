/**
 * 右栏：AI 推理侧栏。
 * 默认跟随当前发言者；点击左栏玩家可切换。
 * 展示该 AI 最近一次决策的 reasoning(刀/查/投/发言)。
 */
import { useMemo } from 'react';
import { cn } from '../../utils/cn';
import { avatarColor, getRoleConfig } from './roleConfig';
import { getLatestReasoningForPlayer } from '../../hooks/useGameStream';
import type { GameEvent, GameStatusResponse, PlayerWithRole } from '../../types/api';

interface Props {
  events: GameEvent[];
  status: GameStatusResponse | null;
  players: PlayerWithRole[];
  selectedPlayer: string | null;
  currentSpeaker: string | null;
}

const KIND_LABEL: Record<string, { label: string; icon: string; cls: string }> = {
  speech: { label: '发言思考', icon: '💬', cls: 'text-sky-300' },
  kill: { label: '刀人决策', icon: '🐺', cls: 'text-red-300' },
  investigate: { label: '查验决策', icon: '🔮', cls: 'text-amber-300' },
  vote: { label: '投票思考', icon: '🗳️', cls: 'text-violet-300' },
};

export default function ReasoningSidebar({
  events,
  status,
  players,
  selectedPlayer,
  currentSpeaker,
}: Props) {
  // 目标玩家：手动选中 > 当前发言者 > 第一个存活玩家
  const targetId = useMemo(() => {
    if (selectedPlayer) return selectedPlayer;
    if (currentSpeaker) return currentSpeaker;
    return players.find((p) => p.alive)?.id || players[0]?.id || null;
  }, [selectedPlayer, currentSpeaker, players]);

  const reasoning = useMemo(
    () => (targetId ? getLatestReasoningForPlayer(events, targetId) : null),
    [events, targetId],
  );

  const role = status?.role_assignment?.[targetId || ''];
  const rc = role ? getRoleConfig(role) : null;
  const player = players.find((p) => p.id === targetId);
  const kindMeta = reasoning ? KIND_LABEL[reasoning.kind] : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">🧠 AI 思考</h3>
        <span className="text-[10px] text-gray-500">点击玩家切换</span>
      </div>

      {!targetId && (
        <div className="text-center text-gray-500 text-sm py-8">等待 AI 思考...</div>
      )}

      {targetId && (
        <>
          {/* 玩家头部 */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-700/50">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
                avatarColor(targetId),
                !player?.alive && 'grayscale opacity-60',
              )}
            >
              {targetId.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || targetId.slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-200">{targetId}</div>
              {rc && (
                <span className={cn('text-[10px] px-1 py-0.5 rounded', rc.badgeClass)}>
                  {rc.icon} {rc.label}
                </span>
              )}
            </div>
          </div>

          {/* 推理内容 */}
          {reasoning && kindMeta ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div
                className={cn(
                  'text-[11px] font-medium mb-2 flex items-center gap-1',
                  kindMeta.cls,
                )}
              >
                <span>{kindMeta.icon}</span>
                {kindMeta.label}
                {reasoning.round > 0 && <span className="text-gray-500">· 第{reasoning.round}轮</span>}
              </div>
              <div className="text-sm text-gray-200 leading-relaxed bg-gray-750/40 rounded-lg p-3 reasoning-content">
                {reasoning.text || '(无推理内容)'}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500 text-sm">
                <div className="text-2xl mb-2 opacity-40">💭</div>
                该玩家暂无思考记录
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
