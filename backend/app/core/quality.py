"""基于完整事件流的确定性对局质检，不调用模型。"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.quality_checks import (
    ACTOR_FIELDS,
    CATEGORIES,
    NIGHT_ACTIONS,
    ROLE_REQUIREMENTS,
    TARGET_FIELDS,
    WOLF_ROLES,
    _as_int,
    _check_coherence,
    _check_flow,
    _check_personality,
    _check_private_visibility,
    _check_reliability,
    _dead_actor_is_allowed,
)


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
            "code": code,
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
    _check_coherence(events, roles, add)
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

