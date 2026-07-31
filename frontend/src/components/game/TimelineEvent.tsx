/**
 * 时间线单个事件(借鉴稿风格):左侧彩色圆点 + 右侧 event-card。
 * - 圆点颜色随事件类型:狼人=绯红glow / 预言家=金glow / 其余=中性
 * - event-card 边框按类型着色(wolf-action / seer-action / ...)
 * - 戏剧化斜体叙述
 * - reasoning 常驻显示在动作下方
 */
import { cn } from '../../utils/cn';
import SpeechBubble from './SpeechBubble';
import VoteResult from './VoteResult';
import AIReasoningPanel from './AIReasoningPanel';
import { avatarColor, deathCauseLabel, playerInitial } from './roleConfig';
import {
  isPhaseChange,
  isWerewolfKill,
  isSeerInvestigate,
  isPlayerSpeech,
  isPlayerVote,
  isPlayerDeath,
  isVoteResult,
  isGameEnd,
} from '../../types/api';
import type { GameEvent, RoundData, PlayerVoteEvent, WerewolfKillEvent } from '../../types/api';
import { directorTier } from './gameDirector';

interface Props {
  event: GameEvent;
  wolfKillEvents?: WerewolfKillEvent[];
  rounds: RoundData[];
  roleAssignment?: Record<string, string>;
  /** 本事件时间线内的索引(用于 key) */
  index: number;
}

/** 圆点 + 卡片配色方案 */
interface EventStyle {
  /** 圆点色 class(外环 border) */
  dotBorder: string;
  /** 圆点内核色 class + glow */
  dotCore: string;
  /** event-card 附加 class */
  cardClass: string;
  /** 卡片头部 icon 色 */
  headColor: string;
  /** Material Symbols 图标名 */
  symbol: string;
  /** 卡片头部 label */
  label: string;
}

function getEventStyle(e: GameEvent): EventStyle | null {
  if (e.event_type === 'agent_fallback') {
    return {
      dotBorder: 'border-amber-400',
      dotCore: 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.9)]',
      cardClass: 'border-amber-400/40 bg-amber-400/5',
      headColor: 'text-amber-200',
      symbol: 'warning',
      label: '模型降级',
    };
  }
  if (isWerewolfKill(e)) {
    return {
      dotBorder: 'border-[#eb2445]',
      dotCore: 'bg-[#eb2445] shadow-[0_0_5px_rgba(235,36,69,0.9)]',
      cardClass: 'wolf-action',
      headColor: 'text-[#ffb3b3]',
      symbol: 'swords',
      label: '狼人行动',
    };
  }
  if (isSeerInvestigate(e)) {
    return {
      dotBorder: 'border-[#e9c400]',
      dotCore: 'bg-[#e9c400] shadow-[0_0_5px_rgba(233,196,0,0.9)]',
      cardClass: 'seer-action',
      headColor: 'text-[#ffe16d]',
      symbol: 'visibility',
      label: '预言家行动',
    };
  }
  if (e.event_type === 'guard_action' || e.event_type === 'witch_heal' || e.event_type === 'witch_poison') {
    return {
      dotBorder: 'border-violet-400',
      dotCore: 'bg-violet-400 shadow-[0_0_5px_rgba(167,139,250,0.9)]',
      cardClass: '',
      headColor: 'text-violet-200',
      symbol: e.event_type === 'guard_action' ? 'shield' : 'experiment',
      label: e.event_type === 'guard_action' ? '守卫行动' : '女巫行动',
    };
  }
  if (e.event_type === 'white_wolf_king_self_destruct' || e.event_type === 'wolf_self_destruct') {
    return {
      dotBorder: 'border-[#eb2445]',
      dotCore: 'bg-[#eb2445] shadow-[0_0_5px_rgba(235,36,69,0.9)]',
      cardClass: 'wolf-action',
      headColor: 'text-[#ffb3b3]',
      symbol: 'bomb',
      label: e.event_type === 'white_wolf_king_self_destruct' ? '白狼王自爆' : '狼人自爆',
    };
  }
  if (e.event_type === 'wolf_discussion') {
    return {
      dotBorder: 'border-[#eb2445]',
      dotCore: 'bg-[#eb2445] shadow-[0_0_5px_rgba(235,36,69,0.9)]',
      cardClass: 'wolf-action',
      headColor: 'text-[#ffb3b3]',
      symbol: 'forum',
      label: '狼队密聊',
    };
  }
  if (e.event_type === 'sheriff_vote' || e.event_type === 'sheriff_abstain') {
    return {
      dotBorder: 'border-[#e9c400]',
      dotCore: 'bg-[#e9c400]',
      cardClass: '',
      headColor: 'text-[#ffe16d]',
      symbol: 'how_to_vote',
      label: '警长投票',
    };
  }
  if (e.event_type === 'sheriff_election_result') {
    return {
      dotBorder: 'border-[#e9c400]',
      dotCore: 'bg-[#e9c400] shadow-[0_0_5px_rgba(233,196,0,0.9)]',
      cardClass: 'seer-action',
      headColor: 'text-[#ffe16d]',
      symbol: 'military_tech',
      label: '警长竞选结果',
    };
  }
  if (e.event_type === 'sheriff_campaign_pass') {
    return {
      dotBorder: 'border-[#929095]',
      dotCore: 'bg-[#929095]',
      cardClass: '',
      headColor: 'text-[#c8c5cb]',
      symbol: 'person_off',
      label: '不上警',
    };
  }
  if (e.event_type === 'badge_transferred' || e.event_type === 'badge_destroyed') {
    return {
      dotBorder: 'border-[#e9c400]',
      dotCore: 'bg-[#e9c400]',
      cardClass: 'seer-action',
      headColor: 'text-[#ffe16d]',
      symbol: 'military_tech',
      label: e.event_type === 'badge_transferred' ? '警徽移交' : '警徽撕毁',
    };
  }
  if (e.event_type === 'speech_order_decided') {
    return {
      dotBorder: 'border-[#e9c400]',
      dotCore: 'bg-[#e9c400]',
      cardClass: '',
      headColor: 'text-[#ffe16d]',
      symbol: 'route',
      label: '发言顺序',
    };
  }
  if (isPlayerSpeech(e)) {
    return {
      dotBorder: 'border-[#64748b]',
      dotCore: 'bg-[#64748b]',
      cardClass: 'speech-action',
      headColor: 'text-[#d3e4fe]',
      symbol: 'forum',
      label: '玩家发言',
    };
  }
  if (isPlayerVote(e)) {
    return {
      dotBorder: 'border-[#929095]',
      dotCore: 'bg-[#929095]',
      cardClass: '',
      headColor: 'text-[#c8c5cb]',
      symbol: 'how_to_vote',
      label: '投票',
    };
  }
  if (isVoteResult(e)) {
    return {
      dotBorder: 'border-[#929095]',
      dotCore: 'bg-[#929095]',
      cardClass: '',
      headColor: 'text-[#d3e4fe]',
      symbol: 'ballot',
      label: '投票结果',
    };
  }
  if (isPlayerDeath(e)) {
    return {
      dotBorder: 'border-[#eb2445]/70',
      dotCore: 'bg-[#eb2445]/70',
      cardClass: 'death-action',
      headColor: 'text-[#ffb3b3]',
      symbol: 'skull',
      label: '死亡公告',
    };
  }
  if (isGameEnd(e)) {
    const good = e.data.winner === 'good';
    return {
      dotBorder: good ? 'border-[#e9c400]' : 'border-[#eb2445]',
      dotCore: good ? 'bg-[#e9c400]' : 'bg-[#eb2445]',
      cardClass: good ? 'end-action good' : 'end-action evil',
      headColor: good ? 'text-[#ffe16d]' : 'text-[#ffb3b3]',
      symbol: 'emoji_events',
      label: '对局结束',
    };
  }
  return null;
}

/** 提取事件对应的 reasoning */
function getReasoning(e: GameEvent): string | null {
  if (isWerewolfKill(e)) return e.data.reasoning;
  if (isSeerInvestigate(e)) return e.data.reasoning;
  if (isPlayerSpeech(e)) return e.data.reasoning;
  if (isPlayerVote(e)) return e.data.reasoning;
  if (['guard_action', 'witch_heal', 'witch_poison'].includes(e.event_type)) {
    const data = e.data as Record<string, unknown>;
    return typeof data.reasoning === 'string' ? data.reasoning : null;
  }
  if (e.event_type === 'wolf_discussion') {
    const data = e.data as Record<string, unknown>;
    return typeof data.reasoning === 'string' ? data.reasoning : null;
  }
  if (e.event_type === 'sheriff_vote' || e.event_type === 'sheriff_abstain') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'badge_transferred' || e.event_type === 'badge_destroyed') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'speech_order_decided') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  return null;
}

/** 提取事件对应的玩家 id(推理面板显示「内心独白 - 玩家X」) */
function getReasoningPlayer(e: GameEvent): string | null {
  if (isWerewolfKill(e)) return e.data.killer;
  if (isSeerInvestigate(e)) return e.data.seer;
  if (isPlayerSpeech(e)) return e.data.speaker;
  if (isPlayerVote(e)) return e.data.voter;
  if (e.event_type === 'guard_action') return String(e.data.guard || '');
  if (e.event_type === 'witch_heal' || e.event_type === 'witch_poison') {
    return String(e.data.witch || '');
  }
  if (e.event_type === 'wolf_discussion') return String(e.data.speaker || '');
  if (e.event_type === 'sheriff_vote' || e.event_type === 'sheriff_abstain') {
    return String(e.data.voter || '');
  }
  if (e.event_type === 'badge_transferred') return String(e.data.from || '');
  if (e.event_type === 'badge_destroyed') return String(e.data.player || '');
  if (e.event_type === 'speech_order_decided' && e.data.chooser !== 'judge') {
    return String(e.data.chooser || '');
  }
  return null;
}

/** 把 ISO timestamp 格式化成 HH:MM:SS */
function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return '';
  }
}

export default function TimelineEvent({ event, wolfKillEvents, rounds, roleAssignment }: Props) {
  // phase_change 不渲染为时间线条目(由 EventFeed 单独渲染为分隔条)
  if (isPhaseChange(event)) return null;
  // 放逐死亡已由票型汇总展示，避免重复。
  if (isPlayerDeath(event) && event.data.cause === 'voted_out') {
    return null;
  }

  const style = getEventStyle(event);
  if (!style) return null; // 未知事件不渲染
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

/** 事件正文:按类型渲染不同内容 */
function EventBody({
  event,
  wolfKillEvents,
  roleAssignment,
  votesForResult,
  time,
}: {
  event: GameEvent;
  wolfKillEvents?: WerewolfKillEvent[];
  roleAssignment?: Record<string, string>;
  votesForResult: PlayerVoteEvent[];
  time?: string;
}) {
  if (wolfKillEvents?.length) {
    return <WolfKillSummary events={wolfKillEvents} />;
  }

  if (event.event_type === 'agent_fallback') {
    const usage = event.data.usage as Record<string, number> | undefined;
    return (
      <div className="space-y-1 font-body text-[12px] leading-relaxed text-amber-100/90">
        <p>
          <b>{String(event.data.player)}</b> 的模型响应未被采用，已执行合法默认动作。
          共请求 {String(event.data.attempts)} 次
          {usage?.total_tokens ? `，消耗 ${usage.total_tokens} tokens` : ''}。
        </p>
        <p className="text-amber-200/70">{String(event.data.message)}</p>
        {!!event.data.response_excerpt && (
          <details className="text-[#c8c5cb]/60">
            <summary className="cursor-pointer">查看原始响应片段</summary>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px]">
              {String(event.data.response_excerpt)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  // 狼人刀
  if (isWerewolfKill(event)) {
    return (
      <p className="font-body text-body-lg text-[#d3e4fe]">
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#eb2445]/15 text-[#ffb3b3] border border-[#eb2445]/30 mr-2 align-middle font-label">
          私密
        </span>
        <b className="font-display text-[#ffb3b3]">{event.data.killer}</b>
        {' '}提交刀口：
        {' '}<b className="font-display text-[#ffb3b3]">{event.data.target}</b>
      </p>
    );
  }

  // 预言家查验
  if (isSeerInvestigate(event)) {
    const isWolf = event.data.result === '狼人';
    return (
      <p className="font-body text-body-lg text-[#d3e4fe]">
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#e9c400]/15 text-[#ffe16d] border border-[#e9c400]/30 mr-2 align-middle font-label">
          私密
        </span>
        <b className="font-display text-[#ffe16d]">{event.data.seer}</b>
        {' '}注视着魔镜,探寻{' '}
        <b className="font-display text-[#ffe16d]">{event.data.target}</b>
        {' '}的灵魂 —— 真相是
        {' '}
        <span className={isWolf ? 'text-[#ffb3b3] font-bold' : 'text-[#ffe16d] font-bold'}>
          {event.data.result}
        </span>
        。
      </p>
    );
  }
  if (event.event_type === 'guard_action') {
    return <p className="font-body text-body-lg text-[#d3e4fe]">
      <b className="text-green-200">{String(event.data.guard)}</b> 守护了{' '}
      <b>{String(event.data.target)}</b>
    </p>;
  }
  if (event.event_type === 'witch_heal' || event.event_type === 'witch_poison') {
    return <p className="font-body text-body-lg text-[#d3e4fe]">
      <b className="text-violet-200">{String(event.data.witch)}</b>
      {event.event_type === 'witch_heal' ? ' 使用解药救下了 ' : ' 使用毒药指向了 '}
      <b>{String(event.data.target)}</b>
    </p>;
  }
  if (event.event_type === 'white_wolf_king_self_destruct') {
    return <p className="font-body text-body-lg text-[#ffb3b3]">
      <b>{String(event.data.player)}</b> 自爆并带走了 <b>{String(event.data.target)}</b>
    </p>;
  }
  if (event.event_type === 'wolf_self_destruct') {
    return <p className="font-body text-body-lg text-[#ffb3b3]">
      <b>{String(event.data.player)}</b> 自爆，白天立即结束
    </p>;
  }
  if (event.event_type === 'wolf_discussion') {
    const speaker = String(event.data.speaker);
    return (
      <div className="flex gap-2">
        <div className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-[#eb2445]/60',
          avatarColor(speaker),
        )}>
          {playerInitial(speaker)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-display text-[13px] text-[#ffb3b3]">{speaker}</span>
            <span className="rounded-full border border-[#eb2445]/30 bg-[#eb2445]/10 px-1.5 py-0.5 font-label text-[9px] tracking-wider text-[#ffb3b3]">
              狼队私聊
            </span>
            {time && (
              <span className="ml-auto font-label text-[10px] text-[#c8c5cb]/35">{time}</span>
            )}
          </div>
          <div className="rounded-xl rounded-tl-sm border border-[#eb2445]/25 bg-[#321827]/70 px-3 py-2 font-body text-[13px] leading-[1.55] text-[#ffd0d7] shadow-sm">
            {String(event.data.content)}
          </div>
        </div>
      </div>
    );
  }

  // 发言
  if (event.event_type === 'sheriff_campaign_pass') {
    return (
      <p className="font-body text-[13px] text-[#c8c5cb]">
        <b>{String(event.data.player)}</b> 选择不上警
      </p>
    );
  }
  if (event.event_type === 'sheriff_vote') {
    return (
      <p className="font-body text-[13px] text-[#d3e4fe]">
        <b>{String(event.data.voter)}</b>
        <span className="mx-1.5 text-[#e9c400]">→</span>
        <b>{String(event.data.target)}</b>
      </p>
    );
  }
  if (event.event_type === 'sheriff_abstain') {
    return (
      <p className="font-body text-[13px] text-[#c8c5cb]">
        <b>{String(event.data.voter)}</b> 放弃警长票
      </p>
    );
  }
  if (event.event_type === 'sheriff_election_result') {
    const result = String(event.data.result);
    if (result === 'elected') {
      return <p className="font-body text-[#ffe16d]"><b>{String(event.data.sheriff)}</b> 当选警长，放逐票计 1.5 票</p>;
    }
    if (result === 'tie') {
      return <p className="font-body text-[#d3e4fe]">警长票平票：{(event.data.candidates as string[] || []).join(' / ')}，进入 PK</p>;
    }
    if (result === 'cancelled_by_self_destruct') {
      return <p className="font-body text-[#ffb3b3]">竞选被自爆中止，本局没有警长</p>;
    }
    return <p className="font-body text-[#c8c5cb]">警长竞选结束，本局没有警长</p>;
  }
  if (event.event_type === 'badge_transferred') {
    return <p className="font-body text-[#ffe16d]"><b>{String(event.data.from)}</b> 将警徽移交给 <b>{String(event.data.to)}</b></p>;
  }
  if (event.event_type === 'badge_destroyed') {
    return <p className="font-body text-[#c8c5cb]"><b>{String(event.data.player)}</b> 撕毁了警徽</p>;
  }
  if (event.event_type === 'speech_order_decided') {
    const direction = event.data.direction === 'clockwise' ? '正序' : '逆序';
    const chooser = event.data.chooser === 'judge' ? '法官' : String(event.data.chooser);
    const order = Array.isArray(event.data.order) ? event.data.order.map(String) : [];
    return (
      <p className="font-body text-[13px] leading-relaxed text-[#d3e4fe]">
        <b className="text-[#ffe16d]">{chooser}</b> 选择{direction}
        <span className="mx-2 text-[#64748b]">·</span>
        {order.join(' → ')}
      </p>
    );
  }

  if (isPlayerSpeech(event)) {
    return <SpeechBubble speech={event} roleAssignment={roleAssignment} time={time} />;
  }

  if (isPlayerVote(event)) {
    return (
      <p className="font-body text-[13px] text-[#d3e4fe]">
        <b>{event.data.voter}</b>
        <span className="mx-1.5 text-[#64748b]">→</span>
        <b>{event.data.target}</b>
      </p>
    );
  }

  // 投票结果(带本轮所有投票)
  if (isVoteResult(event)) {
    return (
      <div className="flex flex-col gap-3">
        <VoteResult votes={votesForResult} result={event} />
        {event.data.result === 'eliminated' && event.data.eliminated && (
          <p className="font-body text-body-md text-[#ffb3b3] bg-[#eb2445]/10 border border-[#eb2445]/30 rounded-md px-3 py-2">
            <b className="font-display">{event.data.eliminated}</b> 被投票放逐(第{event.data.round}轮)。
          </p>
        )}
      </div>
    );
  }

  // 死亡公告(夜晚死亡);投票死亡由 vote_result 区块显示,这里跳过
  if (isPlayerDeath(event)) {
    if (event.data.cause === 'voted_out') return null;
    return (
      <p className="font-body text-body-lg text-[#ffb3b3] italic">
        <b className="font-display not-italic">{event.data.player}</b>
        {' '}{deathCauseLabel(event.data.cause)}(第{event.data.round}轮)。
      </p>
    );
  }

  // 游戏结束
  if (isGameEnd(event)) {
    const good = event.data.winner === 'good';
    return (
      <div className="flex flex-col gap-1">
        <p className={cn('font-display text-title-md', good ? 'text-[#ffe16d]' : 'text-[#ffb3b3]')}>
          {good ? '👥 好人阵营胜利' : '🐺 狼人阵营胜利'}
        </p>
        <p className="font-body text-body-md text-[#c8c5cb]">
          历经 {event.data.final_round} 轮 · {event.data.duration_seconds.toFixed(1)}s
        </p>
      </div>
    );
  }

  return null;
}

function WolfKillSummary({ events }: { events: WerewolfKillEvent[] }) {
  const counts = events.reduce<Record<string, number>>((result, event) => {
    result[event.data.target] = (result[event.data.target] || 0) + 1;
    return result;
  }, {});

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-[#eb2445]/30 bg-[#eb2445]/10 px-2 py-1 font-label text-[10px] text-[#ffb3b3]">
          刀口票型
        </span>
        {Object.entries(counts).map(([target, count]) => (
          <span key={target} className="font-body text-[12px] text-[#ffd0d7]">
            <b>{target}</b> · {count} 刀
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {events.map((event) => (
          <span
            key={event.data.killer}
            className="rounded-full border border-[#eb2445]/20 bg-[#321827]/55 px-2 py-1 font-label text-[10px] text-[#ffd0d7]"
          >
            {event.data.killer} → {event.data.target}
          </span>
        ))}
      </div>

      <div className="border-l-2 border-[#eb2445]/35 pl-2.5">
        <div className="mb-1.5 font-label text-[9px] uppercase tracking-wider text-[#ffb3b3]/70">
          狼队行动推理
        </div>
        <div className="space-y-1.5">
          {events.map((event) => (
            <div key={event.data.killer} className="grid grid-cols-[42px_1fr] gap-2 text-[11px] leading-[1.45]">
              <b className="font-display text-[#ffb3b3]">{event.data.killer}</b>
              <span className="font-body text-[#c8c5cb]/75">{event.data.reasoning}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
