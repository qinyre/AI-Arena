import asyncio

import pytest
from pydantic import ValidationError

import app.api.game_manager as game_manager_module
from app.api.game_manager import GameManager
from app.api.routes import router
from app.api.schemas import CreatePromptExperimentRequest
from app.core.agent import AIAgent
from app.core.behavior import build_behavior_report, summarize_behavior
from app.core.quality import build_quality_report


def _players(count=5):
    return [
        {"player_id": f"AI-{index}", "provider": "demo", "model": f"model-{index}"}
        for index in range(1, count + 1)
    ]


def _event(event_type, data, visibility="public", visible_to=None):
    return {
        "event_type": event_type,
        "data": data,
        "visibility": visibility,
        "visible_to": visible_to or [],
    }


def test_behavior_report_keeps_raw_denominators_and_effective_actions():
    roles = {
        "AI-1": "werewolf", "AI-2": "seer", "AI-3": "guard",
        "AI-4": "witch", "AI-5": "villager",
    }
    events = [
        _event("werewolf_kill", {"killer": "AI-1", "target": "AI-5", "round": 1, "phase": "night"}, "private", ["AI-1"]),
        _event("seer_investigate", {"seer": "AI-2", "target": "AI-1", "result": "狼人", "round": 1, "phase": "night"}, "private", ["AI-2"]),
        _event("guard_action", {"guard": "AI-3", "target": "AI-5", "round": 1, "phase": "night"}, "private", ["AI-3"]),
        _event("witch_poison", {"witch": "AI-4", "target": "AI-1", "round": 1, "phase": "night"}, "private", ["AI-4"]),
        _event("player_death", {"player": "AI-1", "cause": "poison", "round": 1}),
        _event("player_speech", {"speaker": "AI-5", "content": "我投 AI-1", "round": 1}),
        _event("player_vote", {"voter": "AI-5", "target": "AI-1", "round": 1}),
    ]
    quality = {"findings": [
        {"code": "repeated-public-speech", "player_id": "AI-5"},
        {"code": "stance-reversal", "player_id": "AI-5"},
        {"code": "identity-leak", "player_id": "AI-1"},
        {"code": "repeated-wolf-chat", "player_id": "AI-1"},
    ]}

    report = build_behavior_report(
        events=events, role_assignment=roles, quality_report=quality,
    )
    assert report["players"]["AI-5"]["vote_hits"] == 1
    assert report["players"]["AI-2"]["skill_hits"] == 1
    assert report["players"]["AI-3"]["skill_hits"] == 1
    assert report["players"]["AI-4"]["skill_hits"] == 1
    assert report["players"]["AI-1"]["wolf_selected_votes"] == 1
    assert report["players"]["AI-1"]["wolf_consensus_votes"] == 0
    assert report["players"]["AI-1"]["identity_leaks"] == 1

    summary = summarize_behavior(report["totals"], tokens=1_000, balanced_win_rate=50)
    assert summary["vote_accuracy"] == 100
    assert summary["skill_value_rate"] == 100
    assert summary["effective_decisions"] == 5
    assert summary["tokens_per_effective_decision"] == 200
    assert summary["wolf_coordination"] is None


def test_quality_flags_first_person_wolf_identity_leak():
    events = [
        _event("game_start", {"round": 1, "phase": "day"}),
        _event("player_speech", {
            "speaker": "AI-1", "content": "我是狼人，今晚我们刀 AI-4。",
            "claim_role": "werewolf", "round": 1, "phase": "day",
        }),
        _event("player_speech", {
            "speaker": "AI-1", "content": "我是狼人杀中的普通玩家。",
            "claim_role": "none", "round": 1, "phase": "day",
        }),
        _event("player_speech", {
            "speaker": "AI-1", "content": "昨晚刀口是你但你没死，这一点需要解释。",
            "claim_role": "none", "round": 1, "phase": "day",
        }),
        _event("player_speech", {
            "speaker": "AI-1", "content": "AI-9无端指控我是狼人，纯属污蔑。",
            "claim_role": "none", "round": 1, "phase": "day",
        }),
        _event("player_speech", {
            "speaker": "AI-1", "content": "AI-9还反咬我们狼队互保，这个逻辑不成立。",
            "claim_role": "none", "round": 1, "phase": "day",
        }),
        _event("game_end", {"winner": "good", "round": 1, "reason": "wolves_eliminated"}),
    ]
    report = build_quality_report(
        events=events,
        role_assignment={"AI-1": "werewolf", "AI-2": "seer"},
        winner="good",
        final_round=1,
    )
    leaks = [item for item in report["findings"] if item.get("code") == "identity-leak"]
    assert len(leaks) == 1
    assert leaks[0]["player_id"] == "AI-1"
    assert leaks[0]["confidence"] == "heuristic"


def test_wolf_coordination_excludes_lone_wolf_nights():
    roles = {"AI-1": "werewolf", "AI-2": "werewolf", "AI-3": "seer", "AI-4": "villager"}
    events = [
        _event("werewolf_kill", {"killer": "AI-1", "target": "AI-3", "round": 1}),
        _event("werewolf_kill", {"killer": "AI-2", "target": "AI-3", "round": 1}),
        _event("werewolf_kill", {"killer": "AI-1", "target": "AI-4", "round": 2}),
    ]
    report = build_behavior_report(events=events, role_assignment=roles)
    summary = summarize_behavior(report["totals"])
    assert report["totals"]["wolf_votes"] == 3
    assert report["totals"]["wolf_team_votes"] == 2
    assert report["totals"]["wolf_consensus_votes"] == 2
    assert summary["wolf_coordination"] == 100


def test_agent_system_prompt_applies_guarded_experiment_increment():
    agent = AIAgent(
        "AI-1",
        object(),
        prompt_variant={
            "id": "B", "name": "证据优先",
            "instructions": "每次改票前引用一条公开事件。",
        },
    )
    prompt = agent._build_system_prompt({
        "your_role": "villager",
        "your_player_id": "AI-1",
        "alive_players": ["AI-1", "AI-2"],
        "dead_players": [],
        "round": 1,
        "phase": "day",
    })
    assert "每次改票前引用一条公开事件" in prompt
    assert "不得覆盖公共硬规则" in prompt
    assert "A/B 实验" not in prompt


def test_prompt_experiment_mirrors_variants_and_reports_behavior(tmp_path, monkeypatch):
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", tmp_path / "games.json")

    async def scenario():
        manager = GameManager()

        async def finish(game_id):
            record = manager._load_record(game_id)
            configs = record["replay_config"]["players"]
            roles = {
                "AI-1": "werewolf", "AI-2": "seer", "AI-3": "villager",
                "AI-4": "villager", "AI-5": "villager",
            }
            behavior_players = {}
            tokens = {}
            by_player = {}
            for config in configs:
                player = config["player_id"]
                is_b = config["prompt_variant"]["id"] == "B"
                behavior_players[player] = {
                    "votes": 1, "vote_hits": int(is_b), "skills": 0,
                    "skill_hits": 0, "speeches": 1,
                    "repeated_speeches": int(not is_b), "stance_reversals": 0,
                    "identity_leaks": 0, "wolf_votes": 0,
                    "wolf_consensus_votes": 0, "wolf_messages": 0,
                    "repeated_wolf_messages": 0,
                }
                tokens[player] = 50 if is_b else 100
                by_player[player] = {"calls": 1, "fallbacks": 0, "tokens": tokens[player]}
            await manager._update_status(
                game_id,
                status="completed",
                completed_at="now",
                winner="good",
                role_assignment=roles,
                behavior_report={"schema_version": 1, "players": behavior_players},
                player_tokens=tokens,
                llm_metrics={"by_player": by_player},
            )

        manager._run_game_safe = finish
        variants = [
            {"id": "A", "name": "基线", "instructions": ""},
            {"id": "B", "name": "证据优先", "instructions": "改票前引用公开证据。"},
        ]
        created = await manager.create_prompt_experiment(
            _players(), variants, pair_count=5, base_seed=42,
        )
        await manager._series_tasks[created["series_id"]]

        result = manager.get_prompt_experiment(created["series_id"])
        records = sorted(manager._load_all(), key=lambda item: item["series_game_number"])
        assert result["status"] == "completed"
        assert result["completed_pairs"] == 5
        assert result["game_count"] == 10
        assert [record["seed"] for record in records] == [42] * 10
        assert result["report"]["winner"] == "B"
        assert result["report"]["arms"][0]["appearances"] == result["report"]["arms"][1]["appearances"]

        for first, second in zip(records[::2], records[1::2]):
            first_variants = {
                item["player_id"]: item["prompt_variant"]["id"]
                for item in first["replay_config"]["players"]
            }
            second_variants = {
                item["player_id"]: item["prompt_variant"]["id"]
                for item in second["replay_config"]["players"]
            }
            assert all(first_variants[player] != second_variants[player] for player in first_variants)

    asyncio.run(scenario())


def test_prompt_experiment_schema_requires_complete_rotation_and_distinct_variants():
    base = {
        "player_configs": _players(),
        "pair_count": 5,
        "base_seed": 7,
        "variants": [
            {"id": "A", "name": "基线", "instructions": ""},
            {"id": "B", "name": "候选", "instructions": "引用公开证据"},
        ],
    }
    assert CreatePromptExperimentRequest.model_validate(base).pair_count == 5
    with pytest.raises(ValidationError, match="整轮席位轮换"):
        CreatePromptExperimentRequest.model_validate({**base, "pair_count": 6})
    with pytest.raises(ValidationError, match="策略增量必须不同"):
        CreatePromptExperimentRequest.model_validate({
            **base,
            "variants": [
                {"id": "A", "name": "基线", "instructions": "same"},
                {"id": "B", "name": "候选", "instructions": "same"},
            ],
        })
    paths = [route.path for route in router.routes]
    assert paths.index("/experiments/{experiment_id}") < paths.index("/{game_id}/status")
