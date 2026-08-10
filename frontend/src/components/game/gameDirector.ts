import type { GameEvent } from '../../types/api';
import type { CinematicKind } from './cinematics';

export type DirectorTier = 'routine' | 'notable' | 'climax';
export type EventFilter = 'all' | 'speech' | 'vote' | 'night' | 'death' | 'system';
export type ArenaSound =
  | 'night' | 'day' | 'speech' | 'vote' | 'gavel' | 'tie'
  | 'death' | 'gunshot' | 'seer' | 'potion' | 'shield'
  | 'sheriff' | 'explosion' | 'victory-good' | 'victory-wolf'
  | 'wolf';
export type PlayerAttention = 'speaking' | 'watching' | 'voting' | 'targeted' | 'protected' | 'fallen';

const VOICE_BY_EVENT: Record<string, string> = {
  werewolf_kill: '/audio/voice/werewolf-action.mp3',
  seer_investigate: '/audio/voice/seer-investigate.mp3',
  guard_action: '/audio/voice/guard-action.mp3',
  witch_heal: '/audio/voice/witch-heal.mp3',
  witch_poison: '/audio/voice/witch-poison.mp3',
};

const VOICE_BY_CINEMATIC: Partial<Record<CinematicKind, string>> = {
  wolf: VOICE_BY_EVENT.werewolf_kill,
  'wolf-kill': '/audio/voice/werewolf-kill.mp3',
  'wolf-king': '/audio/voice/wolf-king-shot.mp3',
  'white-wolf': '/audio/voice/white-wolf-self-destruct.mp3',
  'wolf-explode': '/audio/voice/wolf-self-destruct.mp3',
  seer: VOICE_BY_EVENT.seer_investigate,
  guard: VOICE_BY_EVENT.guard_action,
  'witch-heal': VOICE_BY_EVENT.witch_heal,
  'witch-poison': VOICE_BY_EVENT.witch_poison,
  'hunter-shot': '/audio/voice/hunter-shot.mp3',
  idiot: '/audio/voice/idiot-reveal.mp3',
  'sheriff-opening': '/audio/voice/sheriff-campaign-start.mp3',
  sheriff: '/audio/voice/sheriff-elected.mp3',
  badge: '/audio/voice/badge-transfer.mp3',
  'badge-destroyed': '/audio/voice/badge-destroyed.mp3',
  exile: '/audio/voice/player-exiled.mp3',
  tie: '/audio/voice/vote-tie.mp3',
  'last-words': '/audio/voice/last-words.mp3',
  'victory-good': '/audio/voice/victory-good.mp3',
  'victory-wolf': '/audio/voice/victory-wolf.mp3',
};

const CLIMAX_EVENTS = new Set([
  'white_wolf_king_self_destruct',
  'wolf_self_destruct',
  'player_death',
  'game_end',
  'wolf_beauty_charm_triggered',
  'knight_duel',
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
  'agent_fallback',
  'wolf_beauty_charm',
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
  if (event.event_type === 'wolf_beauty_charm') return 'potion';
  if (event.event_type === 'wolf_beauty_charm_triggered') return 'death';
  if (event.event_type === 'knight_duel') return 'gunshot';
  if (event.event_type === 'white_wolf_king_self_destruct' || event.event_type === 'wolf_self_destruct') return 'explosion';
  if (event.event_type === 'player_death') {
    return ['hunter_shot', 'wolf_king_shot'].includes(String(data.cause)) ? 'gunshot' : 'death';
  }
  if (event.event_type === 'game_end') {
    if (data.winner === 'draw') return 'tie';
    return data.winner === 'good' ? 'victory-good' : 'victory-wolf';
  }
  return null;
}

export function highlightCursors(
  events: GameEvent[],
  reviewEventIndexes: number[] = [],
): number[] {
  const cursors = new Set(
    reviewEventIndexes
      .filter((index) => Number.isInteger(index) && index >= 0 && index < events.length)
      .map((index) => index + 1),
  );
  events.forEach((event, index) => {
    const data = dataOf(event);
    const isDeclaredSpeech = event.event_type === 'player_speech' && (
      (data.claim_role && data.claim_role !== 'none')
      || data.last_words
      || data.sheriff_summary
    );
    if (directorTier(event) !== 'routine' || isDeclaredSpeech) {
      cursors.add(index + 1);
    }
  });
  return [...cursors].sort((a, b) => a - b);
}

export function eventMatchesFilter(event: GameEvent, filter: EventFilter): boolean {
  if (filter === 'all' || event.event_type === 'phase_change') return true;
  const eventType = event.event_type;
  if (filter === 'speech') {
    return ['player_speech', 'wolf_discussion', 'speech_order_decided'].includes(eventType);
  }
  if (filter === 'vote') {
    return eventType.includes('vote')
      || eventType.includes('abstain')
      || eventType.startsWith('sheriff_')
      || eventType.startsWith('badge_');
  }
  if (filter === 'night') {
    return [
      'wolf_discussion', 'werewolf_kill', 'seer_investigate', 'guard_action',
      'guard_pass', 'witch_heal', 'witch_poison',
      'wolf_beauty_charm',
    ].includes(eventType);
  }
  if (filter === 'death') {
    return [
      'player_death', 'wolf_self_destruct', 'white_wolf_king_self_destruct',
      'game_end',
      'wolf_beauty_charm_triggered', 'knight_duel',
    ].includes(eventType);
  }
  return [
    'game_start', 'game_end', 'player_pass', 'agent_fallback',
    'speech_order_decided',
  ].includes(eventType);
}

export function voiceForEvent(event: GameEvent): string | null {
  const data = dataOf(event);
  if (event.event_type === 'player_death') {
    if (data.cause === 'hunter_shot') return VOICE_BY_CINEMATIC['hunter-shot'] || null;
    if (data.cause === 'wolf_king_shot') return VOICE_BY_CINEMATIC['wolf-king'] || null;
    if (data.cause === 'werewolf_kill') return VOICE_BY_CINEMATIC['wolf-kill'] || null;
  }
  if (event.event_type === 'white_wolf_king_self_destruct') return VOICE_BY_CINEMATIC['white-wolf'] || null;
  if (event.event_type === 'wolf_self_destruct') return VOICE_BY_CINEMATIC['wolf-explode'] || null;
  if (event.event_type === 'phase_change' && data.to === 'sheriff_campaign') return VOICE_BY_CINEMATIC['sheriff-opening'] || null;
  if (event.event_type === 'sheriff_election_result' && data.result === 'elected') return VOICE_BY_CINEMATIC.sheriff || null;
  if (event.event_type === 'badge_transferred') return VOICE_BY_CINEMATIC.badge || null;
  if (event.event_type === 'badge_destroyed') return VOICE_BY_CINEMATIC['badge-destroyed'] || null;
  if (event.event_type === 'player_speech' && data.phase === 'last_words') return VOICE_BY_CINEMATIC['last-words'] || null;
  if (event.event_type === 'vote_result') {
    if (data.result === 'idiot_revealed') return VOICE_BY_CINEMATIC.idiot || null;
    if (data.result === 'eliminated') return VOICE_BY_CINEMATIC.exile || null;
    if (data.result === 'tie' || data.result === 'no_elimination') return VOICE_BY_CINEMATIC.tie || null;
  }
  if (event.event_type === 'game_end') {
    if (data.winner === 'draw') return VOICE_BY_CINEMATIC.tie || null;
    return data.winner === 'good'
      ? VOICE_BY_CINEMATIC['victory-good'] || null
      : VOICE_BY_CINEMATIC['victory-wolf'] || null;
  }
  return VOICE_BY_EVENT[event.event_type] || null;
}

export function voiceForCinematic(kind: CinematicKind): string | null {
  return VOICE_BY_CINEMATIC[kind] ?? null;
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
  } else if (last.event_type === 'wolf_beauty_charm') {
    add(data.wolf_beauty, 'watching');
    add(data.target, 'targeted');
  } else if (last.event_type === 'wolf_beauty_charm_triggered') {
    add(data.wolf_beauty, 'fallen');
    add(data.target, 'fallen');
  } else if (last.event_type === 'knight_duel') {
    add(data.knight, data.target_faction === 'werewolf' ? 'watching' : 'fallen');
    add(data.target, data.target_faction === 'werewolf' ? 'fallen' : 'targeted');
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
