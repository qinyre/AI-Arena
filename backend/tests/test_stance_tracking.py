from app.core.agent import AIAgent
from app.core.models import ActionType, GameAction, GameEvent, GamePhase
from app.core.werewolf import WerewolfGame


def make_day_game() -> WerewolfGame:
    game = WerewolfGame()
    game.initialize(
        [f"AI-{index}" for index in range(1, 6)],
        {"game_id": "stance-test", "board_id": "5p", "seed": 17},
    )
    game.state.phase = GamePhase.DAY
    game.acted_players = set()
    game.state.events.append(GameEvent(
        "phase_change",
        {"from": "night", "to": "day", "round": 1},
    ))
    return game


def test_speak_action_exposes_and_normalizes_structured_stance():
    game = make_day_game()
    actor = game.state.alive_players[0]
    actions = game.get_available_actions(actor)
    speak = next(action for action in actions if action["action_type"] == "speak")

    assert {
        "suspects",
        "trusted",
        "intended_vote",
        "role_reads",
        "evidence_event_indexes",
    } <= speak["parameters"].keys()

    other, trusted = game.state.alive_players[1:3]
    parsed = {
        "chosen_action": {
            "action_type": "speak",
            "target": None,
            "parameters": {
                "content": f"我怀疑 {other}，暂时偏信 {trusted}。",
                "claim_role": "none",
                "suspects": [other, other, "AI-99"],
                "trusted": [other, trusted],
                "intended_vote": "abstain",
                "role_reads": {other: "werewolf", "AI-99": "seer"},
                "evidence_event_indexes": [0, 0, 999, True],
            },
        },
        "reasoning": "只把真正公开表达的立场写入结构化字段。",
    }
    action, ok, reason = AIAgent(actor, object())._build_action(parsed, actions)

    assert ok, reason
    assert action.parameters["suspects"] == [other]
    assert action.parameters["trusted"] == [trusted]
    assert action.parameters["intended_vote"] == "abstain"
    assert action.parameters["role_reads"] == {other: "werewolf"}
    assert action.parameters["evidence_event_indexes"] == [0]


def test_public_stance_enters_event_and_long_term_dossier_without_reasoning_leak():
    game = make_day_game()
    actor, suspect, trusted, viewer = game.state.alive_players[:4]
    action = GameAction(
        ActionType.SPEAK,
        actor,
        parameters={
            "content": f"我怀疑 {suspect}，偏信 {trusted}，今天计划投 {suspect}。",
            "claim_role": "none",
            "suspects": [suspect],
            "trusted": [trusted],
            "intended_vote": suspect,
            "role_reads": {suspect: "werewolf", trusted: "good"},
            "evidence_event_indexes": [0],
            "reasoning": "我是内部推理，不得进入其他玩家可见状态。",
        },
    )

    emitted = game.apply_action(action)
    assert emitted[0]["data"]["suspects"] == [suspect]

    visible = game.get_visible_state(viewer)
    speech = next(
        event for event in visible["public_events"]
        if event["event_type"] == "player_speech"
    )
    assert speech["event_index"] == 1
    assert speech["data"]["intended_vote"] == suspect
    assert "reasoning" not in speech["data"]

    stance = visible["public_dossier"]["current_stances"][actor]
    assert stance["event_index"] == 1
    assert stance["suspects"] == [suspect]
    assert stance["trusted"] == [trusted]
    assert stance["role_reads"] == {suspect: "werewolf", trusted: "good"}
    assert "reasoning" not in str(stance)

    game.acted_players.clear()
    game.apply_action(GameAction(
        ActionType.SPEAK,
        actor,
        parameters={
            "content": "目前证据不足，我撤回上一轮的站边。",
            "claim_role": "none",
            "suspects": [],
            "trusted": [],
            "intended_vote": None,
            "role_reads": {},
            "evidence_event_indexes": [],
            "reasoning": "新证据不足。",
        },
    ))
    cleared = game.get_visible_state(viewer)["public_dossier"]["current_stances"][actor]
    assert cleared["suspects"] == []
    assert cleared["trusted"] == []
    assert cleared["intended_vote"] is None
