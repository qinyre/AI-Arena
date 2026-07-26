/**
 * 中央时间线(主舞台)。借鉴稿剧场风格:
 * 顶部标题区 + 垂直渐变竖线 + 彩色圆点事件流。
 * phase_change 渲染为竖线上的阶段分隔条;其余事件交给 TimelineEvent。
 * 上帝视角:夜晚行动(刀/查)可见,标【私密】。
 *
 * 自动滚到底(用户上滚查看时暂停)—— 用 scrollTop 直赋,不用 scrollIntoView
 * (scrollIntoView 会触发窗口滚动导致跳顶 bug,历史教训)。
 */
import { useEffect, useRef } from 'react';
import TimelineEvent from './TimelineEvent';
import { isPhaseChange, isWerewolfKill } from '../../types/api';
import type { GameEvent, GameStatusResponse, RoundData, WerewolfKillEvent } from '../../types/api';

interface Props {
  events: GameEvent[];
  rounds: RoundData[];
  status: GameStatusResponse | null;
}

function phaseMeta(phase: string): { label: string; symbol: string } {
  if (phase === 'night') return { label: '夜晚', symbol: 'dark_mode' };
  if (phase === 'day') return { label: '白天', symbol: 'light_mode' };
  if (phase === 'vote' || phase === 'voting') return { label: '投票', symbol: 'how_to_vote' };
  if (phase === 'tiebreak_speech') return { label: '平票辩护', symbol: 'record_voice_over' };
  if (phase === 'tiebreak_voting') return { label: '加赛投票', symbol: 'how_to_vote' };
  if (phase === 'death_skill') return { label: '死亡技能', symbol: 'my_location' };
  return { label: phase, symbol: 'circle' };
}

export default function EventFeed({ events, rounds, status }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // 监听用户上滚(查看历史时暂停自动滚)
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

  // 新事件来了,自动滚到底(仅当用户没在上滚查看)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || userScrolledUp.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const roleAssignment = status?.role_assignment;

  return (
    <div className="h-full flex flex-col">
      {/* 标题区 */}
      <div className="text-center mb-4 shrink-0">
        <h2 className="font-display text-display-lg text-transparent bg-clip-text bg-gradient-to-r from-[#d3e4fe] to-[#c8c5cd] m-0 leading-none text-[32px]">
          事件时间线
        </h2>
        <p className="font-body text-body-md text-[#c8c5cb]/80 mt-1">
          观看 AI 思考、决策和博弈的全过程
        </p>
      </div>

      {/* 时间线滚动区 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto custom-scrollbar relative pr-3"
      >
        {events.length === 0 && (
          <div className="text-center text-[#c8c5cb]/60 py-16 font-body">
            <span className="material-symbols-outlined text-[48px] opacity-30 block mb-3">
              dark_mode
            </span>
            夜幕降临,对局即将开始...
          </div>
        )}

        {events.length > 0 && (
          <>
            {/* 对局开始标记 */}
            <div className="text-center py-3 relative z-10">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#c8c5cb]/70 bg-[#1b2b3f]/60 px-3 py-1 rounded-full font-label uppercase tracking-wider border border-[#47464b]/40">
                <span className="material-symbols-outlined text-[14px]">theater_comedy</span>
                对局开始 · 上帝视角
              </span>
            </div>

            {/* 竖线(渐变) */}
            <div className="timeline-line" />

            {/* 事件流 */}
            {events.map((e, idx) => {
              // phase_change → 阶段分隔条
              if (isPhaseChange(e)) {
                const meta = phaseMeta(e.data.to);
                const isNight = e.data.to === 'night';
                const isTiebreak = String(e.data.to).startsWith('tiebreak');
                const accent = isNight ? '#c8c5cb' : (isTiebreak ? '#c4b5fd' : '#ffe16d');
                const candidates: string[] = e.data.candidates || [];
                return (
                  <div
                    key={idx}
                    className="relative z-10 flex items-center gap-2 my-2.5 px-2 flex-wrap"
                  >
                    <span
                      className="material-symbols-outlined text-[16px]"
                      style={{ color: `${accent}99` }}
                    >
                      {meta.symbol}
                    </span>
                    <span
                      className="font-label text-label-md uppercase tracking-wider whitespace-nowrap"
                      style={{ color: `${accent}cc` }}
                    >
                      第 {e.data.round} 轮 · {meta.label}
                    </span>
                    {candidates.length > 0 && (
                      <span
                        className="font-label text-label-sm px-2 py-0.5 rounded border whitespace-nowrap"
                        style={{
                          color: accent,
                          borderColor: `${accent}55`,
                          background: `${accent}14`,
                        }}
                      >
                        平票: {candidates.join(' / ')}
                      </span>
                    )}
                    <div className="flex-1 h-px bg-[#47464b]/30 min-w-[20px]" />
                  </div>
                );
              }

              if (isWerewolfKill(e)) {
                if (idx > 0 && isWerewolfKill(events[idx - 1])) return null;
                const wolfKillEvents: WerewolfKillEvent[] = [];
                for (let i = idx; i < events.length && isWerewolfKill(events[i]); i += 1) {
                  wolfKillEvents.push(events[i] as WerewolfKillEvent);
                }
                return (
                  <TimelineEvent
                    key={idx}
                    event={e}
                    wolfKillEvents={wolfKillEvents}
                    rounds={rounds}
                    roleAssignment={roleAssignment}
                    index={idx}
                  />
                );
              }

              // 其余事件 → 时间线条目
              return (
                <TimelineEvent
                  key={idx}
                  event={e}
                  rounds={rounds}
                  roleAssignment={roleAssignment}
                  index={idx}
                />
              );
            })}

            <div className="h-8" />
          </>
        )}
      </div>
    </div>
  );
}
