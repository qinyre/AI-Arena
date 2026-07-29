import type { GameEvent } from '../../types/api';

export type DirectorTier = 'routine' | 'notable' | 'climax';
export type ArenaSound =
  | 'night' | 'day' | 'speech' | 'vote' | 'gavel' | 'tie'
  | 'death' | 'gunshot' | 'seer' | 'potion' | 'shield'
  | 'sheriff' | 'explosion' | 'victory-good' | 'victory-wolf'
  | 'wolf';
export type PlayerAttention = 'speaking' | 'watching' | 'voting' | 'targeted' | 'protected' | 'fallen';

const CLIMAX_EVENTS = new Set([
  'white_wolf_king_self_destruct',
  'wolf_self_destruct',
  'player_death',
  'game_end',
]);

const NOTABLE_EVENTS = new Set([
  'seer_investigate',
  'guard_action',
  'witch_heal',
  'witch_poison',
  'sheriff_election_result',
  'badge_transferred',
  'badge_destroyed',
  'speech_order_decided',
]);

function dataOf(event: GameEvent): Record<string, unknown> {
  return event.data as Record<string, unknown>;
}

export function directorTier(event: GameEvent): DirectorTier {
  if (CLIMAX_EVENTS.has(event.event_type)) return 'climax';
  if (event.event_type === 'vote_result') {
    return ['eliminated', 'idiot_revealed'].includes(String(dataOf(event).result))
      ? 'climax'
      : 'notable';
  }
  if (NOTABLE_EVENTS.has(event.event_type)) return 'notable';
  if (event.event_type === 'phase_change') {
    const phase = String(dataOf(event).to);
    return phase.includes('tiebreak') || phase === 'death_skill' ? 'notable' : 'routine';
  }
  return 'routine';
}

export function directorDelay(event: GameEvent | undefined, speed: number, enabled: boolean): number {
  if (!event || !enabled) return 900 / speed;
  const tier = directorTier(event);
  const base = tier === 'climax'
    ? 1450
    : tier === 'notable'
      ? 900
      : ['player_vote', 'player_abstain', 'sheriff_vote', 'sheriff_abstain'].includes(event.event_type)
        ? 280
        : event.event_type === 'player_speech'
          ? 720
          : 480;
  return Math.max(120, base / speed);
}

export function nextDirectorCursor(events: GameEvent[], cursor: number, enabled: boolean): number {
  if (!enabled || events[cursor]?.event_type !== 'werewolf_kill') return cursor + 1;
  let next = cursor + 1;
  while (events[next]?.event_type === 'werewolf_kill') next += 1;
  return next;
}

export function soundForEvent(event: GameEvent): ArenaSound | null {
  const data = dataOf(event);
  if (event.event_type === 'phase_change') {
    if (data.to === 'night') return 'night';
    if (data.to === 'day' || data.to === 'speech_order') return 'day';
  }
  if (event.event_type === 'player_speech' || event.event_type === 'wolf_discussion') return 'speech';
  if (['player_vote', 'sheriff_vote'].includes(event.event_type)) return 'vote';
  if (event.event_type === 'vote_result') {
    return ['tie', 'no_elimination'].includes(String(data.result)) ? 'tie' : 'gavel';
  }
  if (['sheriff_election_result', 'badge_transferred', 'badge_destroyed'].includes(event.event_type)) return 'sheriff';
  // 狼人选定击杀目标 → 专属利刃锁定音（中高频，能穿透夜晚 ambient 被听见）
  if (event.event_type === 'werewolf_kill') return 'wolf';
  if (event.event_type === 'seer_investigate') return 'seer';
  if (event.event_type === 'guard_action') return 'shield';
  if (event.event_type === 'witch_heal' || event.event_type === 'witch_poison') return 'potion';
  if (event.event_type === 'white_wolf_king_self_destruct' || event.event_type === 'wolf_self_destruct') return 'explosion';
  if (event.event_type === 'player_death') {
    return ['hunter_shot', 'wolf_king_shot'].includes(String(data.cause)) ? 'gunshot' : 'death';
  }
  if (event.event_type === 'game_end') {
    return data.winner === 'good' ? 'victory-good' : 'victory-wolf';
  }
  return null;
}

export function currentSpeaker(events: GameEvent[]): string | null {
  const last = events[events.length - 1];
  if (!last) return null;
  if (last.event_type === 'player_speech') return String(dataOf(last).speaker || '') || null;
  if (last.event_type === 'wolf_discussion') return String(dataOf(last).speaker || '') || null;
  return null;
}

export function activeVoteDetail(events: GameEvent[]): Record<string, string> {
  const detail: Record<string, string> = {};
  let collecting = false;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const data = dataOf(event);
    if (event.event_type === 'phase_change') {
      if (collecting) break;
      continue;
    }
    if (event.event_type === 'vote_result' || event.event_type === 'sheriff_election_result') {
      const resultDetail = data.vote_detail;
      if (resultDetail && typeof resultDetail === 'object') {
        Object.assign(detail, resultDetail);
        collecting = true;
        continue;
      }
    }
    if (event.event_type === 'player_vote' || event.event_type === 'sheriff_vote') {
      detail[String(data.voter)] = String(data.target);
      collecting = true;
      continue;
    }
    if (event.event_type === 'player_abstain' || event.event_type === 'sheriff_abstain') {
      detail[String(data.voter)] = 'abstain';
      collecting = true;
      continue;
    }
    if (collecting) break;
    return {};
  }
  return detail;
}

export function playerAttention(events: GameEvent[]): Record<string, PlayerAttention[]> {
  const result: Record<string, PlayerAttention[]> = {};
  const add = (player: unknown, state: PlayerAttention) => {
    const id = String(player || '');
    if (!id) return;
    result[id] = [...new Set([...(result[id] || []), state])];
  };
  const last = lastAction(events);
  if (!last) return result;
  const data = dataOf(last);

  if (last.event_type === 'player_speech' || last.event_type === 'wolf_discussion') {
    add(data.speaker, 'speaking');
  } else if (last.event_type === 'seer_investigate') {
    add(data.seer, 'watching');
    add(data.target, 'targeted');
  } else if (last.event_type === 'guard_action') {
    add(data.guard, 'watching');
    add(data.target, 'protected');
  } else if (last.event_type === 'witch_heal') {
    add(data.witch, 'watching');
    add(data.target, 'protected');
  } else if (last.event_type === 'witch_poison' || last.event_type === 'werewolf_kill') {
    add(data.witch || data.killer, 'watching');
    add(data.target, 'targeted');
  } else if (last.event_type === 'player_vote' || last.event_type === 'sheriff_vote') {
    add(data.voter, 'voting');
    add(data.target, 'targeted');
  } else if (last.event_type === 'vote_result' || last.event_type === 'sheriff_election_result') {
    const detail = activeVoteDetail(events);
    Object.entries(detail).forEach(([voter, target]) => {
      add(voter, 'voting');
      if (target !== 'abstain') add(target, 'targeted');
    });
    add(data.eliminated || data.player || data.sheriff, 'targeted');
  } else if (last.event_type === 'player_death') {
    add(data.player, 'fallen');
  } else if (last.event_type === 'badge_transferred') {
    add(data.from, 'watching');
    add(data.to, 'protected');
  } else if (last.event_type === 'white_wolf_king_self_destruct') {
    add(data.player, 'fallen');
    add(data.target, 'targeted');
  } else if (last.event_type === 'wolf_self_destruct') {
    add(data.player, 'fallen');
  }
  return result;
}

function lastAction(events: GameEvent[]): GameEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].event_type !== 'phase_change') return events[index];
  }
  return undefined;
}
