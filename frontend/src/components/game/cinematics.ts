import type { GameEvent, WerewolfKillEvent } from '../../types/api';

export type CinematicKind =
  | 'wolf' | 'wolf-kill' | 'seer' | 'witch-heal' | 'witch-poison' | 'guard'
  | 'hunter-shot' | 'wolf-king' | 'white-wolf' | 'wolf-explode' | 'idiot'
  | 'sheriff-opening' | 'sheriff' | 'badge' | 'badge-destroyed' | 'exile' | 'tie'
  | 'last-words' | 'victory-good' | 'victory-wolf';

export interface CinematicAction {
  id: string;
  kind: CinematicKind;
  actor: string;
  target?: string;
  title: string;
  detail: string;
}

const ROLE_LABEL: Record<string, string> = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  idiot: '白痴',
  guard: '守卫',
  white_wolf_king: '白狼王',
  wolf_king: '狼王',
  villager: '平民',
};

function action(
  event: GameEvent,
  index: number,
  kind: CinematicKind,
  actor: unknown,
  target: unknown,
  title: string,
  detail: string,
): CinematicAction {
  const targetText = target == null ? '' : String(target);
  return {
    id: `${event.timestamp}-${index}-${event.event_type}-${kind}`,
    kind,
    actor: String(actor || '全体玩家'),
    ...(targetText ? { target: targetText } : {}),
    title,
    detail,
  };
}

export function buildCinematics(
  events: GameEvent[],
  roleAssignment: Record<string, string> = {},
): CinematicAction[] {
  const result: CinematicAction[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const data = event.data as Record<string, unknown>;

    if (event.event_type === 'werewolf_kill') {
      const votes: WerewolfKillEvent[] = [];
      while (index < events.length && events[index].event_type === 'werewolf_kill') {
        votes.push(events[index] as WerewolfKillEvent);
        index += 1;
      }
      index -= 1;
      const counts = votes.reduce<Record<string, number>>((all, vote) => {
        all[vote.data.target] = (all[vote.data.target] || 0) + 1;
        return all;
      }, {});
      const highest = Math.max(...Object.values(counts));
      const targets = Object.keys(counts).filter((target) => counts[target] === highest);
      result.push(action(
        event, index, 'wolf',
        votes.map((vote) => vote.data.killer).join(' / '),
        targets.join(' / '),
        '狼群锁定刀口',
        `${votes.length} 名狼人完成选择`,
      ));
      continue;
    }

    if (event.event_type === 'seer_investigate') {
      result.push(action(
        event, index, 'seer', data.seer, data.target,
        '命运之眼睁开', `查验结果：${String(data.result)}`,
      ));
    } else if (event.event_type === 'guard_action') {
      result.push(action(
        event, index, 'guard', data.guard, data.target,
        '守护结界展开', '今夜，利刃止步于此',
      ));
    } else if (event.event_type === 'witch_heal') {
      result.push(action(
        event, index, 'witch-heal', data.witch, data.target,
        '生命药剂倾注', '一线生机重返舞台',
      ));
    } else if (event.event_type === 'witch_poison') {
      result.push(action(
        event, index, 'witch-poison', data.witch, data.target,
        '剧毒没入夜色', '命运的天平已经倾斜',
      ));
    } else if (event.event_type === 'white_wolf_king_self_destruct') {
      result.push(action(
        event, index, 'white-wolf', data.player, data.target,
        '白狼王撕下面具', '以自身为火，引爆整座舞台',
      ));
    } else if (event.event_type === 'wolf_self_destruct') {
      result.push(action(
        event, index, 'wolf-explode', data.player, undefined,
        '狼人悍然自爆', '发言中止，黑夜提前降临',
      ));
    } else if (event.event_type === 'player_death' && data.cause === 'hunter_shot') {
      result.push(action(
        event, index, 'hunter-shot', data.shooter, data.player,
        '猎人的最后一枪', '枪声划破寂静',
      ));
    } else if (event.event_type === 'player_death' && data.cause === 'wolf_king_shot') {
      result.push(action(
        event, index, 'wolf-king', data.shooter, data.player,
        '狼王发动遗令', '最后的命令仍须执行',
      ));
    } else if (event.event_type === 'player_death' && data.cause === 'werewolf_kill') {
      result.push(action(
        event, index, 'wolf-kill', '狼人阵营', data.player,
        '逃亡止于长夜', '月光被云层吞没，狼群追上了最后的脚步',
      ));
    } else if (event.event_type === 'phase_change' && data.to === 'sheriff_campaign') {
      result.push(action(
        event, index, 'sheriff-opening', '全体玩家', undefined,
        '警长竞选开启', '发言、退水与第一枚警徽，即将在此决定',
      ));
    } else if (event.event_type === 'sheriff_election_result') {
      const electionResult = String(data.result);
      if (electionResult === 'elected') {
        result.push(action(
          event, index, 'sheriff', data.sheriff, undefined,
          '警徽授予', '警长获得 1.5 票与白天归票权',
        ));
      } else if (electionResult === 'tie') {
        result.push(action(
          event, index, 'tie', (data.candidates as string[] || []).join(' / '), undefined,
          '警长平票', '同票候选进入第二轮陈述与复投',
        ));
      } else {
        result.push(action(
          event, index, 'tie', '全体玩家', undefined,
          '警徽空悬',
          electionResult === 'cancelled_by_self_destruct'
            ? '自爆打断竞选，本局不再产生警长'
            : '复投仍未决出唯一人选',
        ));
      }
    } else if (event.event_type === 'badge_transferred') {
      result.push(action(
        event, index, 'badge', data.from, data.to,
        '警徽完成移交', '归票权与 1.5 票由新的警长继承',
      ));
    } else if (event.event_type === 'badge_destroyed') {
      result.push(action(
        event, index, 'badge-destroyed', data.player, undefined,
        '警徽被撕毁', '本局余下时间不再拥有警长',
      ));
    } else if (
      event.event_type === 'player_speech'
      && (data.phase === 'last_words' || data.last_words === true)
    ) {
      result.push(action(
        event, index, 'last-words', data.speaker, undefined,
        '最后陈词', String(data.content || '遗言留在了审判席上'),
      ));
    } else if (event.event_type === 'vote_result') {
      const voteResult = String(data.result);
      if (voteResult === 'idiot_revealed') {
        result.push(action(
          event, index, 'idiot', data.player, undefined,
          '白痴翻牌', '免于放逐，但永久失去投票权',
        ));
      } else if (voteResult === 'eliminated') {
        const player = String(data.eliminated);
        const role = ROLE_LABEL[roleAssignment[player]] || '未知身份';
        result.push(action(
          event, index, 'exile', '全体玩家', player,
          '放逐裁决', `${player} 离开审判席，身份揭晓：${role}`,
        ));
      } else if (voteResult === 'tie' || voteResult === 'no_elimination') {
        result.push(action(
          event, index, 'tie', (data.candidates as string[] || []).join(' / '), undefined,
          voteResult === 'tie' ? '平票加赛' : '无人放逐',
          voteResult === 'tie' ? '同票者依次陈述，其余玩家进行复投' : '复投再次同票，审判席无人离开',
        ));
      } else if (voteResult === 'no_votes') {
        result.push(action(
          event, index, 'tie', '全体玩家', undefined,
          '审判流票', '没有任何有效票，白天无人放逐',
        ));
      }
    } else if (event.event_type === 'game_end') {
      const good = data.winner === 'good';
      result.push(action(
        event,
        index,
        good ? 'victory-good' : 'victory-wolf',
        good ? '好人阵营' : '狼人阵营',
        undefined,
        good ? '黎明属于好人' : '长夜吞没村庄',
        `历经 ${String(data.final_round)} 轮，所有身份在此刻揭晓`,
      ));
    }
  }
  return result;
}
