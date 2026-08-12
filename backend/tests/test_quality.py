import asyncio
import json

import app.api.game_manager as game_manager_module
from app.api.game_manager import GameManager
from app.core.quality import build_quality_report


ROLES = {
    "AI-1": "werewolf",
    "AI-2": "seer",
    "AI-3": "guard",
    "AI-4": "villager",
    "AI-5": "villager",
}


def event(event_type, data, visibility="public", visible_to=None):
    return {
        "event_type": event_type,
        "data": data,
        "visibility": visibility,
        "visible_to": visible_to or [],
        "timestamp": "2026-08-12T00:00:00Z",
    }


def clean_events():
    return [
        event(
            "game_start",
            {"players": list(ROLES), "role_assignment": ROLES},
            "private",
            ["admin"],
        ),
        event("phase_change", {"from": "night", "to": "day", "phase": "day", "round": 1}),
        event("phase_change", {"from": "day", "to": "voting", "phase": "voting", "round": 1}),
        event("player_vote", {"voter": "AI-2", "target": "AI-1", "phase": "voting", "round": 1}),
        event("vote_result", {
            "result": "eliminated",
            "eliminated": "AI-1",
            "vote_detail": {"AI-2": "AI-1"},
            "phase": "voting",
            "round": 1,
        }),
        event("player_death", {"player": "AI-1", "cause": "voted_out", "round": 1}),
        event("phase_change", {"from": "voting", "to": "last_words", "phase": "last_words", "round": 1}),
        event("player_speech", {
            "speaker": "AI-1",
            "content": "我留下最后的判断。",
            "claim_role": "villager",
            "last_words": True,
            "phase": "last_words",
            "round": 1,
        }),
        event("game_end", {
            "winner": "good",
            "reason": "all_werewolves_eliminated",
            "final_round": 1,
        }),
    ]


def test_quality_report_passes_clean_game_and_legacy_result_is_generated(tmp_path, monkeypatch):
    report = build_quality_report(
        events=clean_events(),
        role_assignment=ROLES,
        winner="good",
        final_round=1,
        budget_profile={"game_token_budget": 1000, "player_token_budget": 500},
        max_rounds=20,
    )
    assert report["status"] == "passed"
    assert report["score"] == 100
    assert report["summary"]["checks_passed"] == 6

    storage = tmp_path / "games.json"
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", storage)
    storage.write_text(json.dumps([{
        "game_id": "legacy-quality",
        "status": "completed",
        "created_at": "2026-08-12T00:00:00Z",
        "winner": "good",
        "final_round": 1,
        "reason": "all_werewolves_eliminated",
        "role_assignment": ROLES,
        "board_id": "5p",
        "max_rounds": 20,
        "budget_profile": {"game_token_budget": 1000, "player_token_budget": 500},
    }]), encoding="utf-8")
    (tmp_path / "legacy-quality_events.json").write_text(
        json.dumps(clean_events()), encoding="utf-8",
    )

    manager = GameManager()
    assert asyncio.run(manager.reconcile_interrupted_games()) == 0
    result = manager.get_result("legacy-quality")
    assert result["quality_report"]["status"] == "passed"
    listed = manager.list_games()["games"][0]
    assert listed["quality_status"] == "passed"
    assert listed["quality_score"] == 100


def test_quality_report_detects_linked_rule_privacy_flow_and_model_failures():
    broken = [
        event("game_start", {"players": list(ROLES), "role_assignment": ROLES}),
        event(
            "seer_investigate",
            {"seer": "AI-4", "target": "AI-5", "phase": "night", "round": 1},
            "private",
            ["AI-4"],
        ),
        event(
            "wolf_discussion",
            {"speaker": "AI-1", "content": "今晚建议刀AI-5，他可能是神职。", "phase": "night", "round": 1},
            "private",
            ["AI-1"],
        ),
        event(
            "wolf_discussion",
            {"speaker": "AI-1", "content": "同意刀AI-5，他可能是神职。", "phase": "night", "round": 1},
            "private",
            ["AI-1"],
        ),
        event("player_death", {"player": "AI-2", "cause": "werewolf_kill", "round": 1}),
        event("player_speech", {
            "speaker": "AI-4", "content": "先观察。", "claim_role": "none",
            "suspects": [], "phase": "day", "round": 1,
        }),
        event("player_speech", {
            "speaker": "AI-4", "content": "继续观察。", "claim_role": "none",
            "suspects": [], "phase": "day", "round": 1,
        }),
        event("player_vote", {"voter": "AI-2", "target": "AI-1", "phase": "voting", "round": 1}),
        event(
            "agent_fallback",
            {"player": "AI-4", "message": "模型响应不是有效 JSON", "round": 1, "phase": "day"},
            "private",
            ["admin"],
        ),
        event("phase_change", {"from": "voting", "to": "night", "phase": "night", "round": 2}),
        event("game_end", {"winner": "good", "reason": "all_werewolves_eliminated", "final_round": 1}),
    ]
    report = build_quality_report(
        events=broken,
        role_assignment=ROLES,
        winner="good",
        final_round=1,
        llm_metrics={
            "total_calls": 10,
            "fallback_calls": 3,
            "repaired_json_calls": 0,
            "average_latency_ms": 16000,
            "calls": [{"failure_reason": "模型响应不是有效 JSON"}],
        },
        player_tokens={"AI-4": 110},
        budget_profile={"game_token_budget": 100, "player_token_budget": 100},
        personality_assignment={
            "AI-4": {"verbosity": 5, "assertiveness": 5},
        },
        max_rounds=1,
    )

    codes = {finding["id"].rsplit("-", 1)[0] for finding in report["findings"]}
    assert report["status"] == "failed"
    assert report["summary"]["error"] >= 5
    assert any("role-action" in code for code in codes)
    assert any("private-event-public" in code for code in codes)
    assert any("dead-action" in code for code in codes)
    assert any("phantom-round" in code for code in codes)
    assert any("missing-last-words" in code for code in codes)
    assert any("repeated-wolf-chat" in code for code in codes)
    assert any("invalid-output" in code for code in codes)
    assert all(
        finding.get("event_index", 0) >= 0 for finding in report["findings"]
    )
