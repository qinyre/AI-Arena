import type { GameEvent, WerewolfKillEvent } from '../../types/api';

export type CinematicKind =
  | 'wolf'
  | 'seer'
  | 'witch-heal'
  | 'witch-poison'
  | 'guard'
  | 'hunter-shot'
  | 'wolf-king'
  | 'white-wolf'
  | 'wolf-explode'
  | 'idiot';

export interface CinematicAction {
  id: string;
  kind: CinematicKind;
  actor: string;
  target?: string;
  title: string;
  detail: string;
}

function action(
  event: GameEvent,
  index: number,
  kind: CinematicKind,
  actor: unknown,
  target: unknown,
  title: string,
  detail: string,
): CinematicAction {
  return {
    id: `${event.timestamp}-${index}-${event.event_type}`,
    kind,
    actor: String(actor || '未知玩家'),
    ...(target ? { target: String(target) } : {}),
    title,
    detail,
  };
}

export function buildCinematics(events: GameEvent[]): CinematicAction[] {
  const result: CinematicAction[] = [];

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.event_type === 'werewolf_kill') {
      const votes: WerewolfKillEvent[] = [];
      while (i < events.length && events[i].event_type === 'werewolf_kill') {
        votes.push(events[i] as WerewolfKillEvent);
        i += 1;
      }
      i -= 1;
      const counts = votes.reduce<Record<string, number>>((all, vote) => {
        all[vote.data.target] = (all[vote.data.target] || 0) + 1;
        return all;
      }, {});
      const highest = Math.max(...Object.values(counts));
      const targets = Object.keys(counts).filter((target) => counts[target] === highest);
      result.push(action(
        event,
        i,
        'wolf',
        votes.map((vote) => vote.data.killer).join(' / '),
        targets.join(' / '),
        '狼群锁定刀口',
        `${votes.length} 名狼人完成选择`,
      ));
      continue;
    }

    if (event.event_type === 'seer_investigate') {
      const data = event.data as Record<string, unknown>;
      result.push(action(
        event,
        i,
        'seer',
        data.seer,
        data.target,
        '命运之眼睁开',
        `查验结果：${String(data.result)}`,
      ));
      continue;
    }

    const data = event.data as Record<string, unknown>;
    if (event.event_type === 'guard_action') {
      result.push(action(
        event, i, 'guard', data.guard, data.target,
        '守护结界展开', '今夜，利刃止步于此',
      ));
    } else if (event.event_type === 'witch_heal') {
      result.push(action(
        event, i, 'witch-heal', data.witch, data.target,
        '生命药剂倾注', '一线生机重返舞台',
      ));
    } else if (event.event_type === 'witch_poison') {
      result.push(action(
        event, i, 'witch-poison', data.witch, data.target,
        '剧毒没入夜色', '命运的天平已经倾斜',
      ));
    } else if (event.event_type === 'white_wolf_king_self_destruct') {
      result.push(action(
        event, i, 'white-wolf', data.player, data.target,
        '白狼王撕下面具', '以自身为火，引爆整座舞台',
      ));
    } else if (event.event_type === 'wolf_self_destruct') {
      result.push(action(
        event, i, 'wolf-explode', data.player, undefined,
        '狼人悍然自爆', '发言中止，黑夜提前降临',
      ));
    } else if (
      event.event_type === 'player_death'
      && data.cause === 'hunter_shot'
    ) {
      result.push(action(
        event, i, 'hunter-shot', data.shooter, data.player,
        '猎人的最后一枪', '枪声划破寂静',
      ));
    } else if (
      event.event_type === 'player_death'
      && data.cause === 'wolf_king_shot'
    ) {
      result.push(action(
        event, i, 'wolf-king', data.shooter, data.player,
        '狼王发动遗言', '最后的命令仍须执行',
      ));
    } else if (
      event.event_type === 'vote_result'
      && data.result === 'idiot_revealed'
    ) {
      result.push(action(
        event, i, 'idiot', data.player, undefined,
        '白痴翻牌', '免于放逐，但永久失去投票权',
      ));
    }
  }

  return result;
}
