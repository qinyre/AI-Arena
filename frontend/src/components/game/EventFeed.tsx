/**
 * 中央时间线(主舞台)。借鉴稿剧场风格:
 * 顶部标题区 + 垂直渐变竖线 + 彩色圆点事件流。
 * phase_change 渲染为竖线上的阶段分隔条;其余事件交给 TimelineEvent。
 * 上帝视角:夜晚行动(刀/查)可见,标【私密】。
 *
 * 自动滚到底(用户上滚查看时暂停)—— 用 scrollTop 直赋,不用 scrollIntoView
 * (scrollIntoView 会触发窗口滚动导致跳顶 bug,历史教训)。
 */
import { useEffect, useRef, useState } from 'react';
import TimelineEvent from './TimelineEvent';
import { isPhaseChange, isWerewolfKill } from '../../types/api';
import type { GameEvent, GameStatusResponse, RoundData, WerewolfKillEvent } from '../../types/api';
import { eventMatchesFilter, type EventFilter } from './gameDirector';
import { cn } from '../../utils/cn';

interface Props {
  events: GameEvent[];
  rounds: RoundData[];
  status: GameStatusResponse | null;
  followPlayback?: boolean;
  eventFilter?: EventFilter;
  focusEventIndex?: number | null;
}

function phaseMeta(phase: string): { label: string; symbol: string } {
  if (phase === 'sheriff_campaign') return { label: '警长竞选', symbol: 'campaign' };
  if (phase === 'sheriff_withdrawal') return { label: '警上退水', symbol: 'person_remove' };
  if (phase === 'sheriff_voting') return { label: '警长投票', symbol: 'how_to_vote' };
  if (phase === 'sheriff_tiebreak_speech') return { label: '警长平票 PK', symbol: 'record_voice_over' };
  if (phase === 'sheriff_tiebreak_voting') return { label: '警长复投', symbol: 'how_to_vote' };
  if (phase === 'badge_transfer') return { label: '警徽处理', symbol: 'military_tech' };
  if (phase === 'speech_order') return { label: '决定发言顺序', symbol: 'route' };
  if (phase === 'sheriff_summary') return { label: '警长归票', symbol: 'campaign' };
  if (phase === 'night') return { label: '夜晚', symbol: 'dark_mode' };
  if (phase === 'day') return { label: '白天', symbol: 'light_mode' };
  if (phase === 'vote' || phase === 'voting') return { label: '投票', symbol: 'how_to_vote' };
  if (phase === 'tiebreak_speech') return { label: '平票辩护', symbol: 'record_voice_over' };
  if (phase === 'tiebreak_voting') return { label: '加赛投票', symbol: 'how_to_vote' };
  if (phase === 'death_skill') return { label: '死亡技能', symbol: 'my_location' };
  if (phase === 'last_words') return { label: '最后陈词', symbol: 'history_edu' };
  if (phase === 'knight_duel') return { label: '骑士决斗窗口', symbol: 'swords' };
  return { label: phase, symbol: 'circle' };
}

export default function EventFeed({
  events,
  rounds,
  status,
  followPlayback = false,
  eventFilter = 'all',
  focusEventIndex = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const previousLength = useRef(events.length);
  const [unseenCount, setUnseenCount] = useState(0);

  // 监听用户上滚(查看历史时暂停自动滚)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUp.current = !atBottom;
      if (atBottom) setUnseenCount(0);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // 新事件来了,自动滚到底(仅当用户没在上滚查看)
  useEffect(() => {
    const el = containerRef.current;
    const added = Math.max(0, events.length - previousLength.current);
    previousLength.current = events.length;
    if (!el) return;
    if (!followPlayback && userScrolledUp.current) {
      if (added) setUnseenCount((count) => count + added);
      return;
    }
    setUnseenCount(0);
    el.scrollTop = el.scrollHeight;
  }, [events.length, followPlayback]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || focusEventIndex == null) return;
    const target = document.getElementById(`timeline-event-${focusEventIndex}`);
    if (!target || !container.contains(target)) return;
    const containerBox = container.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    container.scrollTo({
      top: container.scrollTop + targetBox.top - containerBox.top - container.clientHeight / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    userScrolledUp.current = true;
  }, [events.length, focusEventIndex]);

  const returnToLatest = () => {
    const el = containerRef.current;
    if (!el) return;
    userScrolledUp.current = false;
    setUnseenCount(0);
    el.scrollTo({
      top: el.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const roleAssignment = status?.role_assignment;
  const avatarAssignment = status?.avatar_assignment;
  const filteredEvents = events
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .filter(({ event }) => eventMatchesFilter(event, eventFilter));

  return (
    <div className="h-full flex flex-col">
      {/* 标题区 */}
      <div className="mb-3 flex shrink-0 items-end justify-between gap-4 border-b border-[#e6dfd2]/[0.08] pb-3">
        <div>
          <p className="mb-1 font-label text-[10px] tracking-[0.28em] text-[#b99758]/75">
            MATCH CHRONICLE
          </p>
          <h2 className="m-0 font-display text-[27px] leading-none tracking-[0.04em] text-[#e6dfd2]">
            对局纪要
          </h2>
        </div>
        <p className="hidden max-w-[20rem] text-right font-body text-[12px] leading-relaxed text-[#aaa79f]/75 sm:block">
          夜间行动、公开发言与票型，按发生顺序留档
        </p>
      </div>

      {/* 时间线滚动区 */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className="custom-scrollbar relative h-full overflow-y-auto pr-3"
        >
        {filteredEvents.length === 0 && (
          <div className="py-16 text-center font-body text-[#aaa79f]/55">
            <span className="mx-auto mb-4 block h-px w-20 bg-[#b99758]/35" />
            夜幕尚未落下，等待第一项行动
          </div>
        )}

        {filteredEvents.length > 0 && (
          <>
            {/* 对局开始标记 */}
            <div className="relative z-10 py-3 text-center">
              <span className="inline-flex items-center gap-2 border-y border-[#e6dfd2]/10 px-3 py-1 font-label text-[10px] tracking-[0.16em] text-[#aaa79f]/60">
                <span className="h-1 w-1 rounded-full bg-[#b99758]/70" />
                旁观席开启 · 全信息记录
              </span>
            </div>

            {/* 竖线(渐变) */}
            <div className="timeline-line" />

            {/* 事件流 */}
            {filteredEvents.map(({ event: e, sourceIndex }, idx) => {
              // phase_change → 阶段分隔条
              if (isPhaseChange(e)) {
                const meta = phaseMeta(e.data.to);
                const isNight = e.data.to === 'night';
                const isTiebreak = String(e.data.to).startsWith('tiebreak');
                const accent = isNight ? '#c8c5cb' : (isTiebreak ? '#c4b5fd' : '#ffe16d');
                const candidates: string[] = e.data.candidates || [];
                return (
                  <div
                    key={sourceIndex}
                    id={`timeline-event-${sourceIndex}`}
                    className={cn(
                      'relative z-10 flex items-center gap-2 my-2.5 px-2 flex-wrap',
                      sourceIndex === focusEventIndex && 'timeline-quality-focus',
                    )}
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
                if (idx > 0 && isWerewolfKill(filteredEvents[idx - 1].event)) return null;
                const wolfKillEvents: WerewolfKillEvent[] = [];
                const wolfKillIndexes: number[] = [];
                for (let i = idx; i < filteredEvents.length && isWerewolfKill(filteredEvents[i].event); i += 1) {
                  wolfKillEvents.push(filteredEvents[i].event as WerewolfKillEvent);
                  wolfKillIndexes.push(filteredEvents[i].sourceIndex);
                }
                return (
                  <div
                    key={sourceIndex}
                    id={`timeline-event-${sourceIndex}`}
                    className={cn(wolfKillIndexes.includes(focusEventIndex ?? -1) && 'timeline-quality-focus')}
                  >
                    {wolfKillIndexes.slice(1).map((eventIndex) => (
                      <span key={eventIndex} id={`timeline-event-${eventIndex}`} aria-hidden="true" />
                    ))}
                    <TimelineEvent
                      event={e}
                      wolfKillEvents={wolfKillEvents}
                      rounds={rounds}
                      roleAssignment={roleAssignment}
                      avatarAssignment={avatarAssignment}
                      index={sourceIndex}
                    />
                  </div>
                );
              }

              // 其余事件 → 时间线条目
              return (
                <div
                  key={sourceIndex}
                  id={`timeline-event-${sourceIndex}`}
                  className={cn(sourceIndex === focusEventIndex && 'timeline-quality-focus')}
                >
                  <TimelineEvent
                    event={e}
                    rounds={rounds}
                    roleAssignment={roleAssignment}
                    avatarAssignment={avatarAssignment}
                    index={sourceIndex}
                  />
                </div>
              );
            })}

            <div className="h-8" />
          </>
        )}
        </div>
        {unseenCount > 0 && (
          <button
            type="button"
            onClick={returnToLatest}
            className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 border border-[#b99758]/45 bg-[#11181d]/95 px-3 py-2 font-label text-[11px] tracking-[0.08em] text-[#d7bd8b] shadow-[0_8px_24px_rgba(0,0,0,.45)]"
          >
            新增 {unseenCount} 条 · 回到最新
          </button>
        )}
      </div>
    </div>
  );
}
