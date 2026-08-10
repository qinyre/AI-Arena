import asyncio

from app.core.agent import AIAgent
from app.llm.client import parse_json_response


SPEAK_ACTIONS = [{
    "action_type": "speak",
    "target_required": False,
    "valid_targets": [],
    "parameters": {
        "content": {"type": "string"},
        "claim_role": {"enum": ["none"]},
    },
}]


class FakeClient:
    def __init__(self, response=None, total_tokens=0):
        self.response = response or {
            "content": "not-json",
            "parsed": None,
            "parse_error": "invalid",
            "finish_reason": "stop",
        }
        self.total_tokens = total_tokens
        self.calls = 0
        self.kwargs = None

    async def generate(self, **kwargs):
        self.calls += 1
        self.kwargs = kwargs
        return self.response.copy()

    def get_total_usage(self):
        return {
            "total_input_tokens": self.total_tokens,
            "total_output_tokens": 0,
            "total_tokens": self.total_tokens,
            "estimated_cost": 0.0,
        }


def minimal_state(round_no=1):
    return {
        "phase": "day",
        "round": round_no,
        "your_player_id": "AI-1",
        "your_role": "villager",
        "alive_players": ["AI-1", "AI-2"],
        "dead_players": [],
        "public_events": [],
    }


def test_json_parser_extracts_fenced_object_and_repairs_truncation():
    fenced, error, repaired = parse_json_response('说明：```json\n{"ok":true}\n```')
    assert fenced == {"ok": True}
    assert error is None
    assert repaired

    truncated, error, repaired = parse_json_response(
        '{"chosen_action":{"action_type":"vote","target":"AI-2","parameters":{}},'
        '"reasoning":"票型更可疑'
    )
    assert truncated["chosen_action"]["target"] == "AI-2"
    assert truncated["reasoning"] == "票型更可疑"
    assert error is None
    assert repaired


def test_agent_uses_compact_state_and_configured_output_limit():
    client = FakeClient({
        "content": "{}",
        "parsed": {
            "chosen_action": {
                "action_type": "speak",
                "target": None,
                "parameters": {"content": "我目前更怀疑AI-2。", "claim_role": "none"},
            },
            "reasoning": "基于当前信息先明确站边。",
        },
        "finish_reason": "stop",
        "json_repaired": True,
    })
    agent = AIAgent("AI-1", client, max_output_tokens=777)
    state = minimal_state()
    state["public_events"] = [{
        "event_type": "player_speech",
        "timestamp": "2026-08-10T00:00:00",
        "visibility": "public",
        "data": {"speaker": "AI-2", "content": "我认为AI-1偏好。"},
    }]

    action = asyncio.run(agent.decide(state, SPEAK_ACTIONS))

    assert action.parameters["content"] == "我目前更怀疑AI-2。"
    assert client.kwargs["max_tokens"] == 777
    assert '"public_history"' in client.kwargs["prompt"]
    assert "[发言] AI-2: 我认为AI-1偏好。" in client.kwargs["prompt"]
    assert "2026-08-10T00:00:00" not in client.kwargs["prompt"]
    assert agent.last_decision_metrics["json_repaired"] is True


def test_player_budget_and_round_circuit_breaker_skip_paid_calls():
    budget_client = FakeClient(total_tokens=100)
    budget_agent = AIAgent("AI-1", budget_client, player_token_budget=100)
    asyncio.run(budget_agent.decide(minimal_state(), SPEAK_ACTIONS))
    assert budget_client.calls == 0
    assert "预算" in budget_agent.last_decision_error["reason"]

    failing_client = FakeClient()
    circuit_agent = AIAgent("AI-1", failing_client, circuit_breaker_failures=2)
    asyncio.run(circuit_agent.decide(minimal_state(), SPEAK_ACTIONS))
    asyncio.run(circuit_agent.decide(minimal_state(), SPEAK_ACTIONS))
    asyncio.run(circuit_agent.decide(minimal_state(), SPEAK_ACTIONS))
    assert failing_client.calls == 2
    assert "熔断" in circuit_agent.last_decision_error["reason"]

    asyncio.run(circuit_agent.decide(minimal_state(round_no=2), SPEAK_ACTIONS))
    assert failing_client.calls == 3
