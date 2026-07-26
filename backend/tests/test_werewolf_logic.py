import asyncio

from app.core.agent import AIAgent
from app.core.models import ActionType, GameAction, GamePhase, Role
from app.core.orchestrator import GameOrchestrator
from app.core.werewolf import BOARD_PRESETS, WerewolfGame


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


def test_board_presets_have_expected_compositions():
    expected = {
        "5p": 5,
        "9p": 9,
        "12p_idiot": 12,
        "12p_white_wolf_guard": 12,
        "12p_wolf_king_guard": 12,
    }
    for board_id, count in expected.items():
        roles = BOARD_PRESETS[board_id]["roles"]
        assert len(roles) == count
    assert BOARD_PRESETS["9p"]["roles"].count(Role.WEREWOLF) == 3
    assert Role.IDIOT in BOARD_PRESETS["12p_idiot"]["roles"]
    assert Role.WHITE_WOLF_KING in BOARD_PRESETS["12p_white_wolf_guard"]["roles"]
    assert Role.WOLF_KING in BOARD_PRESETS["12p_wolf_king_guard"]["roles"]


def test_werewolf_may_target_self_or_teammate():
    players = [f"AI-{i}" for i in range(1, 10)]
    game = WerewolfGame()
    game.initialize(players, {"game_id": "self-kill", "board_id": "9p", "seed": 4})
    wolves = [
        pid for pid, player in game.state.players.items()
        if player.role == Role.WEREWOLF
    ]
    actions = game.get_available_actions(wolves[0])
    kill = next(action for action in actions if action["action_type"] == "kill")
    assert wolves[0] in kill["valid_targets"]
    assert wolves[1] in kill["valid_targets"]


def test_wolf_discussion_is_shared_only_with_wolf_team():
    players = [f"AI-{i}" for i in range(1, 10)]
    game = WerewolfGame()
    game.initialize(players, {"game_id": "wolf-chat", "board_id": "9p", "seed": 5})
    wolves = [
        pid for pid, player in game.state.players.items()
        if player.role == Role.WEREWOLF
    ]
    good = next(pid for pid in players if pid not in wolves)
    game.night_stage = "wolf_discussion"
    game.apply_action(GameAction(
        ActionType.WOLF_SPEAK,
        wolves[0],
        parameters={"content": f"建议刀{good}", "reasoning": "疑似神职"},
    ))

    teammate_view = game.get_visible_state(wolves[1])
    good_view = game.get_visible_state(good)
    assert teammate_view["werewolf_discussion"] == [
        {"speaker": wolves[0], "content": f"建议刀{good}"}
    ]
    assert "werewolf_discussion" not in good_view
    assert all(
        event["event_type"] != "wolf_discussion"
        for event in good_view["public_events"]
    )


def test_guard_and_witch_heal_same_target_still_dies():
    players = [f"AI-{i}" for i in range(1, 13)]
    game = WerewolfGame()
    game.initialize(players, {
        "game_id": "guard-heal",
        "board_id": "12p_white_wolf_guard",
        "seed": 1,
    })
    target = players[0]
    game.last_night_kill = target
    game.guarded_target = target
    game.witch_healed = True
    game.advance_phase()
    assert target in game.state.dead_players


def test_idiot_survives_vote_but_loses_vote_right():
    players = [f"AI-{i}" for i in range(1, 13)]
    game = WerewolfGame()
    game.initialize(players, {
        "game_id": "idiot",
        "board_id": "12p_idiot",
        "seed": 2,
    })
    idiot = next(pid for pid, p in game.state.players.items() if p.role == Role.IDIOT)
    voter = next(pid for pid in players if pid != idiot)
    game.current_votes = {voter: idiot}
    result = game._process_votes()
    assert result["data"]["result"] == "idiot_revealed"
    assert game.state.players[idiot].is_alive
    assert not game.state.players[idiot].can_vote


def test_hunter_poisoned_cannot_shoot_but_night_killed_can():
    game = make_game()
    hunter = PLAYERS[0]
    game.state.players[hunter].role = Role.HUNTER
    game._kill_player(hunter, "poison")
    assert game.pending_death_skills == []

    other = PLAYERS[1]
    game.state.players[other].role = Role.HUNTER
    game._kill_player(other, "werewolf_kill")
    assert game.pending_death_skills == [other]


def test_gun_and_function_kill_triggers_match_online_rules():
    game = make_game()
    hunter, wolf_king = PLAYERS[:2]
    game.state.players[hunter].role = Role.HUNTER
    game.state.players[wolf_king].role = Role.WOLF_KING

    game._kill_player(hunter, "white_wolf_king")
    assert hunter not in game.pending_death_skills

    game._kill_player(wolf_king, "hunter_shot")
    assert game.pending_death_skills == [wolf_king]


def test_night_death_cause_is_hidden_from_player_view():
    game = make_game()
    target = next(
        pid for pid, player in game.state.players.items()
        if player.role != Role.WEREWOLF
    )
    viewer = next(pid for pid in PLAYERS if pid != target)
    game.last_night_kill = target
    game.advance_phase()

    raw_death = next(
        event for event in game.state.events
        if event.event_type == "player_death"
    )
    visible_death = next(
        event for event in game.get_visible_state(viewer)["public_events"]
        if event["event_type"] == "player_death"
    )
    assert raw_death.data["cause"] == "werewolf_kill"
    assert visible_death["data"]["cause"] == "night_death"


def test_ordinary_wolf_can_self_destruct_without_target():
    players = [f"AI-{i}" for i in range(1, 10)]
    game = WerewolfGame()
    game.initialize(players, {"game_id": "wolf-boom", "board_id": "9p", "seed": 6})
    wolf = next(pid for pid, p in game.state.players.items() if p.role == Role.WEREWOLF)
    game.state.phase = GamePhase.DAY
    game.acted_players = set()
    action_spec = next(
        action for action in game.get_available_actions(wolf)
        if action["action_type"] == "self_destruct"
    )
    assert not action_spec["target_required"]
    game.apply_action(GameAction(
        ActionType.SELF_DESTRUCT, wolf, parameters={"reasoning": "吞掉白天轮次"}
    ))
    assert game.day_interrupted
    assert wolf in game.state.dead_players


def test_last_wolf_king_shooting_last_god_wins_by_edge():
    players = [f"AI-{i}" for i in range(1, 10)]
    game = WerewolfGame()
    game.initialize(players, {"game_id": "priority", "board_id": "9p", "seed": 7})
    wolf_king, last_god = players[:2]
    for player in game.state.players.values():
        player.role = Role.VILLAGER
        player.is_alive = True
    game.state.players[wolf_king].role = Role.WOLF_KING
    game.state.players[last_god].role = Role.SEER
    game.state.alive_players = list(players)
    game.state.dead_players = []

    game._kill_player(wolf_king, "voted_out")
    game.state.phase = GamePhase.VOTING
    game.resume_phase = GamePhase.NIGHT
    game._start_next_death_skill_or_resume([])
    game.apply_action(GameAction(
        ActionType.SHOOT, wolf_king, last_god, {"reasoning": "带走最后一神"}
    ))

    result = game.check_win_condition()
    assert result and result.winner == "werewolf"
    assert result.reason == "wolf_skill_completed_edge"


class ScriptedDayAgent:
    def __init__(self, agent_id):
        self.agent_id = agent_id

    async def decide(self, _state, actions):
        self_destruct = next(
            (action for action in actions if action["action_type"] == "self_destruct"),
            None,
        )
        if self_destruct:
            return GameAction(
                ActionType.SELF_DESTRUCT,
                self.agent_id,
                (self_destruct.get("valid_targets") or [None])[0],
                {"reasoning": "立即打断"},
            )
        return GameAction(
            ActionType.SPEAK,
            self.agent_id,
            parameters={"content": "测试发言", "claim_role": "none"},
        )

    def update_memory(self, _event):
        pass


def test_white_wolf_king_can_interrupt_another_players_speech():
    players = [f"AI-{i}" for i in range(1, 13)]
    game = WerewolfGame()
    game.initialize(players, {
        "game_id": "interrupt",
        "board_id": "12p_white_wolf_guard",
        "seed": 8,
    })
    white_wolf = next(
        pid for pid, p in game.state.players.items()
        if p.role == Role.WHITE_WOLF_KING
    )
    first_good = next(
        pid for pid, p in game.state.players.items()
        if p.role not in {Role.WEREWOLF, Role.WHITE_WOLF_KING, Role.WOLF_KING}
    )
    game.state.alive_players.remove(first_good)
    game.state.alive_players.insert(0, first_good)
    game.state.phase = GamePhase.DAY
    game.acted_players = set()

    orchestrator = GameOrchestrator("interrupt", {})
    orchestrator.game = game
    orchestrator.agents = {
        player_id: ScriptedDayAgent(player_id)
        for player_id in players
    }
    asyncio.run(orchestrator.execute_day_phase())

    assert game.state.speeches[0]["speaker"] == first_good
    assert white_wolf in game.state.dead_players
    assert game.day_interrupted


def test_white_wolf_king_self_destruct_skips_vote_and_enters_night():
    players = [f"AI-{i}" for i in range(1, 13)]
    game = WerewolfGame()
    game.initialize(players, {
        "game_id": "white-wolf",
        "board_id": "12p_white_wolf_guard",
        "seed": 3,
    })
    king = next(
        pid for pid, p in game.state.players.items()
        if p.role == Role.WHITE_WOLF_KING
    )
    target = next(
        pid for pid, p in game.state.players.items()
        if p.role == Role.VILLAGER
    )
    game.state.phase = GamePhase.DAY
    game.apply_action(GameAction(
        ActionType.SELF_DESTRUCT, king, target, {"reasoning": "带走好人"}
    ))
    game.advance_phase()
    assert king in game.state.dead_players
    assert target in game.state.dead_players
    assert game.state.phase == GamePhase.NIGHT
    assert game.state.round == 2
