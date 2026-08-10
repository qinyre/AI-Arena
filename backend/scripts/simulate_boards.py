"""零 API 调用批量模拟所有板型，并检查核心规则不变量。"""
import argparse
import asyncio
import io
import random
from collections import Counter
from contextlib import redirect_stdout

from app.core.models import ActionType, GameAction, GamePhase, Role
from app.core.orchestrator import GameOrchestrator
from app.core.werewolf import BOARD_PRESETS, WOLF_ROLES, WerewolfGame


class RandomAgent:
    """只从规则引擎给出的合法动作中做可复现选择。"""

    def __init__(self, agent_id: str, seed: int):
        self.agent_id = agent_id
        self.rng = random.Random(seed)

    async def decide(self, _visible_state: dict, actions: list[dict]) -> GameAction:
        weights = [
            0.05 if action["action_type"] == "self_destruct"
            else 0.25 if action["action_type"] in {"pass", "abstain"}
            else 1.0
            for action in actions
        ]
        spec = self.rng.choices(actions, weights=weights, k=1)[0]
        action_type = ActionType(spec["action_type"])
        target = (
            self.rng.choice(spec["valid_targets"])
            if spec.get("target_required")
            else None
        )
        parameters = {"reasoning": "自动模拟"}
        if action_type in {ActionType.SPEAK, ActionType.WOLF_SPEAK}:
            parameters["content"] = "自动模拟发言"
        if action_type == ActionType.SPEAK:
            parameters["claim_role"] = "none"
            if "withdraw_after_speech" in spec.get("parameters", {}):
                parameters["withdraw_after_speech"] = self.rng.random() < 0.2
        return GameAction(action_type, self.agent_id, target, parameters)

    def update_memory(self, _event: dict) -> None:
        pass


class AuditOrchestrator(GameOrchestrator):
    """把编排器原本的容错降级为测试失败，并检测阶段停滞。"""

    def __init__(self, game_id: str, config: dict):
        super().__init__(game_id, config)
        self.action_log = []

    async def _agent_act(self, agent, visible_state, available_actions):
        action = await super()._agent_act(agent, visible_state, available_actions)
        if action is None:
            raise AssertionError(f"{agent.agent_id} 动作执行失败")
        self.action_log.append((
            self.game.state.round,
            self.game.state.phase,
            self.game.night_stage,
            action.actor_id,
            action.action_type,
        ))
        return action

    async def execute_round(self):
        state = self.game.state
        before = (
            state.phase,
            state.round,
            tuple(state.alive_players),
            self.game.death_skill_actor,
            self.game.badge_transfer_actor,
            tuple(self.game.pending_death_skills),
            self.game.last_words_actor,
            tuple(self.game.pending_last_words),
        )
        await super().execute_round()
        state = self.game.state
        after = (
            state.phase,
            state.round,
            tuple(state.alive_players),
            self.game.death_skill_actor,
            self.game.badge_transfer_actor,
            tuple(self.game.pending_death_skills),
            self.game.last_words_actor,
            tuple(self.game.pending_last_words),
        )
        if before == after and not self.game.is_ended():
            raise AssertionError(
                f"阶段停滞: round={state.round}, phase={state.phase.value}"
            )


def assert_invariants(
    game: WerewolfGame,
    result: dict,
    action_log: list[tuple],
) -> None:
    """检查死亡、技能、警徽、终局和玩家状态。"""
    state = game.state
    players = set(state.players)
    alive = set(state.alive_players)
    dead = set(state.dead_players)
    assert not alive & dead, "存活与死亡名单重叠"
    assert alive | dead == players, "玩家未完整落入存活或死亡名单"
    assert all(state.players[player].is_alive == (player in alive) for player in players)
    assert state.phase == GamePhase.ENDED, "对局未进入 ended"

    events = [event.to_dict() for event in state.events]
    assert sum(event["event_type"] == "game_start" for event in events) == 1
    assert sum(event["event_type"] == "game_end" for event in events) == 1

    role_counts = Counter(player.role for player in state.players.values())
    assert role_counts == Counter(BOARD_PRESETS[game.board_id]["roles"]), "角色构成改变"

    deaths = [
        event["data"]["player"]
        for event in events
        if event["event_type"] == "player_death"
    ]
    assert len(deaths) == len(set(deaths)), "同一玩家出现多次死亡事件"

    unique_night_actions = {
        ActionType.KILL,
        ActionType.WOLF_SPEAK,
        ActionType.INVESTIGATE,
        ActionType.GUARD,
        ActionType.CHARM,
    }
    seen = set()
    for round_number, phase, night_stage, actor, action_type in action_log:
        if phase != GamePhase.NIGHT or action_type not in unique_night_actions:
            continue
        key = (round_number, night_stage, actor, action_type)
        assert key not in seen, f"同轮重复行动: {key}"
        seen.add(key)

    campaign_passes = [
        (event["data"]["round"], event["data"]["player"])
        for event in events
        if event["event_type"] == "sheriff_campaign_pass"
    ]
    assert len(campaign_passes) == len(set(campaign_passes)), "重复记录不上警"

    assert sum(event["event_type"] == "witch_heal" for event in events) <= 1
    assert sum(event["event_type"] == "witch_poison" for event in events) <= 1

    for event in events:
        if event["event_type"] == "sheriff_election_result":
            sheriff = event["data"].get("sheriff")
            assert sheriff is None or sheriff in players, "警长不是本局玩家"
        elif event["event_type"] == "badge_transferred":
            assert event["data"]["to"] in players, "警徽移交目标不是本局玩家"

    assert result["winner"] in {"good", "werewolf", "draw"}
    terminal = game.check_win_condition()
    if result["winner"] == "draw":
        assert result["reason"] == "max_rounds_reached"
    else:
        assert terminal and terminal.winner == result["winner"], "终局胜方与状态不符"
        if result["winner"] == "good":
            assert not any(
                player.is_alive and player.role in WOLF_ROLES
                for player in state.players.values()
            ), "狼人仍存活却判好人胜利"


async def simulate_one(
    board_id: str,
    run: int,
    enable_sheriff: bool,
    seed: int,
    max_rounds: int,
    timeout: float,
    verbose: bool = False,
) -> dict:
    count = len(BOARD_PRESETS[board_id]["roles"])
    game_id = f"sim-{board_id}-{'sheriff' if enable_sheriff else 'plain'}-{run}"
    players = [f"AI-{index}" for index in range(1, count + 1)]
    config = {
        "game_id": game_id,
        "board_id": board_id,
        "players": players,
        "seed": seed,
        "enable_sheriff": enable_sheriff,
        "max_rounds": max_rounds,
    }
    orchestrator = AuditOrchestrator(game_id, config)
    orchestrator.game.initialize(players, config)
    orchestrator.agents = {
        player: RandomAgent(player, seed * 100 + index)
        for index, player in enumerate(players, 1)
    }

    try:
        if verbose:
            result = await asyncio.wait_for(orchestrator.run_game(), timeout)
        else:
            with redirect_stdout(io.StringIO()):
                result = await asyncio.wait_for(orchestrator.run_game(), timeout)
        assert_invariants(orchestrator.game, result, orchestrator.action_log)
        return {
            "game_id": game_id,
            "status": "ok",
            "winner": result["winner"],
            "rounds": result["final_round"],
            "events": len(orchestrator.game.state.events),
        }
    except Exception as exc:
        return {
            "game_id": game_id,
            "status": "error",
            "error": f"{type(exc).__name__}: {exc}",
        }


async def run_suite(
    runs: int = 10,
    max_rounds: int = 30,
    timeout: float = 3.0,
    seed: int = 10_000,
    sheriff_modes: tuple[bool, ...] = (False, True),
    verbose: bool = False,
) -> list[dict]:
    results = []
    for run in range(1, runs + 1):
        for board_index, board_id in enumerate(BOARD_PRESETS):
            for enable_sheriff in sheriff_modes:
                results.append(await simulate_one(
                    board_id=board_id,
                    run=run,
                    enable_sheriff=enable_sheriff,
                    seed=seed + run * len(BOARD_PRESETS) + board_index,
                    max_rounds=max_rounds,
                    timeout=timeout,
                    verbose=verbose,
                ))
    return results


async def main(args) -> None:
    modes = {
        "both": (False, True),
        "on": (True,),
        "off": (False,),
    }[args.sheriff]
    results = await run_suite(
        runs=args.runs,
        max_rounds=args.max_rounds,
        timeout=args.timeout,
        seed=args.seed,
        sheriff_modes=modes,
        verbose=args.verbose,
    )
    failures = [result for result in results if result["status"] == "error"]
    for failure in failures:
        print(f"FAIL {failure['game_id']}: {failure['error']}")
    winners = Counter(result.get("winner") for result in results if result["status"] == "ok")
    print(
        f"模拟完成: {len(results) - len(failures)}/{len(results)} 通过；"
        f"胜方分布 {dict(winners)}；API 调用 0"
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="零 API 调用批量模拟所有狼人杀板型")
    parser.add_argument("--runs", type=int, default=10, help="每种配置运行次数")
    parser.add_argument("--max-rounds", type=int, default=30)
    parser.add_argument("--timeout", type=float, default=3.0, help="单局超时秒数")
    parser.add_argument("--seed", type=int, default=10_000)
    parser.add_argument("--sheriff", choices=("both", "on", "off"), default="both")
    parser.add_argument("--verbose", action="store_true")
    asyncio.run(main(parser.parse_args()))
