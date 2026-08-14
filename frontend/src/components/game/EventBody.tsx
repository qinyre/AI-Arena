/**
 * 事件正文渲染:按事件类型渲染时间线卡片主体内容。
 * 从 TimelineEvent.tsx 拆出。
 */
import { cn } from '../../utils/cn';
import SpeechBubble from './SpeechBubble';
import VoteResult from './VoteResult';
import { deathCauseLabel } from './roleConfig';
import { LobeAvatar } from '../LobeAvatar';
import {
  isWerewolfKill,
  isSeerInvestigate,
  isPlayerSpeech,
  isPlayerVote,
  isPlayerAbstain,
  isPlayerDeath,
  isVoteResult,
  isGameEnd,
} from '../../types/api';
import type { GameEvent, PlayerVoteEvent, WerewolfKillEvent } from '../../types/api';
import { isGuardPass } from './eventStyles';

/** 事件正文:按类型渲染不同内容 */
export default function EventBody({
  event,
  wolfKillEvents,
  roleAssignment,
  avatarAssignment,
  votesForResult,
  time,
}: {
  event: GameEvent;
  wolfKillEvents?: WerewolfKillEvent[];
  roleAssignment?: Record<string, string>;
  avatarAssignment?: Record<string, string>;
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
  if (event.event_type === 'wolf_beauty_charm') {
    return (
      <p className="font-body text-body-lg text-[#d3e4fe]">
        <span className="mr-2 inline-block rounded border border-[#c45b86]/30 bg-[#c45b86]/15 px-1.5 py-0.5 align-middle font-label text-[10px] text-[#e9a9c1]">
          私密
        </span>
        <b className="text-[#e9a9c1]">{String(event.data.wolf_beauty)}</b>
        {' '}将魅惑印记留给了 <b>{String(event.data.target)}</b>
      </p>
    );
  }
  if (event.event_type === 'wolf_beauty_charm_triggered') {
    return (
      <p className="font-body text-body-lg italic text-[#ffb3b3]">
        狼美人 <b className="not-italic">{String(event.data.wolf_beauty)}</b> 被放逐，
        魅惑生效，<b className="not-italic">{String(event.data.target)}</b> 随之殉情出局。
      </p>
    );
  }
  if (event.event_type === 'knight_duel') {
    const hitWolf = event.data.target_faction === 'werewolf';
    return (
      <div className="space-y-1 font-body text-body-lg text-[#d3e4fe]">
        <p>
          <b className="text-[#e4d39d]">{String(event.data.knight)}</b>
          {' '}翻牌决斗 <b>{String(event.data.target)}</b> ——
          <span className={hitWolf ? 'font-bold text-[#ffb3b3]' : 'font-bold text-[#c8c5cb]'}>
            {hitWolf ? ' 命中狼人阵营，目标出局并立即入夜' : ' 目标属于好人阵营，骑士决斗失败出局'}
          </span>
        </p>
        <p className="font-label text-[10px] tracking-wider text-[#c8c5cb]/55">
          仅公开阵营，不公开目标具体身份
        </p>
      </div>
    );
  }
  if (event.event_type === 'guard_action') {
    return <p className="font-body text-body-lg text-[#d3e4fe]">
      <b className="text-green-200">{String(event.data.guard)}</b> 守护了{' '}
      <b>{String(event.data.target)}</b>
    </p>;
  }
  if (isGuardPass(event, roleAssignment)) {
    const data = event.data as Record<string, unknown>;
    return <p className="font-body text-body-lg text-[#d3e4fe]">
      <b className="text-emerald-200">{String(data.guard || data.player)}</b>
      {' '}今夜选择空守
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
        <LobeAvatar
          avatarId={avatarAssignment?.[speaker]}
          playerId={speaker}
          className="mt-0.5 h-7 w-7 rounded-full text-[10px] font-bold text-white ring-1 ring-[#eb2445]/60"
        />
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
  if (event.event_type === 'sheriff_withdrawal') {
    return (
      <p className="font-body text-[13px] text-[#d3e4fe]">
        <b>{String(event.data.player)}</b> 听完全部竞选发言后选择退水
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
    return (
      <SpeechBubble
        speech={event}
        roleAssignment={roleAssignment}
        avatarAssignment={avatarAssignment}
        time={time}
      />
    );
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

  if (isPlayerAbstain(event)) {
    return (
      <p className="font-body text-[13px] text-[#c8c5cb]">
        <b>{event.data.voter}</b> 选择弃票
      </p>
    );
  }

  // 投票结果(带本轮所有投票)
  if (isVoteResult(event)) {
    return (
      <div className="flex flex-col gap-3">
        <VoteResult
          votes={votesForResult}
          result={event}
          avatarAssignment={avatarAssignment}
        />
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
    const draw = event.data.winner === 'draw';
    const good = event.data.winner === 'good';
    return (
      <div className="flex flex-col gap-1">
        <p className={cn('font-display text-title-md', draw ? 'text-[#c8c5cb]' : good ? 'text-[#ffe16d]' : 'text-[#ffb3b3]')}>
          {draw ? '⚖ 对局和局' : good ? '👥 好人阵营胜利' : '🐺 狼人阵营胜利'}
        </p>
        <p className="font-body text-body-md text-[#c8c5cb]">
          历经 {event.data.final_round} 轮 · {event.data.duration_seconds.toFixed(1)}s
        </p>
      </div>
    );
  }

  return (
    <p className="font-body text-[12px] leading-relaxed text-[#c8c5cb]">
      已记录事件：<b>{event.event_type.replace(/_/g, ' ')}</b>
    </p>
  );
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
        <div className="mb-1.5 font-label text-[10px] uppercase tracking-wider text-[#ffb3b3]/70">
          狼队行动推理
        </div>
        <div className="space-y-1.5">
          {events.map((event) => (
            <div key={event.data.killer} className="grid grid-cols-[42px_1fr] gap-2 text-[12px] leading-[1.5]">
              <b className="font-display text-[#ffb3b3]">{event.data.killer}</b>
              <span className="font-body text-[#c8c5cb]/75">{event.data.reasoning}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
