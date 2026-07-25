import asyncio

from app.core.agent import AIAgent
from app.core.models import ActionType, GameAction, GamePhase
from app.core.werewolf import WerewolfGame


PLAYERS = [f"AI-{i}" for i in range(1, 6)]


def make_game():
    game = WerewolfGame()
    game.initialize(PLAYERS, {"game_id": "test", "seed": 7})
    return game


def test_required_target_and_duplicate_action_are_rejected():
    game = make_game()
    wolf = next(pid for pid, player in game.state.players.items() if player.role.value == "werewolf")
    assert not game.is_valid_action(GameAction(ActionType.KILL, wolf, None, {}))
    target = next(pid for pid in PLAYERS if pid != wolf)
    game.apply_action(GameAction(ActionType.KILL, wolf, target, {}))
    assert not game.is_valid_action(GameAction(ActionType.KILL, wolf, target, {}))


def test_tie_break_revote_and_abstain_end_without_elimination():
    game = make_game()
    game.state.phase = GamePhase.VOTING
    game.apply_action(GameAction(ActionType.VOTE, "AI-1", "AI-2", {}))
    game.apply_action(GameAction(ActionType.VOTE, "AI-2", "AI-1", {}))
    for player in PLAYERS[2:]:
        game.apply_action(GameAction(ActionType.ABSTAIN, player, None, {}))
    game.advance_phase()
    assert game.state.phase == GamePhase.TIEBREAK_SPEECH
    assert game.tie_candidates == ["AI-1", "AI-2"]

    for player in game.tie_candidates:
        game.apply_action(GameAction(ActionType.SPEAK, player, parameters={"content": "请听我解释", "claim_role": "none"}))
    game.advance_phase()
    assert game.state.phase == GamePhase.TIEBREAK_VOTING

    game.apply_action(GameAction(ActionType.VOTE, "AI-3", "AI-1", {}))
    game.apply_action(GameAction(ActionType.VOTE, "AI-4", "AI-2", {}))
    game.apply_action(GameAction(ActionType.ABSTAIN, "AI-5", None, {}))
    game.advance_phase()
    assert game.state.phase == GamePhase.NIGHT
    assert game.state.dead_players == []
    assert game.state.round == 2


class FailingClient:
    async def generate(self, **_):
        raise RuntimeError("offline")


def test_agent_retries_then_uses_valid_default_action():
    agent = AIAgent("AI-1", FailingClient())
    action = asyncio.run(agent.decide({}, [{"action_type": "speak", "target_required": False}]))
    assert action.action_type == ActionType.SPEAK
    assert action.parameters["content"]
