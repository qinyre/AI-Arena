/**
 * 中栏主视觉：按阶段分组的叙事事件流。
 * 不是平铺长列表，而是用阶段分隔条组织成"第N轮·夜晚 → 白天 → 投票"的故事线。
 * 夜晚行动(刀/查)在上帝视角下可见，标注【私密】。
 */
import { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';
import SpeechBubble from './SpeechBubble';
import VoteResult from './VoteResult';
import type { GameEvent, GameStatusResponse, RoundData } from '../../types/api';
import {
  isPhaseChange,
  isWerewolfKill,
  isSeerInvestigate,
  isPlayerSpeech,
  isPlayerDeath,
  isVoteResult,
  isGameEnd,
} from '../../types/api';

interface Props {
  events: GameEvent[];
  rounds: RoundData[];
  status: GameStatusResponse | null;
}

function phaseMeta(phase: string): { label: string; icon: string } {
  if (phase === 'night') return { label: '夜晚', icon: '🌙' };
  if (phase === 'day') return { label: '白天', icon: '☀️' };
  if (phase === 'vote' || phase === 'voting') return { label: '投票', icon: '🗳️' };
  return { label: phase, icon: '•' };
}

export default function EventFeed({ events, rounds, status }: Props) {
  const roleAssignment = status?.role_assignment;
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // 自动滚到底(用户上滚查看时暂停)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [events.length]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto custom-scrollbar space-y-1 pr-1">
      {events.length > 0 && (
        <div className="text-center py-3">
          <span className="text-xs text-gray-400 bg-gray-700/40 px-3 py-1 rounded-full">
            🎭 对局开始 · 上帝视角
          </span>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center text-gray-500 py-12 text-sm">
          <div className="text-3xl mb-3 opacity-30">🌙</div>
          夜幕降临，对局即将开始...
        </div>
      )}

      {events.map((e, idx) => {
        // 阶段分隔条
        if (isPhaseChange(e)) {
          const meta = phaseMeta(e.data.to);
          const isNight = e.data.to === 'night';
          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-2 my-4 px-2',
                isNight ? 'text-indigo-300' : e.data.to === 'day' ? 'text-amber-300' : 'text-sky-300',
              )}
            >
              <div className="flex-1 h-px bg-current opacity-20" />
              <span className="text-xs font-medium whitespace-nowrap">
                {meta.icon} 第{e.data.round}轮 · {meta.label}
              </span>
              <div className="flex-1 h-px bg-current opacity-20" />
            </div>
          );
        }

        // 夜晚行动——私密事件，上帝视角可见
        if (isWerewolfKill(e)) {
          return (
            <div key={idx} className="flex items-center gap-2 px-2 py-1.5 animate-fade-in-up">
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20">
                【私密】
              </span>
              <span className="text-xs text-gray-300">
                🐺 <b>{e.data.killer}</b> 选择杀害 <b>{e.data.target}</b>
              </span>
            </div>
          );
        }
        if (isSeerInvestigate(e)) {
          const isWolf = e.data.result === '狼人';
          return (
            <div key={idx} className="flex items-center gap-2 px-2 py-1.5 animate-fade-in-up">
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">
                【私密】
              </span>
              <span className="text-xs text-gray-300">
                🔮 <b>{e.data.seer}</b> 查验 <b>{e.data.target}</b>：
                <span className={isWolf ? 'text-red-300 font-medium' : 'text-emerald-300 font-medium'}>
                  {' '}{e.data.result}
                </span>
              </span>
            </div>
          );
        }

        // 发言
        if (isPlayerSpeech(e)) {
          return (
            <div key={idx} className="py-1.5">
              <SpeechBubble speech={e} roleAssignment={roleAssignment} />
            </div>
          );
        }

        // 死亡公告：夜晚死亡醒目展示；投票死亡由 vote_result 区块显示，这里跳过
        if (isPlayerDeath(e)) {
          if (e.data.cause === 'voted_out') return null;
          return (
            <div
              key={idx}
              className="my-2 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-center animate-fade-in-up"
            >
              <span className="text-sm text-red-200">
                💀 <b>{e.data.player}</b> 在夜晚遇害(第{e.data.round}轮)
              </span>
            </div>
          );
        }

        // vote_result：找到该轮的 votes 一起渲染
        if (isVoteResult(e)) {
          const round = e.data.round;
          const roundData = rounds.find((r) => r.round === round);
          return (
            <div key={idx} className="my-2 bg-gray-750/40 rounded-lg p-3 animate-fade-in-up">
              <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                <span>🗳️</span> 投票结果
              </div>
              <VoteResult votes={roundData?.votes || []} result={e} />
              {e.data.result === 'eliminated' && e.data.eliminated && (
                <div className="mt-2 text-center text-sm text-red-200 bg-red-900/20 border border-red-700/40 rounded px-2 py-1.5">
                  💀 <b>{e.data.eliminated}</b> 被投票放逐(第{round}轮)
                </div>
              )}
            </div>
          );
        }

        // game_end
        if (isGameEnd(e)) {
          const winner = e.data.winner;
          return (
            <div
              key={idx}
              className={cn(
                'my-4 rounded-lg px-4 py-3 text-center border animate-fade-in-up',
                winner === 'good'
                  ? 'bg-emerald-900/30 border-emerald-600/50'
                  : 'bg-red-900/30 border-red-600/50',
              )}
            >
              <div className="text-lg font-bold text-gray-100">
                {winner === 'good' ? '👥 好人阵营胜利' : '🐺 狼人阵营胜利'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                历经 {e.data.final_round} 轮 · {e.data.duration_seconds.toFixed(1)}s
              </div>
            </div>
          );
        }

        // 其它未知事件：不渲染
        return null;
      })}

      <div ref={bottomRef} />
    </div>
  );
}
