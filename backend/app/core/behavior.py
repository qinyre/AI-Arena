"""Deterministic player-behavior metrics derived from persisted game events."""
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional


WOLF_ROLES = {"werewolf", "white_wolf_king", "wolf_king", "wolf_beauty"}
COUNTER_KEYS = (
    "votes", "vote_hits", "skills", "skill_hits", "speeches", "wolf_public_speeches",
    "repeated_speeches", "stance_reversals", "identity_leaks",
    "wolf_votes", "wolf_consensus_votes", "wolf_messages",
    "wolf_selected_votes", "wolf_team_votes", "repeated_wolf_messages",
)


def empty_behavior_counters() -> Dict[str, int]:
    return {key: 0 for key in COUNTER_KEYS}


def merge_behavior_counters(
    target: Dict[str, int], source: Optional[Dict[str, Any]],
) -> Dict[str, int]:
    for key in COUNTER_KEYS:
        target[key] = int(target.get(key, 0)) + int((source or {}).get(key, 0))
    return target


def build_behavior_report(
    *,
    events: List[Dict[str, Any]],
    role_assignment: Dict[str, str],
    quality_report: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build auditable per-player counters without another model call."""
    roles = {str(player): str(role) for player, role in role_assignment.items()}
    players = {player: empty_behavior_counters() for player in roles}
    deaths = {
        (
            _as_int((event.get("data") or {}).get("round")),
            str((event.get("data") or {}).get("player") or ""),
            str((event.get("data") or {}).get("cause") or ""),
        )
        for event in events
        if event.get("event_type") == "player_death"
    }
    wolf_votes_by_round: Dict[int, List[tuple[str, str]]] = {}
    charm_actions: List[tuple[str, str]] = []

    for event in events:
        event_type = event.get("event_type")
        data = event.get("data") or {}
        round_no = _as_int(data.get("round"))

        if event_type == "player_speech":
            speaker = str(data.get("speaker") or "")
            _counter(players, speaker)["speeches"] += 1
            if roles.get(speaker) in WOLF_ROLES:
                _counter(players, speaker)["wolf_public_speeches"] += 1
        elif event_type == "player_vote":
            voter = str(data.get("voter") or "")
            target = str(data.get("target") or "")
            counter = _counter(players, voter)
            counter["votes"] += 1
            if _aligned_target(roles.get(voter), roles.get(target)):
                counter["vote_hits"] += 1
        elif event_type == "werewolf_kill":
            actor = str(data.get("killer") or "")
            target = str(data.get("target") or "")
            _counter(players, actor)["wolf_votes"] += 1
            wolf_votes_by_round.setdefault(round_no, []).append((actor, target))
        elif event_type == "wolf_discussion":
            _counter(players, data.get("speaker"))["wolf_messages"] += 1
        elif event_type == "seer_investigate":
            _skill(players, data.get("seer"), data.get("result") == "狼人")
        elif event_type == "witch_poison":
            target = str(data.get("target") or "")
            _skill(players, data.get("witch"), roles.get(target) in WOLF_ROLES)
        elif event_type == "witch_heal":
            target = str(data.get("target") or "")
            saved = (
                roles.get(target) not in WOLF_ROLES
                and (round_no, target, "werewolf_kill") not in deaths
            )
            _skill(players, data.get("witch"), saved)
        elif event_type == "guard_action":
            # Resolved after the wolf-vote majority for this night is known.
            continue
        elif event_type == "knight_duel":
            _skill(
                players, data.get("knight"),
                data.get("target_faction") == "werewolf",
            )
        elif event_type == "wolf_beauty_charm":
            actor = str(data.get("wolf_beauty") or "")
            target = str(data.get("target") or "")
            _counter(players, actor)["skills"] += 1
            charm_actions.append((actor, target))
        elif event_type == "white_wolf_king_self_destruct":
            actor = str(data.get("player") or "")
            target = str(data.get("target") or "")
            _skill(players, actor, roles.get(target) not in WOLF_ROLES)
        elif event_type == "player_death" and data.get("shooter"):
            shooter = str(data.get("shooter") or "")
            target = str(data.get("player") or "")
            _skill(players, shooter, _aligned_target(roles.get(shooter), roles.get(target)))

    seat_order = {player: index for index, player in enumerate(roles)}
    selected_targets: Dict[int, str] = {}
    for round_no, votes in wolf_votes_by_round.items():
        counts = Counter(target for _, target in votes)
        highest = max(counts.values(), default=0)
        candidates = [target for target, count in counts.items() if count == highest]
        selected = min(candidates, key=lambda player: seat_order.get(player, 10**9))
        selected_targets[round_no] = selected
        is_team_night = len({actor for actor, _ in votes}) >= 2
        for actor, target in votes:
            if target == selected:
                _counter(players, actor)["wolf_selected_votes"] += 1
            if is_team_night:
                _counter(players, actor)["wolf_team_votes"] += 1
                if target == selected:
                    _counter(players, actor)["wolf_consensus_votes"] += 1

    for event in events:
        if event.get("event_type") != "guard_action":
            continue
        data = event.get("data") or {}
        round_no = _as_int(data.get("round"))
        target = str(data.get("target") or "")
        blocked = (
            selected_targets.get(round_no) == target
            and (round_no, target, "werewolf_kill") not in deaths
        )
        _skill(players, data.get("guard"), blocked)

    charm_deaths = {
        str((event.get("data") or {}).get("player") or "")
        for event in events
        if event.get("event_type") == "player_death"
        and (event.get("data") or {}).get("cause") == "wolf_beauty_charm"
    }
    credited_charm_targets = set()
    for actor, target in reversed(charm_actions):
        if target in charm_deaths and target not in credited_charm_targets:
            _counter(players, actor)["skill_hits"] += 1
            credited_charm_targets.add(target)

    finding_fields = {
        "repeated-public-speech": "repeated_speeches",
        "stance-reversal": "stance_reversals",
        "identity-leak": "identity_leaks",
        "repeated-wolf-chat": "repeated_wolf_messages",
    }
    for finding in (quality_report or {}).get("findings", []):
        code = finding.get("code")
        if not code:
            finding_id = str(finding.get("id") or "")
            code = next((item for item in finding_fields if item in finding_id), None)
        field = finding_fields.get(code)
        player = str(finding.get("player_id") or "")
        if field and player in players:
            players[player][field] += 1

    totals = empty_behavior_counters()
    for counters in players.values():
        merge_behavior_counters(totals, counters)
    return {"schema_version": 1, "players": players, "totals": totals}


def summarize_behavior(
    counters: Dict[str, Any],
    *,
    tokens: int = 0,
    balanced_win_rate: Optional[float] = None,
) -> Dict[str, Any]:
    """Turn raw counters into rates while retaining every denominator."""
    values = {key: int(counters.get(key, 0)) for key in COUNTER_KEYS}
    effective = (
        values["vote_hits"] + values["skill_hits"]
        + values["wolf_selected_votes"]
    )
    eligible = values["votes"] + values["skills"] + values["wolf_votes"]
    vote_rate = _rate(values["vote_hits"], values["votes"])
    skill_rate = _rate(values["skill_hits"], values["skills"])
    repeat_rate = _rate(values["repeated_speeches"], values["speeches"])
    reversal_rate = _rate(values["stance_reversals"], values["speeches"])
    leak_rate = _rate(values["identity_leaks"], values["wolf_public_speeches"])
    consensus_rate = _rate(values["wolf_consensus_votes"], values["wolf_team_votes"])
    wolf_repeat_rate = _rate(
        values["repeated_wolf_messages"], values["wolf_messages"],
    )
    coordination_parts = []
    if consensus_rate is not None:
        coordination_parts.append((consensus_rate, 3))
    if wolf_repeat_rate is not None:
        coordination_parts.append((100 - wolf_repeat_rate, 1))
    wolf_coordination = _weighted(coordination_parts)
    effective_rate = _rate(effective, eligible)

    score_parts = []
    if balanced_win_rate is not None:
        score_parts.append((balanced_win_rate, 25))
    for value, weight in (
        (vote_rate, 15), (skill_rate, 15),
        (_coherence_score(repeat_rate, reversal_rate), 15),
        ((100 - leak_rate) if leak_rate is not None else None, 10),
        (wolf_coordination, 15), (effective_rate, 5),
    ):
        if value is not None:
            score_parts.append((value, weight))

    return {
        "score": _weighted(score_parts),
        "vote_accuracy": vote_rate,
        "skill_value_rate": skill_rate,
        "speech_repeat_rate": repeat_rate,
        "stance_reversal_rate": reversal_rate,
        "identity_leak_rate": leak_rate,
        "wolf_coordination": wolf_coordination,
        "wolf_chat_repeat_rate": wolf_repeat_rate,
        "effective_decision_rate": effective_rate,
        "effective_decisions": effective,
        "eligible_decisions": eligible,
        "tokens_per_effective_decision": (
            round(int(tokens) / effective, 1) if effective else None
        ),
        "samples": values,
    }


def _counter(players: Dict[str, Dict[str, int]], player: Any) -> Dict[str, int]:
    return players.setdefault(str(player or ""), empty_behavior_counters())


def _skill(players: Dict[str, Dict[str, int]], player: Any, hit: bool) -> None:
    counter = _counter(players, player)
    counter["skills"] += 1
    counter["skill_hits"] += int(bool(hit))


def _aligned_target(actor_role: Optional[str], target_role: Optional[str]) -> bool:
    if not actor_role or not target_role:
        return False
    actor_is_wolf = actor_role in WOLF_ROLES
    target_is_wolf = target_role in WOLF_ROLES
    return actor_is_wolf != target_is_wolf


def _rate(numerator: int, denominator: int) -> Optional[float]:
    return round(numerator / denominator * 100, 1) if denominator else None


def _weighted(parts: Iterable[tuple[float, int]]) -> Optional[float]:
    values = [(float(value), int(weight)) for value, weight in parts]
    weight = sum(item[1] for item in values)
    return round(sum(value * item_weight for value, item_weight in values) / weight, 1) if weight else None


def _coherence_score(
    repeat_rate: Optional[float], reversal_rate: Optional[float],
) -> Optional[float]:
    parts = []
    if repeat_rate is not None:
        parts.append((100 - repeat_rate, 3))
    if reversal_rate is not None:
        parts.append((100 - reversal_rate, 2))
    return _weighted(parts)


def _as_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0
