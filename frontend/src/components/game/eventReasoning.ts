/**
 * 事件推理提取:从各类事件中取出内心独白(reasoning)与对应玩家,
 * 以及时间戳格式化。从 TimelineEvent.tsx 拆出。
 */
import {
  isWerewolfKill,
  isSeerInvestigate,
  isPlayerSpeech,
  isPlayerVote,
  isPlayerAbstain,
} from '../../types/api';
import type { GameEvent } from '../../types/api';

/** 提取事件对应的 reasoning */
export function getReasoning(e: GameEvent): string | null {
  if (isWerewolfKill(e)) return e.data.reasoning;
  if (isSeerInvestigate(e)) return e.data.reasoning;
  if (isPlayerSpeech(e)) return e.data.reasoning;
  if (isPlayerVote(e)) return e.data.reasoning;
  if (isPlayerAbstain(e)) return e.data.reasoning;
  if (['guard_action', 'witch_heal', 'witch_poison'].includes(e.event_type)) {
    const data = e.data as Record<string, unknown>;
    return typeof data.reasoning === 'string' ? data.reasoning : null;
  }
  if (e.event_type === 'wolf_beauty_charm' || e.event_type === 'knight_duel') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'wolf_discussion') {
    const data = e.data as Record<string, unknown>;
    return typeof data.reasoning === 'string' ? data.reasoning : null;
  }
  if (e.event_type === 'sheriff_vote' || e.event_type === 'sheriff_abstain') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'sheriff_withdrawal') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'badge_transferred' || e.event_type === 'badge_destroyed') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'speech_order_decided') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  if (e.event_type === 'guard_pass' || e.event_type === 'player_pass') {
    return typeof e.data.reasoning === 'string' ? e.data.reasoning : null;
  }
  return null;
}

/** 提取事件对应的玩家 id(推理面板显示「内心独白 - 玩家X」) */
export function getReasoningPlayer(e: GameEvent): string | null {
  if (isWerewolfKill(e)) return e.data.killer;
  if (isSeerInvestigate(e)) return e.data.seer;
  if (isPlayerSpeech(e)) return e.data.speaker;
  if (isPlayerVote(e)) return e.data.voter;
  if (isPlayerAbstain(e)) return e.data.voter;
  if (e.event_type === 'guard_action') return String(e.data.guard || '');
  if (e.event_type === 'wolf_beauty_charm') return String(e.data.wolf_beauty || '');
  if (e.event_type === 'knight_duel') return String(e.data.knight || '');
  if (e.event_type === 'witch_heal' || e.event_type === 'witch_poison') {
    return String(e.data.witch || '');
  }
  if (e.event_type === 'wolf_discussion') return String(e.data.speaker || '');
  if (e.event_type === 'sheriff_vote' || e.event_type === 'sheriff_abstain') {
    return String(e.data.voter || '');
  }
  if (e.event_type === 'sheriff_withdrawal') return String(e.data.player || '');
  if (e.event_type === 'badge_transferred') return String(e.data.from || '');
  if (e.event_type === 'badge_destroyed') return String(e.data.player || '');
  if (e.event_type === 'speech_order_decided' && e.data.chooser !== 'judge') {
    return String(e.data.chooser || '');
  }
  if (e.event_type === 'guard_pass' || e.event_type === 'player_pass') {
    return String(e.data.guard || e.data.player || '');
  }
  return null;
}

/** 把 ISO timestamp 格式化成 HH:MM:SS */
export function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return '';
  }
}
