"""
对局分析与统计的纯函数集合。

从 game_manager.py 拆出,避免单文件过度膨胀。这些函数不依赖任何实例状态,
仅对持久化记录 / 事件流做无副作用计算,便于独立测试。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from app.core.behavior import (
    empty_behavior_counters,
    merge_behavior_counters,
    summarize_behavior,
)
from app.core.models import Role


def _sanitize_player_configs(player_configs: List[Dict]) -> List[Dict]:
    """保留复赛所需配置，但绝不持久化 API Key。"""
    allowed = {
        "player_id",
        "avatar_id",
        "provider",
        "model",
        "api_format",
        "base_url",
        "key_env",
        "personality",
        "prompt_variant",
    }
    return [
        {
            key: value
            for key, value in config.items()
            if key in allowed and value is not None
        }
        for config in player_configs
    ]


def _rotate_player_configs(player_configs: List[Dict], offset: int) -> List[Dict]:
    """保持席位 ID 不变，将完整模型/性格配置循环移动到下一席。"""
    if not player_configs:
        return []
    seats = [config["player_id"] for config in player_configs]
    count = len(player_configs)
    return [
        {
            **player_configs[(seat_index - offset) % count],
            "player_id": seat_id,
        }
        for seat_index, seat_id in enumerate(seats)
    ]


def _build_prompt_experiment_report(
    records: List[Dict[str, Any]],
    *,
    variants: List[Dict[str, Any]],
    completed_pairs: int,
    pair_count: int,
    seat_count: int,
    series_status: str,
) -> Dict[str, Any]:
    """Only complete mirror pairs enter the comparison, preventing half-pair bias."""
    buckets: Dict[str, Dict[str, Any]] = {
        str(variant.get("id")): {
            "id": str(variant.get("id")),
            "name": str(variant.get("name") or variant.get("id")),
            "instructions": str(variant.get("instructions") or ""),
            "appearances": 0,
            "wins": 0,
            "calls": 0,
            "tokens": 0,
            "fallbacks": 0,
            "_games": set(),
            "_segments": {},
            "_behavior": empty_behavior_counters(),
        }
        for variant in variants
    }
    wolf_roles = {"werewolf", "white_wolf_king", "wolf_king", "wolf_beauty"}

    for record in records:
        roles = record.get("role_assignment", {})
        winner = record.get("winner")
        player_behavior = record.get("behavior_report", {}).get("players", {})
        player_tokens = record.get("player_tokens", {})
        by_player = record.get("llm_metrics", {}).get("by_player", {})
        for config in record.get("replay_config", {}).get("players", []):
            player_id = config.get("player_id")
            variant = config.get("prompt_variant") or {}
            bucket = buckets.get(str(variant.get("id")))
            role = roles.get(player_id)
            if not bucket or not player_id or not role:
                continue
            faction = "werewolf" if role in wolf_roles else "good"
            won = winner == faction
            metrics = by_player.get(player_id, {})
            bucket["appearances"] += 1
            bucket["wins"] += int(won)
            bucket["calls"] += int(metrics.get("calls", 0))
            bucket["tokens"] += max(
                int(metrics.get("tokens", 0)), int(player_tokens.get(player_id, 0)),
            )
            bucket["fallbacks"] += int(metrics.get("fallbacks", 0))
            bucket["_games"].add(record.get("game_id"))
            merge_behavior_counters(
                bucket["_behavior"], player_behavior.get(player_id),
            )
            segment_key = (record.get("board_id") or "unknown", faction, role)
            segment = bucket["_segments"].setdefault(
                segment_key, {"appearances": 0, "wins": 0},
            )
            segment["appearances"] += 1
            segment["wins"] += int(won)

    arms = []
    for variant in variants:
        bucket = buckets[str(variant.get("id"))]
        segments = [
            round(segment["wins"] / segment["appearances"] * 100, 1)
            for segment in bucket["_segments"].values()
            if segment["appearances"]
        ]
        appearances = bucket["appearances"]
        balanced = round(sum(segments) / len(segments), 1) if segments else 0.0
        behavior = summarize_behavior(
            bucket["_behavior"],
            tokens=bucket["tokens"],
            balanced_win_rate=balanced if appearances else None,
        )
        arms.append({
            **{
                key: value for key, value in bucket.items()
                if key not in {"_games", "_segments", "_behavior"}
            },
            "games": len(bucket["_games"]),
            "win_rate": round(bucket["wins"] / appearances * 100, 1) if appearances else 0.0,
            "balanced_win_rate": balanced,
            "fallback_rate": round(
                bucket["fallbacks"] / bucket["calls"] * 100, 1,
            ) if bucket["calls"] else 0.0,
            "behavior": behavior,
        })

    complete_rotation = completed_pairs >= seat_count > 0
    scores = [arm["behavior"].get("score") for arm in arms]
    delta = (
        round(float(scores[1]) - float(scores[0]), 1)
        if len(scores) == 2 and all(score is not None for score in scores)
        else None
    )
    winner = None
    if complete_rotation and delta is not None:
        winner = "tie" if abs(delta) < 2 else (arms[1]["id"] if delta > 0 else arms[0]["id"])
    if not complete_rotation:
        report_status = "collecting" if series_status in {"running", "pending"} else "inconclusive"
        verdict = f"至少完成 {seat_count} 个镜像配对后才形成整轮席位样本。"
    elif winner == "tie":
        report_status = "ready"
        verdict = "两个版本的综合行为分差小于 2 分，当前视为持平。"
    else:
        report_status = "ready"
        leader = next((arm for arm in arms if arm["id"] == winner), None)
        verdict = f"{leader['name']} 当前领先；建议增加一轮席位样本验证稳定性。"

    metric_keys = (
        "score", "vote_accuracy", "skill_value_rate", "speech_repeat_rate",
        "stance_reversal_rate", "identity_leak_rate", "wolf_coordination",
        "effective_decision_rate", "tokens_per_effective_decision",
    )
    deltas = {}
    if len(arms) == 2:
        for key in metric_keys:
            left = arms[0]["behavior"].get(key)
            right = arms[1]["behavior"].get(key)
            deltas[key] = (
                round(float(right) - float(left), 1)
                if left is not None and right is not None else None
            )
        deltas["balanced_win_rate"] = round(
            arms[1]["balanced_win_rate"] - arms[0]["balanced_win_rate"], 1,
        )

    return {
        "status": report_status,
        "winner": winner,
        "verdict": verdict,
        "score_delta": delta,
        "completed_pairs": completed_pairs,
        "pair_count": pair_count,
        "complete_rotation": complete_rotation,
        "arms": arms,
        "deltas": deltas,
        "methodology": (
            "仅纳入已完成的镜像配对；A/B 在同一模型、性格、身份、席位和种子上互换。"
            "综合分权重为平衡胜率 25、投票 15、技能 15、连贯性 15、身份隔离 10、"
            "狼队协作 15、决策效率 5；无样本项不计并按现有权重归一。"
            "重复、立场反复与身份泄露为启发式文本指标。"
        ),
    }


def _aggregate_performance_stats(
    records: List[Dict],
    faction: Optional[str] = None,
    role: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """按模型与性格聚合已完成对局；仅使用持久化事实，不调用模型。"""
    model_buckets: Dict[str, Dict[str, Any]] = {}
    personality_buckets: Dict[str, Dict[str, Any]] = {}
    wolf_roles = {"werewolf", "white_wolf_king", "wolf_king", "wolf_beauty"}
    known_roles = {known_role.value for known_role in Role}

    def add(
        buckets: Dict[str, Dict[str, Any]],
        key: str,
        label: str,
        game_id: str,
        won: bool,
        metrics: Dict[str, Any],
        detail: Optional[Dict[str, Any]] = None,
        dimensions: Optional[Tuple[str, str, str]] = None,
        behavior: Optional[Dict[str, Any]] = None,
    ) -> None:
        bucket = buckets.setdefault(key, {
            "id": key,
            "label": label,
            "appearances": 0,
            "wins": 0,
            "calls": 0,
            "tokens": 0,
            "fallbacks": 0,
            "_games": set(),
            "_segments": {},
            "_behavior": empty_behavior_counters(),
            "_behavior_samples": 0,
            **(detail or {}),
        })
        bucket["appearances"] += 1
        bucket["wins"] += int(won)
        bucket["calls"] += int(metrics.get("calls", 0))
        bucket["tokens"] += int(metrics.get("tokens", 0))
        bucket["fallbacks"] += int(metrics.get("fallbacks", 0))
        bucket["_games"].add(game_id)
        merge_behavior_counters(bucket["_behavior"], behavior)
        bucket["_behavior_samples"] += int(bool(behavior))
        if dimensions:
            segment = bucket["_segments"].setdefault(dimensions, {
                "board_id": dimensions[0],
                "faction": dimensions[1],
                "role": dimensions[2],
                "appearances": 0,
                "wins": 0,
            })
            segment["appearances"] += 1
            segment["wins"] += int(won)

    for record in records:
        if record.get("status") != "completed":
            continue
        game_id = record.get("game_id", "unknown")
        winner = record.get("winner")
        roles = record.get("role_assignment", {})
        by_player = record.get("llm_metrics", {}).get("by_player", {})
        configs = {
            item.get("player_id"): item
            for item in record.get("replay_config", {}).get("players", [])
            if item.get("player_id")
        }
        personalities = record.get("personality_assignment", {})
        behavior_by_player = record.get("behavior_report", {}).get("players", {})
        player_tokens = record.get("player_tokens", {})

        for player_id, config in configs.items():
            assigned_role = roles.get(player_id)
            if assigned_role not in known_roles:
                continue
            player_faction = "werewolf" if assigned_role in wolf_roles else "good"
            if faction and player_faction != faction:
                continue
            if role and assigned_role != role:
                continue
            won = winner in {"good", "werewolf"} and winner == player_faction
            metrics = dict(by_player.get(player_id, {}))
            metrics["tokens"] = max(
                int(metrics.get("tokens", 0)), int(player_tokens.get(player_id, 0)),
            )
            provider = config.get("provider") or "custom"
            model = config.get("model", "unknown")
            model_key = ":".join((
                provider,
                str(config.get("api_format") or "managed"),
                model,
                str(config.get("base_url") or ""),
            ))
            add(
                model_buckets,
                model_key,
                f"{provider} · {model}",
                game_id,
                won,
                metrics,
                {"provider": provider, "model": model},
                (
                    record.get("board_id") or "unknown",
                    player_faction,
                    assigned_role or "unknown",
                ),
                behavior_by_player.get(player_id),
            )

            personality = config.get("personality") or personalities.get(player_id)
            if personality:
                personality_key = json.dumps(personality, ensure_ascii=False, sort_keys=True)
                add(
                    personality_buckets,
                    personality_key,
                    personality.get("name", "未命名性格"),
                    game_id,
                    won,
                    metrics,
                    {
                        "tone": personality.get("tone"),
                        "reasoning_style": personality.get("reasoning_style"),
                    },
                    (
                        record.get("board_id") or "unknown",
                        player_faction,
                        assigned_role or "unknown",
                    ),
                    behavior_by_player.get(player_id),
                )

    def finalize(buckets: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = []
        for bucket in buckets.values():
            appearances = bucket["appearances"]
            calls = bucket["calls"]
            segments = []
            for segment in bucket["_segments"].values():
                segment_appearances = segment["appearances"]
                segments.append({
                    **segment,
                    "win_rate": round(
                        segment["wins"] / segment_appearances * 100, 1
                    ) if segment_appearances else 0,
                })
            segments.sort(key=lambda item: (
                item["board_id"], item["faction"], item["role"]
            ))
            balanced_win_rate = round(
                sum(segment["win_rate"] for segment in segments) / len(segments), 1
            ) if segments else 0
            rows.append({
                **{
                    key: value for key, value in bucket.items()
                    if key not in {"_games", "_segments", "_behavior", "_behavior_samples"}
                },
                "games": len(bucket["_games"]),
                "win_rate": round(bucket["wins"] / appearances * 100, 1) if appearances else 0,
                "balanced_win_rate": balanced_win_rate,
                "segments": segments,
                "fallback_rate": round(bucket["fallbacks"] / calls * 100, 1) if calls else 0,
                "behavior": summarize_behavior(
                    bucket["_behavior"],
                    tokens=bucket["tokens"],
                    balanced_win_rate=(
                        balanced_win_rate if bucket["_behavior_samples"] else None
                    ),
                ),
            })
        rows.sort(key=lambda item: (-item["appearances"], -item["win_rate"], item["label"]))
        return rows

    return finalize(model_buckets), finalize(personality_buckets)


def _compact_review_event(event: Dict, event_index: int) -> Dict:
    """去掉传输元数据并限制单段文本，保留完整事件顺序。"""
    def compact(value):
        if isinstance(value, str):
            return value[:500]
        if isinstance(value, list):
            return [compact(item) for item in value]
        if isinstance(value, dict):
            return {key: compact(item) for key, item in value.items()}
        return value

    return {
        "event_index": event_index,
        "type": event.get("event_type", "unknown"),
        "data": compact(event.get("data", {})),
    }


def _event_round(events: List[Dict], target_index: int) -> int:
    """返回指定事件所属轮次；兼容缺少 round 的早期存档。"""
    current_round = 1
    for index, event in enumerate(events):
        raw_round = event.get("data", {}).get("round")
        if isinstance(raw_round, int) and raw_round >= 0:
            current_round = raw_round
        if index == target_index:
            return current_round
    return current_round


def _build_match_facts(
    events: List[Dict],
    role_assignment: Dict[str, str],
    winner: Optional[str] = None,
) -> Dict[str, Any]:
    """从事件流生成无模型参与、可复核的赛后事实。"""
    wolf_roles = {"werewolf", "white_wolf_king", "wolf_king", "wolf_beauty"}
    players: Dict[str, Dict[str, Any]] = {}
    for player_id, role in role_assignment.items():
        players[player_id] = {
            "role": role,
            "faction": "werewolf" if role in wolf_roles else "good",
            "survived": True,
            "death": None,
            "speech_count": 0,
            "claims": [],
            "day_votes": {
                "cast": 0,
                "abstained": 0,
                "targets_werewolf": 0,
                "targets_good": 0,
            },
            "sheriff_votes": {"cast": 0, "abstained": 0},
            "skill_actions": [],
            "wolf_chat_messages": 0,
        }

    deaths: List[Dict[str, Any]] = []
    vote_rounds: List[Dict[str, Any]] = []
    key_events: List[Dict[str, Any]] = []
    skill_actors = {
        "werewolf_kill": "killer",
        "seer_investigate": "seer",
        "guard_action": "guard",
        "guard_pass": "guard",
        "witch_heal": "witch",
        "witch_poison": "witch",
        "wolf_beauty_charm": "wolf_beauty",
        "knight_duel": "knight",
        "wolf_self_destruct": "player",
        "white_wolf_king_self_destruct": "player",
    }
    key_event_types = {
        *skill_actors,
        "player_death",
        "vote_result",
        "sheriff_election_result",
        "badge_transferred",
        "badge_destroyed",
        "wolf_beauty_charm_triggered",
        "game_end",
    }

    current_round = 1
    for event_index, event in enumerate(events):
        event_type = event.get("event_type", "unknown")
        data = event.get("data", {})
        raw_round = data.get("round")
        if isinstance(raw_round, int) and raw_round >= 0:
            current_round = raw_round
        round_number = current_round

        if event_type == "player_speech":
            player = players.get(data.get("speaker"))
            if player:
                player["speech_count"] += 1
                claim = data.get("claim_role")
                if claim and claim != "none":
                    player["claims"].append({
                        "role": claim,
                        "round": round_number,
                        "event_index": event_index,
                    })
        elif event_type == "wolf_discussion":
            player = players.get(data.get("speaker"))
            if player:
                player["wolf_chat_messages"] += 1
        elif event_type in {"player_vote", "sheriff_vote"}:
            player = players.get(data.get("voter"))
            if player:
                if event_type == "sheriff_vote":
                    player["sheriff_votes"]["cast"] += 1
                else:
                    player["day_votes"]["cast"] += 1
                    target_role = role_assignment.get(data.get("target"))
                    if target_role is not None:
                        target_faction = (
                            "werewolf" if target_role in wolf_roles else "good"
                        )
                        player["day_votes"][f"targets_{target_faction}"] += 1
        elif event_type in {"player_abstain", "sheriff_abstain"}:
            player = players.get(data.get("voter"))
            if player:
                bucket = "sheriff_votes" if event_type == "sheriff_abstain" else "day_votes"
                player[bucket]["abstained"] += 1
        elif event_type == "player_death":
            player_id = data.get("player")
            death = {
                "player_id": player_id,
                "cause": data.get("cause", "unknown"),
                "round": round_number,
                "event_index": event_index,
            }
            deaths.append(death)
            if player_id in players:
                players[player_id]["survived"] = False
                players[player_id]["death"] = death
        elif event_type in {"vote_result", "sheriff_election_result"}:
            vote_rounds.append({
                "event_index": event_index,
                "round": round_number,
                "phase": data.get("phase"),
                "kind": "sheriff" if event_type == "sheriff_election_result" else "exile",
                "result": data.get("result"),
                "vote_detail": data.get("vote_detail", {}),
                "eliminated": data.get("eliminated"),
                "sheriff": data.get("sheriff"),
                "candidates": data.get("candidates", []),
            })

        actor_key = skill_actors.get(event_type)
        if actor_key:
            actor = data.get(actor_key)
            if actor in players:
                action_fact = {
                    "type": event_type,
                    "event_index": event_index,
                    "round": round_number,
                }
                for field in ("target", "result", "phase"):
                    if field in data:
                        action_fact[field] = data[field]
                players[actor]["skill_actions"].append(action_fact)

        if event_type in key_event_types:
            actor = data.get(skill_actors.get(event_type, ""))
            key_events.append({
                "event_index": event_index,
                "round": round_number,
                "event_type": event_type,
                "actor": actor,
                "target": data.get("target") or data.get("player") or data.get("eliminated"),
                "result": data.get("result") or data.get("cause") or data.get("winner"),
            })

    recorded_winner = winner
    if not recorded_winner:
        game_end = next(
            (event for event in reversed(events) if event.get("event_type") == "game_end"),
            None,
        )
        recorded_winner = game_end.get("data", {}).get("winner") if game_end else None

    return {
        "schema_version": 1,
        "event_count": len(events),
        "winner": recorded_winner,
        "players": players,
        "deaths": deaths,
        "vote_rounds": vote_rounds,
        "key_events": key_events,
    }
