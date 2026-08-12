"""基于完整事件流的确定性对局质检，不调用模型。"""
from datetime import datetime, timezone
from difflib import SequenceMatcher
import re
from statistics import median
from typing import Any, Dict, List, Optional, Set, Tuple


WOLF_ROLES = {
    "werewolf", "white_wolf_king", "wolf_king", "wolf_beauty",
}

CATEGORIES = {
    "rules": ("规则合法性", "身份、存活状态与动作边界"),
    "privacy": ("信息隔离", "夜间私密事件的可见范围"),
    "flow": ("流程与终局", "死亡、遗言、技能与终局顺序"),
    "coherence": ("行为连贯性", "重复发言、身份声明与立场变化"),
    "personality": ("性格表达", "可观察表达是否贴合性格参数"),
    "reliability": ("模型可靠性", "降级、无效响应、延迟与 Token 预算"),
}

ACTOR_FIELDS = {
    "wolf_beauty_charm": "wolf_beauty",
    "werewolf_kill": "killer",
    "wolf_discussion": "speaker",
    "seer_investigate": "seer",
    "guard_action": "guard",
    "guard_pass": "guard",
    "witch_heal": "witch",
    "witch_poison": "witch",
    "knight_duel": "knight",
    "player_speech": "speaker",
    "player_vote": "voter",
    "player_abstain": "voter",
    "sheriff_vote": "voter",
    "sheriff_abstain": "voter",
    "sheriff_withdrawal": "player",
    "sheriff_campaign_pass": "player",
    "player_pass": "player",
    "wolf_self_destruct": "player",
    "white_wolf_king_self_destruct": "player",
}

TARGET_FIELDS = {
    "wolf_beauty_charm": "target",
    "werewolf_kill": "target",
    "seer_investigate": "target",
    "guard_action": "target",
    "witch_heal": "target",
    "witch_poison": "target",
    "knight_duel": "target",
    "player_vote": "target",
    "sheriff_vote": "target",
    "white_wolf_king_self_destruct": "target",
}

ROLE_REQUIREMENTS = {
    "wolf_beauty_charm": {"wolf_beauty"},
    "werewolf_kill": WOLF_ROLES,
    "wolf_discussion": WOLF_ROLES,
    "seer_investigate": {"seer"},
    "guard_action": {"guard"},
    "guard_pass": {"guard"},
    "witch_heal": {"witch"},
    "witch_poison": {"witch"},
    "knight_duel": {"knight"},
    "wolf_self_destruct": {"werewolf", "wolf_king"},
    "white_wolf_king_self_destruct": {"white_wolf_king"},
}

NIGHT_ACTIONS = {
    "wolf_beauty_charm", "werewolf_kill", "wolf_discussion",
    "seer_investigate", "guard_action", "guard_pass",
    "witch_heal", "witch_poison",
}


def build_quality_report(
    *,
    events: List[Dict[str, Any]],
    role_assignment: Dict[str, str],
    winner: Optional[str],
    final_round: int,
    llm_metrics: Optional[Dict[str, Any]] = None,
    player_tokens: Optional[Dict[str, int]] = None,
    budget_profile: Optional[Dict[str, int]] = None,
    personality_assignment: Optional[Dict[str, Dict[str, Any]]] = None,
    win_rule: str = "parity",
    max_rounds: int = 20,
) -> Dict[str, Any]:
    """审计一局已结束游戏并返回可直接持久化的报告。"""
    roles = {str(player): str(role) for player, role in role_assignment.items()}
    known_players = set(roles)
    alive = set(known_players)
    findings: List[Dict[str, Any]] = []
    finding_seq = 0

    def add(
        category: str,
        severity: str,
        code: str,
        title: str,
        detail: str,
        *,
        event_index: Optional[int] = None,
        round_no: Optional[int] = None,
        player_id: Optional[str] = None,
        confidence: str = "certain",
    ) -> None:
        nonlocal finding_seq
        finding_seq += 1
        finding = {
            "id": f"{category}-{code}-{finding_seq}",
            "category": category,
            "severity": severity,
            "confidence": confidence,
            "title": title,
            "detail": detail,
        }
        if event_index is not None:
            finding["event_index"] = event_index
        if round_no is not None:
            finding["round"] = round_no
        if player_id:
            finding["player_id"] = player_id
        findings.append(finding)

    deaths: List[Tuple[int, str, str, int]] = []
    death_skill_required: List[Tuple[int, str, int]] = []
    revealed_idiots: Set[str] = set()
    seen_actions: Set[Tuple[str, str, int, str]] = set()
    guard_history: List[Tuple[int, str, int]] = []
    charm_history: List[Tuple[int, str, int]] = []
    witch_uses = {"witch_heal": [], "witch_poison": []}
    duel_indexes: List[int] = []

    for index, event in enumerate(events):
        if not isinstance(event, dict) or not isinstance(event.get("data"), dict):
            add(
                "rules", "error", "malformed-event", "事件结构无效",
                "事件不是包含 data 对象的有效记录。", event_index=index,
            )
            continue
        event_type = str(event.get("event_type") or "unknown")
        data = event["data"]
        event_round = _as_int(data.get("round"))
        phase = str(data.get("phase") or "")
        actor_field = ACTOR_FIELDS.get(event_type)
        actor = str(data.get(actor_field) or "") if actor_field else ""

        if actor:
            if actor not in known_players:
                add(
                    "rules", "error", "unknown-actor", "未知玩家执行了动作",
                    f"{actor} 不在本局玩家名单中，却产生了 {event_type}。",
                    event_index=index, round_no=event_round, player_id=actor,
                )
            else:
                required_roles = ROLE_REQUIREMENTS.get(event_type)
                if required_roles and roles.get(actor) not in required_roles:
                    add(
                        "rules", "error", "role-action", "角色越权行动",
                        f"{actor} 的身份是 {roles.get(actor)}，不能执行 {event_type}。",
                        event_index=index, round_no=event_round, player_id=actor,
                    )
                if actor not in alive and not _dead_actor_is_allowed(event_type, data):
                    add(
                        "rules", "error", "dead-action", "已出局玩家继续行动",
                        f"{actor} 已经出局，却执行了 {event_type}。",
                        event_index=index, round_no=event_round, player_id=actor,
                    )
                if actor in revealed_idiots and event_type in {
                    "player_vote", "player_abstain",
                }:
                    add(
                        "rules", "error", "revealed-idiot-vote", "翻牌白痴参与投票",
                        f"{actor} 翻牌后已经失去投票权。",
                        event_index=index, round_no=event_round, player_id=actor,
                    )

        target_field = TARGET_FIELDS.get(event_type)
        target = str(data.get(target_field) or "") if target_field else ""
        if target:
            if target not in known_players:
                add(
                    "rules", "error", "unknown-target", "动作目标不存在",
                    f"{event_type} 指向了不在本局名单中的 {target}。",
                    event_index=index, round_no=event_round, player_id=actor or None,
                )
            elif target not in alive:
                add(
                    "rules", "error", "dead-target", "动作指向已出局玩家",
                    f"{event_type} 的目标 {target} 在动作发生前已经出局。",
                    event_index=index, round_no=event_round, player_id=actor or None,
                )
            if event_type in {
                "wolf_beauty_charm", "seer_investigate", "witch_heal",
                "witch_poison", "knight_duel", "white_wolf_king_self_destruct",
            } and target == actor:
                add(
                    "rules", "error", "illegal-self-target", "技能错误地指向自己",
                    f"{actor} 的 {event_type} 不允许以自己为目标。",
                    event_index=index, round_no=event_round, player_id=actor,
                )

        if event_type in NIGHT_ACTIONS and phase and phase != "night":
            add(
                "rules", "error", "wrong-phase", "夜间技能出现在错误阶段",
                f"{event_type} 被记录在 {phase} 阶段。",
                event_index=index, round_no=event_round, player_id=actor or None,
            )

        action_group = {
            "guard_action": "guard_choice",
            "guard_pass": "guard_choice",
            "player_vote": "day_vote",
            "player_abstain": "day_vote",
            "sheriff_vote": "sheriff_vote",
            "sheriff_abstain": "sheriff_vote",
        }.get(event_type, event_type)
        action_key = (action_group, actor, event_round or 0, phase)
        if actor and event_type in {
            "werewolf_kill", "wolf_discussion", "seer_investigate", "guard_action", "guard_pass",
            "witch_heal", "witch_poison", "knight_duel", "player_vote",
            "player_abstain", "sheriff_vote", "sheriff_abstain",
        }:
            if action_key in seen_actions:
                add(
                    "rules", "error", "duplicate-action", "同一阶段重复行动",
                    f"{actor} 在同一轮同一阶段重复执行了 {event_type}。",
                    event_index=index, round_no=event_round, player_id=actor,
                )
            seen_actions.add(action_key)

        if event_type == "guard_action" and target and event_round is not None:
            if guard_history and guard_history[-1][0] == event_round - 1 and guard_history[-1][1] == target:
                add(
                    "rules", "error", "consecutive-guard", "守卫连续两晚守同一人",
                    f"{actor} 连续两晚守护了 {target}。",
                    event_index=index, round_no=event_round, player_id=actor,
                )
            guard_history.append((event_round, target, index))
        elif event_type == "guard_pass" and not str(data.get("reasoning") or "").strip():
            add(
                "coherence", "warning", "guard-pass-reason", "空守缺少理由",
                f"{actor} 选择空守，但没有留下可审计的选择依据。",
                event_index=index, round_no=event_round, player_id=actor,
            )
        elif event_type == "wolf_beauty_charm" and target and event_round is not None:
            if charm_history and charm_history[-1][0] == event_round - 1 and charm_history[-1][1] == target:
                add(
                    "rules", "error", "consecutive-charm", "狼美人连续魅惑同一人",
                    f"{actor} 连续两晚魅惑了 {target}。",
                    event_index=index, round_no=event_round, player_id=actor,
                )
            charm_history.append((event_round, target, index))
        elif event_type in witch_uses:
            witch_uses[event_type].append((index, actor, event_round))
            if len(witch_uses[event_type]) > 1:
                add(
                    "rules", "error", "witch-potion-reused", "女巫药剂被重复使用",
                    f"{actor} 第二次使用了同一种药剂。",
                    event_index=index, round_no=event_round, player_id=actor,
                )
            other = "witch_poison" if event_type == "witch_heal" else "witch_heal"
            if any(item[2] == event_round for item in witch_uses[other]):
                add(
                    "rules", "error", "witch-double-action", "女巫同夜使用两瓶药",
                    f"{actor} 在第 {event_round} 夜同时使用了解药和毒药。",
                    event_index=index, round_no=event_round, player_id=actor,
                )
        elif event_type == "knight_duel":
            duel_indexes.append(index)
            if len(duel_indexes) > 1:
                add(
                    "rules", "error", "knight-reused", "骑士重复发动决斗",
                    "骑士技能整局只能使用一次。", event_index=index,
                    round_no=event_round, player_id=actor,
                )

        _check_private_visibility(
            event_type, event, data, roles, index, event_round, add,
        )

        if event_type == "vote_result" and data.get("result") == "idiot_revealed":
            idiot = str(data.get("player") or data.get("eliminated") or "")
            if idiot:
                revealed_idiots.add(idiot)

        if event_type == "player_death":
            player = str(data.get("player") or "")
            cause = str(data.get("cause") or "unknown")
            if player not in known_players:
                add(
                    "flow", "error", "unknown-death", "未知玩家出现在死亡记录",
                    f"死亡记录中的 {player or '空目标'} 不属于本局。",
                    event_index=index, round_no=event_round,
                )
            elif player not in alive:
                add(
                    "flow", "error", "duplicate-death", "玩家被重复结算死亡",
                    f"{player} 在此前已经出局。", event_index=index,
                    round_no=event_round, player_id=player,
                )
            else:
                alive.remove(player)
                deaths.append((index, player, cause, event_round or 0))
                role = roles.get(player)
                trigger = role == "hunter" and cause in {"werewolf_kill", "voted_out"}
                trigger = trigger or (
                    role == "wolf_king"
                    and cause in {"werewolf_kill", "voted_out", "hunter_shot"}
                    and any(roles.get(other) in WOLF_ROLES for other in alive)
                )
                if trigger:
                    death_skill_required.append((index, player, event_round or 0))
            shooter = str(data.get("shooter") or "")
            expected_shooter_role = {
                "hunter_shot": "hunter", "wolf_king_shot": "wolf_king",
            }.get(cause)
            if expected_shooter_role and roles.get(shooter) != expected_shooter_role:
                add(
                    "rules", "error", "invalid-shooter", "枪械触发者身份错误",
                    f"{cause} 的触发者 {shooter or '缺失'} 不是 {expected_shooter_role}。",
                    event_index=index, round_no=event_round, player_id=shooter or None,
                )

    _check_flow(
        events, deaths, death_skill_required, roles, alive, winner,
        final_round, win_rule, max_rounds, add,
    )
    _check_coherence(events, add)
    personality_metrics = _check_personality(
        events, personality_assignment or {}, add,
    )
    reliability_metrics = _check_reliability(
        events,
        llm_metrics or {},
        player_tokens or {},
        budget_profile or {},
        add,
    )

    severity_counts = {
        severity: sum(1 for item in findings if item["severity"] == severity)
        for severity in ("error", "warning", "info")
    }
    checks = []
    for category, (label, description) in CATEGORIES.items():
        category_findings = [item for item in findings if item["category"] == category]
        category_status = "failed" if any(
            item["severity"] == "error" for item in category_findings
        ) else "warning" if any(
            item["severity"] == "warning" for item in category_findings
        ) else "passed"
        checks.append({
            "category": category,
            "label": label,
            "description": description,
            "status": category_status,
            "finding_count": len(category_findings),
        })

    score = max(
        0,
        100
        - severity_counts["error"] * 18
        - severity_counts["warning"] * 6
        - severity_counts["info"],
    )
    status = "failed" if severity_counts["error"] else (
        "warning" if severity_counts["warning"] else "passed"
    )
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "score": score,
        "summary": {
            **severity_counts,
            "issues": severity_counts["error"] + severity_counts["warning"],
            "observations": severity_counts["info"],
            "checks_total": len(checks),
            "checks_passed": sum(check["status"] == "passed" for check in checks),
        },
        "metrics": {
            "event_count": len(events),
            "player_count": len(roles),
            "personality": personality_metrics,
            "reliability": reliability_metrics,
        },
        "checks": checks,
        "findings": findings,
    }


def _check_private_visibility(
    event_type: str,
    event: Dict[str, Any],
    data: Dict[str, Any],
    roles: Dict[str, str],
    index: int,
    round_no: Optional[int],
    add,
) -> None:
    expected: Optional[Set[str]] = None
    actor: Optional[str] = None
    if event_type in {"werewolf_kill", "wolf_discussion"}:
        expected = {player for player, role in roles.items() if role in WOLF_ROLES}
        actor_field = ACTOR_FIELDS[event_type]
        actor = str(data.get(actor_field) or "")
    elif event_type in {
        "wolf_beauty_charm", "seer_investigate", "guard_action", "guard_pass",
        "witch_heal", "witch_poison", "player_pass",
    }:
        actor_field = ACTOR_FIELDS[event_type]
        actor = str(data.get(actor_field) or "")
        expected = {actor} if actor else set()
    elif event_type in {"game_start", "agent_fallback"}:
        expected = {"admin"}

    if expected is None:
        return
    visible_to = {str(player) for player in event.get("visible_to") or []}
    if event.get("visibility") != "private":
        add(
            "privacy", "error", "private-event-public", "私密事件被公开",
            f"{event_type} 应为私密事件，当前 visibility={event.get('visibility')}。",
            event_index=index, round_no=round_no, player_id=actor,
        )
        return
    unauthorized = visible_to - expected
    if unauthorized:
        add(
            "privacy", "error", "unauthorized-viewer", "夜间信息越权可见",
            f"{event_type} 错误地对 {', '.join(sorted(unauthorized))} 可见。",
            event_index=index, round_no=round_no, player_id=actor,
        )
    required_viewer = "admin" if event_type in {"game_start", "agent_fallback"} else actor
    if required_viewer and required_viewer not in visible_to:
        add(
            "privacy", "error", "missing-viewer", "私密事件缺少必要可见对象",
            f"{event_type} 没有对 {required_viewer} 开放可见范围。",
            event_index=index, round_no=round_no, player_id=actor,
        )


def _check_flow(
    events: List[Dict[str, Any]],
    deaths: List[Tuple[int, str, str, int]],
    death_skill_required: List[Tuple[int, str, int]],
    roles: Dict[str, str],
    alive: Set[str],
    winner: Optional[str],
    final_round: int,
    win_rule: str,
    max_rounds: int,
    add,
) -> None:
    end_indexes = [
        index for index, event in enumerate(events)
        if isinstance(event, dict) and event.get("event_type") == "game_end"
    ]
    if len(end_indexes) != 1:
        add(
            "flow", "error", "game-end-count", "终局事件数量异常",
            f"完整事件流应且仅应有一个 game_end，实际为 {len(end_indexes)} 个。",
            event_index=end_indexes[0] if end_indexes else None,
        )
    elif end_indexes[0] != len(events) - 1:
        add(
            "flow", "error", "events-after-end", "终局后仍有事件发生",
            "game_end 不是完整事件流的最后一项。", event_index=end_indexes[0],
        )

    end_data = (
        events[end_indexes[0]].get("data", {})
        if end_indexes else {}
    )
    event_final_round = _as_int(end_data.get("final_round"))
    if event_final_round is not None and event_final_round != final_round:
        add(
            "flow", "error", "final-round-mismatch", "终局轮次记录不一致",
            f"结果记录为第 {final_round} 轮，game_end 记录为第 {event_final_round} 轮。",
            event_index=end_indexes[0] if end_indexes else None,
        )
    if winner and end_data.get("winner") and end_data.get("winner") != winner:
        add(
            "flow", "error", "winner-mismatch", "终局胜方记录不一致",
            f"持久化胜方为 {winner}，game_end 胜方为 {end_data.get('winner')}。",
            event_index=end_indexes[0] if end_indexes else None,
        )

    rounds = [
        value for event in events if isinstance(event, dict)
        for value in [_as_int((event.get("data") or {}).get("round"))]
        if value is not None
    ]
    if rounds and max(rounds) > final_round:
        first = next(
            index for index, event in enumerate(events)
            if (_as_int((event.get("data") or {}).get("round")) or 0) > final_round
        )
        add(
            "flow", "error", "phantom-round", "终局后出现幽灵回合",
            f"最终结果停在第 {final_round} 轮，但事件流推进到了第 {max(rounds)} 轮。",
            event_index=first, round_no=max(rounds),
        )

    reason = str(end_data.get("reason") or "")
    if reason == "max_rounds_reached" and final_round != max_rounds:
        add(
            "flow", "error", "round-limit-mismatch", "最大回合结算错误",
            f"配置上限为 {max_rounds} 轮，却在第 {final_round} 轮按上限和局。",
            event_index=end_indexes[0] if end_indexes else None,
        )

    wolf_alive = [player for player in alive if roles.get(player) in WOLF_ROLES]
    good_alive = [player for player in alive if roles.get(player) not in WOLF_ROLES]
    if winner == "good" and wolf_alive:
        add(
            "flow", "error", "premature-good-win", "好人胜利判定过早",
            f"终局时仍有狼人存活：{', '.join(sorted(wolf_alive))}。",
            event_index=end_indexes[0] if end_indexes else None,
        )
    if (
        winner == "werewolf" and not wolf_alive
        and reason not in {"wolf_skill_completed_edge", "wolf_beauty_charm_completed_edge"}
    ):
        add(
            "flow", "error", "wolf-win-without-wolf", "狼人胜利条件不成立",
            "终局时狼人已经全部出局，且没有狼方技能优先结算依据。",
            event_index=end_indexes[0] if end_indexes else None,
        )
    if winner == "werewolf" and reason not in {
        "wolf_skill_completed_edge", "wolf_beauty_charm_completed_edge",
        "werewolf_kill_completed_edge",
    }:
        if win_rule == "parity" and len(wolf_alive) < len(good_alive):
            add(
                "flow", "error", "premature-parity-win", "狼人胜利判定过早",
                f"终局仍有 {len(good_alive)} 名好人、{len(wolf_alive)} 名狼人，尚未达到人数胜利条件。",
                event_index=end_indexes[0] if end_indexes else None,
            )
        elif win_rule == "edge":
            villagers_alive = any(roles.get(player) == "villager" for player in alive)
            gods_alive = any(
                roles.get(player) not in WOLF_ROLES | {"villager"}
                for player in alive
            )
            if villagers_alive and gods_alive:
                add(
                    "flow", "error", "premature-edge-win", "狼人尚未完成屠边",
                    "终局时仍同时存在平民与神职，狼人屠边条件尚未成立。",
                    event_index=end_indexes[0] if end_indexes else None,
                )

    last_words = {
        str((event.get("data") or {}).get("speaker")): index
        for index, event in enumerate(events)
        if event.get("event_type") == "player_speech"
        and (event.get("data") or {}).get("last_words")
    }
    for death_index, player, cause, death_round in deaths:
        needs_last_words = cause == "voted_out" or (
            death_round == 1 and cause in {"werewolf_kill", "poison"}
        )
        if needs_last_words and player not in last_words:
            add(
                "flow", "error", "missing-last-words", "应有遗言但没有进入遗言阶段",
                f"{player} 因 {cause} 出局，按当前规则应获得遗言。",
                event_index=death_index, round_no=death_round, player_id=player,
            )
        elif needs_last_words and last_words[player] < death_index:
            add(
                "flow", "error", "early-last-words", "遗言发生在死亡之前",
                f"{player} 的遗言顺序早于其死亡结算。",
                event_index=last_words[player], round_no=death_round, player_id=player,
            )

        if cause == "voted_out":
            vote_exists = any(
                event.get("event_type") == "vote_result"
                and (event.get("data") or {}).get("eliminated") == player
                for event in events[:death_index]
            )
            if not vote_exists:
                add(
                    "flow", "error", "death-without-vote", "放逐死亡缺少投票结果",
                    f"{player} 被标记为 voted_out，但此前没有对应 vote_result。",
                    event_index=death_index, round_no=death_round, player_id=player,
                )

    for death_index, player, death_round in death_skill_required:
        resolution_indexes = [
            index for index, event in enumerate(events[death_index + 1:], death_index + 1)
            if (
                event.get("event_type") == "player_death"
                and (event.get("data") or {}).get("shooter") == player
            ) or (
                event.get("event_type") == "player_pass"
                and (event.get("data") or {}).get("player") == player
                and (event.get("data") or {}).get("phase") == "death_skill"
            )
        ]
        if not resolution_indexes:
            add(
                "flow", "error", "missing-death-skill", "死亡技能没有结算",
                f"{player} 出局后应获得开枪或放弃开枪的行动机会。",
                event_index=death_index, round_no=death_round, player_id=player,
            )
        elif player in last_words and resolution_indexes[0] > last_words[player]:
            add(
                "flow", "error", "death-skill-order", "死亡技能晚于遗言结算",
                f"{player} 应先处理死亡技能，再发表遗言。",
                event_index=last_words[player], round_no=death_round, player_id=player,
            )


def _check_coherence(events: List[Dict[str, Any]], add) -> None:
    wolf_messages: Dict[int, List[Tuple[int, str]]] = {}
    speeches: Dict[str, List[Tuple[int, str]]] = {}
    claims: Dict[str, Tuple[str, int]] = {}
    stances: Dict[str, Dict[str, Set[str]]] = {}

    for index, event in enumerate(events):
        data = event.get("data") or {}
        event_type = event.get("event_type")
        round_no = _as_int(data.get("round"))
        if event_type == "wolf_discussion":
            content = str(data.get("content") or "")
            previous = wolf_messages.setdefault(round_no or 0, [])
            current_ids = _player_mentions(content)
            previous_ids = set().union(*(
                _player_mentions(text) for _, text in previous
            )) if previous else set()
            normalized = _normalize_text(content)
            agreement = content.strip().startswith(
                ("同意", "赞同", "支持", "没问题", "就按", "跟随")
            )
            repeated = agreement and not (current_ids - previous_ids)
            if not repeated:
                repeated = any(
                    min(len(normalized), len(_normalize_text(text))) >= 16
                    and SequenceMatcher(
                        None, normalized, _normalize_text(text), autojunk=False,
                    ).ratio() >= 0.88
                    and not (current_ids - _player_mentions(text))
                    for _, text in previous
                )
            if repeated:
                add(
                    "coherence", "warning", "repeated-wolf-chat", "狼队私聊重复已有结论",
                    "该发言没有增加新刀口、新依据或新风险，降低了夜间协商效率。",
                    event_index=index, round_no=round_no,
                    player_id=str(data.get("speaker") or ""), confidence="heuristic",
                )
            previous.append((index, content))

        if event_type != "player_speech":
            continue
        player = str(data.get("speaker") or "")
        content = str(data.get("content") or "")
        normalized = _normalize_text(content)
        prior_speeches = speeches.setdefault(player, [])
        if len(normalized) >= 30 and any(
            SequenceMatcher(None, normalized, text, autojunk=False).ratio() >= 0.94
            for _, text in prior_speeches
        ):
            add(
                "coherence", "warning", "repeated-public-speech", "公开发言高度重复",
                f"{player} 的发言与此前内容几乎一致，可能没有吸收新信息。",
                event_index=index, round_no=round_no, player_id=player,
                confidence="heuristic",
            )
        prior_speeches.append((index, normalized))

        claim = str(data.get("claim_role") or "none")
        if claim != "none":
            prior_claim = claims.get(player)
            if prior_claim and prior_claim[0] != claim:
                add(
                    "coherence", "info", "claim-change", "公开身份声明发生变化",
                    f"{player} 先声明 {prior_claim[0]}，随后改为 {claim}，建议复盘其策略依据。",
                    event_index=index, round_no=round_no, player_id=player,
                    confidence="heuristic",
                )
            claims[player] = (claim, index)

        suspects = set(data.get("suspects") or [])
        trusted = set(data.get("trusted") or [])
        previous_stance = stances.get(player, {"suspects": set(), "trusted": set()})
        reversed_targets = (
            suspects & previous_stance["trusted"]
        ) | (
            trusted & previous_stance["suspects"]
        )
        if reversed_targets and not (data.get("evidence_event_indexes") or []):
            add(
                "coherence", "info", "stance-reversal", "立场反转未引用公开事件",
                f"{player} 对 {', '.join(sorted(reversed_targets))} 的态度发生反转，但未附事件依据。",
                event_index=index, round_no=round_no, player_id=player,
                confidence="heuristic",
            )
        stances[player] = {"suspects": suspects, "trusted": trusted}


def _check_personality(
    events: List[Dict[str, Any]],
    personalities: Dict[str, Dict[str, Any]],
    add,
) -> Dict[str, Any]:
    speeches: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        data = event.get("data") or {}
        if (
            event.get("event_type") == "player_speech"
            and not data.get("last_words")
            and str(data.get("content") or "") != "我暂时没有新的信息。"
        ):
            speeches.setdefault(str(data.get("speaker") or ""), []).append(data)

    evaluated = 0
    mismatched: Set[str] = set()
    for player, personality in personalities.items():
        player_speeches = speeches.get(player, [])
        if len(player_speeches) < 2:
            continue
        evaluated += 1
        average_length = round(sum(
            len(re.sub(r"\s+", "", str(item.get("content") or "")))
            for item in player_speeches
        ) / len(player_speeches))
        verbosity = _as_int(personality.get("verbosity")) or 3
        decisive_ratio = sum(bool(
            item.get("suspects") or item.get("intended_vote")
        ) for item in player_speeches) / len(player_speeches)
        assertiveness = _as_int(personality.get("assertiveness")) or 3
        mismatches = []
        if verbosity <= 2 and average_length > 260:
            mismatches.append(f"低话量配置但平均发言 {average_length} 字")
        elif verbosity >= 4 and average_length < 70:
            mismatches.append(f"高话量配置但平均发言仅 {average_length} 字")
        if assertiveness >= 4 and len(player_speeches) >= 3 and decisive_ratio < 0.25:
            mismatches.append("高强势配置但多数发言没有明确怀疑或投票意向")
        if mismatches:
            mismatched.add(player)
            add(
                "personality", "info", "weak-expression", "性格参数表达偏弱",
                f"{player}：{'；'.join(mismatches)}。",
                player_id=player, confidence="heuristic",
            )
    aligned = max(0, evaluated - len(mismatched))
    return {
        "configured_players": len(personalities),
        "evaluated_players": evaluated,
        "aligned_players": aligned,
        "expression_rate": round(aligned / evaluated, 3) if evaluated else None,
    }


def _check_reliability(
    events: List[Dict[str, Any]],
    metrics: Dict[str, Any],
    player_tokens: Dict[str, int],
    budget: Dict[str, int],
    add,
) -> Dict[str, Any]:
    fallback_events = [
        (index, event) for index, event in enumerate(events)
        if event.get("event_type") == "agent_fallback"
    ]
    calls = metrics.get("calls") if isinstance(metrics.get("calls"), list) else []
    total_calls = max(
        _as_int(metrics.get("total_calls")) or 0,
        len(calls),
        len(fallback_events),
    )
    fallback_count = _as_int(metrics.get("fallback_calls"))
    if fallback_count is None:
        fallback_count = len(fallback_events)
    fallback_rate = fallback_count / total_calls if total_calls else 0.0
    first_fallback = fallback_events[0][0] if fallback_events else None

    reasons = [
        str(call.get("failure_reason") or "") for call in calls
        if isinstance(call, dict) and call.get("failure_reason")
    ] or [
        str((event.get("data") or {}).get("message") or "")
        for _, event in fallback_events
    ]
    budget_failures = [reason for reason in reasons if _is_budget_failure(reason)]
    invalid_failures = [
        reason for reason in reasons
        if not _is_budget_failure(reason) and not _is_circuit_failure(reason)
    ]

    if fallback_rate >= 0.8:
        add(
            "reliability", "error", "fallback-collapse", "模型决策大面积降级",
            f"{fallback_count}/{total_calls} 次决策使用了本地兜底，对局已难以代表模型真实水平。",
            event_index=first_fallback,
        )
    elif fallback_rate >= 0.1:
        add(
            "reliability", "warning", "fallback-high", "模型降级比例偏高",
            f"{fallback_count}/{total_calls} 次决策使用了本地兜底（{fallback_rate:.0%}）。",
            event_index=first_fallback,
        )
    elif fallback_count:
        add(
            "reliability", "info", "fallback-present", "发生少量模型降级",
            f"{fallback_count}/{total_calls} 次决策使用了本地兜底。",
            event_index=first_fallback,
        )

    if invalid_failures:
        invalid_index = next((
            index for index, event in fallback_events
            if not _is_budget_failure(str((event.get("data") or {}).get("message") or ""))
            and not _is_circuit_failure(str((event.get("data") or {}).get("message") or ""))
        ), first_fallback)
        add(
            "reliability", "warning", "invalid-output", "模型返回了无效结构化动作",
            f"共有 {len(invalid_failures)} 次响应因格式、语义或请求错误而降级。",
            event_index=invalid_index,
        )
    if budget_failures:
        budget_index = next((
            index for index, event in fallback_events
            if _is_budget_failure(str((event.get("data") or {}).get("message") or ""))
        ), first_fallback)
        add(
            "reliability",
            "warning" if len(budget_failures) / max(total_calls, 1) >= 0.1 else "info",
            "budget-fallback", "Token 预算导致决策降级",
            f"共有 {len(budget_failures)} 次调用因玩家或全局预算不足而停止。",
            event_index=budget_index,
        )

    repaired = _as_int(metrics.get("repaired_json_calls")) or 0
    if total_calls and repaired / total_calls >= 0.2:
        add(
            "reliability", "info", "json-repair-high", "响应频繁依赖本地 JSON 修复",
            f"{repaired}/{total_calls} 次响应需要修复后才能解析。",
        )

    total_tokens = sum(max(0, _as_int(value) or 0) for value in player_tokens.values())
    game_cap = _as_int(budget.get("game_token_budget")) or 0
    player_cap = _as_int(budget.get("player_token_budget")) or 0
    if game_cap and total_tokens > game_cap:
        add(
            "reliability", "error", "game-budget-exceeded", "本局 Token 超过硬上限",
            f"实际记录 {total_tokens:,} tokens，硬上限为 {game_cap:,}。",
        )
    elif game_cap and total_tokens >= game_cap * 0.9:
        add(
            "reliability", "warning", "game-budget-near", "本局 Token 接近硬上限",
            f"已使用 {total_tokens:,}/{game_cap:,} tokens（{total_tokens / game_cap:.0%}）。",
        )
    for player, tokens in player_tokens.items():
        amount = max(0, _as_int(tokens) or 0)
        if player_cap and amount > player_cap:
            add(
                "reliability", "error", "player-budget-exceeded", "玩家 Token 超过硬上限",
                f"{player} 使用 {amount:,} tokens，单玩家上限为 {player_cap:,}。",
                player_id=player,
            )

    positive_tokens = [
        max(0, _as_int(value) or 0) for value in player_tokens.values()
        if (_as_int(value) or 0) > 0
    ]
    if len(positive_tokens) >= 3:
        middle = median(positive_tokens)
        highest_player, highest = max(
            ((player, _as_int(value) or 0) for player, value in player_tokens.items()),
            key=lambda item: item[1],
        )
        if middle and highest > middle * 3 and highest - middle > 20_000:
            add(
                "reliability", "info", "token-imbalance", "玩家间 Token 消耗明显失衡",
                f"{highest_player} 使用 {highest:,} tokens，中位数为 {middle:,.0f}。",
                player_id=highest_player,
            )

    average_latency = _as_int(metrics.get("average_latency_ms")) or 0
    if average_latency >= 15_000:
        add(
            "reliability", "warning", "latency-high", "模型平均响应较慢",
            f"平均单次决策耗时 {average_latency / 1000:.1f} 秒。",
        )
    return {
        "total_calls": total_calls,
        "fallback_calls": fallback_count,
        "fallback_rate": round(fallback_rate, 3),
        "invalid_response_calls": len(invalid_failures),
        "budget_blocked_calls": len(budget_failures),
        "repaired_json_calls": repaired,
        "total_tokens": total_tokens,
        "game_token_budget": game_cap,
        "token_budget_ratio": round(total_tokens / game_cap, 3) if game_cap else None,
    }


def _dead_actor_is_allowed(event_type: str, data: Dict[str, Any]) -> bool:
    return (
        event_type == "player_speech"
        and (data.get("last_words") or data.get("phase") == "last_words")
    ) or (
        event_type == "player_pass" and data.get("phase") == "death_skill"
    )


def _normalize_text(value: str) -> str:
    return re.sub(r"[\W_]+", "", value).lower()


def _player_mentions(value: str) -> Set[str]:
    return {
        match.upper() for match in re.findall(r"AI-\d+", value, flags=re.IGNORECASE)
    }


def _is_budget_failure(reason: str) -> bool:
    lowered = reason.lower()
    return "预算" in reason or "budget" in lowered or (
        "token" in lowered and any(word in reason for word in ("不足", "达到", "仅剩"))
    )


def _is_circuit_failure(reason: str) -> bool:
    lowered = reason.lower()
    return "熔断" in reason or "circuit" in lowered


def _as_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
