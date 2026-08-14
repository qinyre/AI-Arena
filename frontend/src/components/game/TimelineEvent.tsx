/**
 * 时间线单个事件(借鉴稿风格):左侧彩色圆点 + 右侧 event-card。
 * - 圆点颜色随事件类型:狼人=绯红glow / 预言家=金glow / 其余=中性
 * - event-card 边框按类型着色(wolf-action / seer-action / ...)
 * - 戏剧化斜体叙述
 * - reasoning 常驻显示在动作下方
 *
 * 样式表/推理提取/事件正文已拆分至:
 *   eventStyles.ts / eventReasoning.ts / EventBody.tsx
 */
import { cn } from '../../utils/cn';
import AIReasoningPanel from './AIReasoningPanel';
import {
  isPhaseChange,
  isPlayerSpeech,
  isVoteResult,
  isPlayerDeath,
  isGameEnd,
} from '../../types/api';
import type { GameEvent, RoundData, PlayerVoteEvent, WerewolfKillEvent } from '../../types/api';
import { directorTier } from './gameDirector';
import {
  getEventStyle,
  FALLBACK_EVENT_STYLE,
  GUARD_PASS_STYLE,
  isGuardPass,
} from './eventStyles';
import { getReasoning, getReasoningPlayer, formatTime } from './eventReasoning';
import EventBody from './EventBody';

interface Props {
  event: GameEvent;
  wolfKillEvents?: WerewolfKillEvent[];
  rounds: RoundData[];
  roleAssignment?: Record<string, string>;
  avatarAssignment?: Record<string, string>;
  /** 本事件时间线内的索引(用于 key) */
  index: number;
}

export default function TimelineEvent({
  event,
  wolfKillEvents,
  rounds,
  roleAssignment,
  avatarAssignment,
}: Props) {
  // phase_change 不渲染为时间线条目(由 EventFeed 单独渲染为分隔条)
  if (isPhaseChange(event)) return null;
  if (event.event_type === 'game_start') return null;
  const guardPass = isGuardPass(event, roleAssignment);
  if (event.event_type === 'player_pass' && !guardPass) return null;
  // 放逐死亡已由票型汇总展示，避免重复。
  if (isPlayerDeath(event) && event.data.cause === 'voted_out') {
    return null;
  }

  const style = guardPass ? GUARD_PASS_STYLE : getEventStyle(event) ?? FALLBACK_EVENT_STYLE;
  const tier = directorTier(event);
  const prominent = (
    isVoteResult(event)
    || isPlayerDeath(event)
    || isGameEnd(event)
    || !!wolfKillEvents?.length
    || event.event_type === 'white_wolf_king_self_destruct'
    || event.event_type === 'wolf_self_destruct'
    || event.event_type === 'sheriff_election_result'
    || event.event_type === 'badge_transferred'
    || event.event_type === 'badge_destroyed'
    || event.event_type === 'agent_fallback'
    || event.event_type === 'wolf_beauty_charm_triggered'
    || event.event_type === 'knight_duel'
  );
  const isChat = isPlayerSpeech(event) || event.event_type === 'wolf_discussion';

  const reasoning = wolfKillEvents?.length ? null : getReasoning(event);
  const reasoningPlayer = getReasoningPlayer(event);
  const time = formatTime(event.timestamp);
  const hasReasoning = !!(reasoning && reasoning.trim());

  // 投票结果需要带本轮的 votes
  let votesForResult: PlayerVoteEvent[] = [];
  if (isVoteResult(event)) {
    const rd = rounds.find((r) => r.round === event.data.round);
    votesForResult = rd?.votes || [];
  }

  return (
    <div
      className={cn(
        'relative pl-9 animate-fade-in-up',
        tier === 'climax' && 'director-climax',
        tier === 'notable' && 'director-notable',
      )}
      data-director-tier={tier}
    >
      {/* 左侧圆点 */}
      <div
        className={cn(
          'absolute left-[11px] top-3.5 w-3 h-3 rounded-full bg-[#102034] border z-10 flex items-center justify-center',
          style.dotBorder,
        )}
      >
        <div className={cn('w-1 h-1 rounded-full', style.dotCore)} />
      </div>

      {/* 常规动作是紧凑时间轴行，关键事件才使用强调卡片。 */}
      <div className={cn(
        'flex flex-col gap-1.5',
        prominent
          ? 'event-card rounded-lg px-3 py-2.5 my-2'
          : 'py-2 pr-2 border-b border-[#47464b]/20',
        prominent && style.cardClass,
      )}>
        {!isChat && (
          <div className={cn('flex items-center gap-2', style.headColor)}>
            <span className="material-symbols-outlined text-[16px]">{style.symbol}</span>
            <span className="font-label text-[10px] uppercase tracking-wider font-bold">
              {style.label}
            </span>
            {time && (
              <span className="text-[11px] text-[#c8c5cb]/50 ml-auto font-label">
                {time}
              </span>
            )}
          </div>
        )}

        {/* 事件正文 */}
        <EventBody
          event={event}
          wolfKillEvents={wolfKillEvents}
          roleAssignment={roleAssignment}
          avatarAssignment={avatarAssignment}
          votesForResult={votesForResult}
          time={time}
        />

        {hasReasoning && reasoningPlayer && (
          <div className={isChat ? 'ml-9' : undefined}>
            <AIReasoningPanel playerId={reasoningPlayer} reasoning={reasoning!} />
          </div>
        )}
      </div>
    </div>
  );
}
