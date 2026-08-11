import asyncio

import pytest
from pydantic import ValidationError

import app.api.game_manager as game_manager_module
from app.api.game_manager import GameManager
from app.api.routes import router
from app.api.schemas import CreateSeriesRequest


def _players(count=5):
    return [
        {
            "player_id": f"AI-{index}",
            "provider": "demo",
            "model": f"model-{index}",
        }
        for index in range(1, count + 1)
    ]


def test_series_rotates_every_config_through_every_seat(tmp_path, monkeypatch):
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", tmp_path / "games.json")

    async def scenario():
        manager = GameManager()

        async def finish(game_id):
            await manager._update_status(
                game_id,
                status="completed",
                completed_at="now",
                winner="good",
                player_tokens={"AI-1": 10},
                total_cost=0.01,
            )

        manager._run_game_safe = finish
        created = await manager.create_series(
            _players(), game_count=10, base_seed=42, budget_tier="economy"
        )
        task = manager._series_tasks[created["series_id"]]
        await task

        result = manager.get_series(created["series_id"])
        records = sorted(
            manager._load_all(), key=lambda item: item["series_game_number"]
        )
        assert result["status"] == "completed"
        assert result["completed_games"] == 10
        assert [record["seed"] for record in records] == [42] * 5 + [43] * 5

        seats_by_model = {f"model-{index}": set() for index in range(1, 6)}
        for record in records[:5]:
            for config in record["replay_config"]["players"]:
                seats_by_model[config["model"]].add(config["player_id"])
        expected_seats = {f"AI-{index}" for index in range(1, 6)}
        assert all(seats == expected_seats for seats in seats_by_model.values())

    asyncio.run(scenario())


def test_series_budget_caps_next_game_and_stops_after_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", tmp_path / "games.json")

    async def scenario():
        manager = GameManager()

        async def finish(game_id):
            record = manager._load_record(game_id)
            token_cap = record["budget_profile"]["game_token_budget"]
            await manager._update_status(
                game_id,
                status="completed",
                completed_at="now",
                winner="good",
                player_tokens={"AI-1": min(60, token_cap)},
            )

        manager._run_game_safe = finish
        created = await manager.create_series(
            _players(), game_count=5, base_seed=9, max_total_tokens=100
        )
        task = manager._series_tasks[created["series_id"]]
        await task

        result = manager.get_series(created["series_id"])
        records = sorted(
            manager._load_all(), key=lambda item: item["series_game_number"]
        )
        assert result["status"] == "stopped"
        assert result["stopped"] is True
        assert result["total_tokens"] == 100
        assert len(records) == 2
        assert records[0]["budget_profile"]["game_token_budget"] == 100
        assert records[1]["budget_profile"]["game_token_budget"] == 40
        assert "Token 上限" in result["reason"]

    asyncio.run(scenario())


def test_stopping_series_cancels_current_game(tmp_path, monkeypatch):
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", tmp_path / "games.json")

    async def scenario():
        manager = GameManager()
        started = asyncio.Event()

        async def wait_forever(_game_id):
            started.set()
            await asyncio.Event().wait()

        manager._run_game_safe = wait_forever
        created = await manager.create_series(_players(), game_count=5, base_seed=3)
        await started.wait()
        stopped = await manager.stop_series(created["series_id"])
        await asyncio.sleep(0)

        record = manager._load_all()[0]
        assert stopped["status"] == "stopped"
        assert stopped["stopped"] is True
        assert len(stopped["games"]) == 1
        assert record["status"] == "error"
        assert record["reason"] == "系列赛已由用户停止"

    asyncio.run(scenario())


def test_stats_support_role_filter_and_fair_segments():
    records = [
        {
            "game_id": "g1",
            "status": "completed",
            "board_id": "5p",
            "winner": "good",
            "role_assignment": {"AI-1": "seer", "AI-2": "werewolf"},
            "replay_config": {"players": [
                {"player_id": "AI-1", "provider": "demo", "model": "same"},
                {"player_id": "AI-2", "provider": "demo", "model": "same"},
            ]},
            "llm_metrics": {"by_player": {}},
        },
        {
            "game_id": "g2",
            "status": "completed",
            "board_id": "9p",
            "winner": "werewolf",
            "role_assignment": {"AI-1": "villager"},
            "replay_config": {"players": [
                {"player_id": "AI-1", "provider": "demo", "model": "same"},
                {"player_id": "AI-2", "provider": "demo", "model": "same"},
            ]},
            "llm_metrics": {"by_player": {}},
        },
    ]

    all_models, _ = game_manager_module._aggregate_performance_stats(records)
    seer_models, _ = game_manager_module._aggregate_performance_stats(
        records, faction="good", role="seer"
    )

    assert len(all_models[0]["segments"]) == 3
    assert all_models[0]["appearances"] == 3
    assert all_models[0]["balanced_win_rate"] == pytest.approx(33.3)
    assert seer_models[0]["appearances"] == 1
    assert seer_models[0]["segments"][0]["role"] == "seer"
    assert seer_models[0]["win_rate"] == 100.0


def test_series_schema_and_routes_are_unambiguous():
    payload = {
        "player_configs": _players(),
        "game_count": 2,
        "seed": 1,
        "base_seed": 2,
    }
    with pytest.raises(ValidationError, match="只能填写一个"):
        CreateSeriesRequest.model_validate(payload)

    with pytest.raises(ValidationError, match="整轮席位轮换"):
        CreateSeriesRequest.model_validate({
            "player_configs": _players(),
            "game_count": 6,
            "base_seed": 2,
        })

    paths = [route.path for route in router.routes]
    assert paths.index("/series/{series_id}") < paths.index("/{game_id}/status")


def test_replay_of_automated_series_member_is_isolated_and_member_cannot_delete(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", tmp_path / "games.json")

    async def scenario():
        manager = GameManager()

        async def finish(game_id):
            await manager._update_status(
                game_id,
                status="completed",
                completed_at="now",
                winner="good",
                player_tokens={"AI-1": 1},
            )

        manager._run_game_safe = finish
        series = await manager.create_series(
            _players(), game_count=5, base_seed=21, budget_tier="economy"
        )
        await manager._series_tasks[series["series_id"]]
        source = manager.get_series(series["series_id"])["games"][0]["game_id"]

        replay = await manager.create_game(
            _players(),
            board_id="5p",
            seed=22,
            budget_tier="economy",
            parent_game_id=source,
        )

        assert replay["series_id"] == source
        assert replay["series_id"] != series["series_id"]
        assert replay["series_game_number"] == 1
        with pytest.raises(ValueError, match="不能单独删除"):
            await manager.delete_game(source)
        assert manager._load_record(source) is not None

    asyncio.run(scenario())


def test_manager_rejects_partial_seat_rotation(tmp_path, monkeypatch):
    monkeypatch.setattr(game_manager_module, "_STORAGE_PATH", tmp_path / "games.json")

    async def scenario():
        manager = GameManager()
        with pytest.raises(ValueError, match="整轮席位轮换"):
            await manager.create_series(_players(), game_count=6, base_seed=1)
        assert manager._load_all() == []

    asyncio.run(scenario())
