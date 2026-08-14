/**
 * 时间线事件样式表:圆点配色 / 卡片着色 / 图标与标签。
 * 从 TimelineEvent.tsx 拆出。
 */
import {
  isWerewolfKill,
  isSeerInvestigate,
  isPlayerSpeech,
  isPlayerVote,
  isPlayerAbstain,
  isVoteResult,
  isPlayerDeath,
  isGameEnd,
} from '../../types/api';
import type { GameEvent } from '../../types/api';

/** 圆点 + 卡片配色方案 */
export interface EventStyle {
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

export function getEventStyle(e: GameEvent): EventStyle | null {
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
  if (e.event_type === 'wolf_beauty_charm') {
    return {
      dotBorder: 'border-[#c45b86]',
      dotCore: 'bg-[#c45b86] shadow-[0_0_5px_rgba(196,91,134,0.9)]',
      cardClass: 'wolf-action',
      headColor: 'text-[#e9a9c1]',
      symbol: 'connect_without_contact',
      label: '狼美人魅惑',
    };
  }
  if (e.event_type === 'wolf_beauty_charm_triggered') {
    return {
      dotBorder: 'border-[#eb2445]',
      dotCore: 'bg-[#eb2445] shadow-[0_0_5px_rgba(235,36,69,0.9)]',
      cardClass: 'death-action',
      headColor: 'text-[#ffb3b3]',
      symbol: 'heart_broken',
      label: '魅惑殉情',
    };
  }
  if (e.event_type === 'knight_duel') {
    return {
      dotBorder: 'border-[#c7b477]',
      dotCore: 'bg-[#c7b477] shadow-[0_0_5px_rgba(199,180,119,0.9)]',
      cardClass: 'seer-action',
      headColor: 'text-[#e4d39d]',
      symbol: 'swords',
      label: '骑士决斗',
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
  if (e.event_type === 'sheriff_withdrawal') {
    return {
      dotBorder: 'border-[#e9c400]',
      dotCore: 'bg-[#e9c400]',
      cardClass: '',
      headColor: 'text-[#ffe16d]',
      symbol: 'person_remove',
      label: '警上退水',
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
  if (isPlayerAbstain(e)) {
    return {
      dotBorder: 'border-[#64748b]',
      dotCore: 'bg-[#64748b]',
      cardClass: '',
      headColor: 'text-[#c8c5cb]',
      symbol: 'how_to_vote',
      label: '弃票',
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
    const draw = e.data.winner === 'draw';
    const good = e.data.winner === 'good';
    return {
      dotBorder: draw ? 'border-[#64748b]' : good ? 'border-[#e9c400]' : 'border-[#eb2445]',
      dotCore: draw ? 'bg-[#64748b]' : good ? 'bg-[#e9c400]' : 'bg-[#eb2445]',
      cardClass: draw ? '' : good ? 'end-action good' : 'end-action evil',
      headColor: draw ? 'text-[#c8c5cb]' : good ? 'text-[#ffe16d]' : 'text-[#ffb3b3]',
      symbol: draw ? 'balance' : 'emoji_events',
      label: '对局结束',
    };
  }
  return null;
}

export const FALLBACK_EVENT_STYLE: EventStyle = {
  dotBorder: 'border-slate-500',
  dotCore: 'bg-slate-500',
  cardClass: '',
  headColor: 'text-slate-300',
  symbol: 'info',
  label: '系统事件',
};

export const GUARD_PASS_STYLE: EventStyle = {
  dotBorder: 'border-emerald-400',
  dotCore: 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]',
  cardClass: '',
  headColor: 'text-emerald-200',
  symbol: 'shield_lock',
  label: '守卫行动',
};

export function isGuardPass(event: GameEvent, roleAssignment?: Record<string, string>): boolean {
  if (event.event_type === 'guard_pass') return true;
  if (event.event_type !== 'player_pass') return false;
  const player = String(event.data.player || '');
  return event.data.context === 'guard' || roleAssignment?.[player] === 'guard';
}
