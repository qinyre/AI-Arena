import asyncio

from app.core.agent import AIAgent
from scripts.evaluate_ai_scenarios import run_offline


def test_ai_scenario_prompts_and_information_boundaries():
    results = run_offline()
    assert all(result["status"] == "ok" for result in results), results


def test_personality_changes_sampling_and_action_contract():
    calls = []

    class CapturingClient:
        async def generate(self, **kwargs):
            calls.append(kwargs)
            return {
                "parsed": {
                    "reasoning": "基于当前发言给出判断",
                    "chosen_action": {
                        "action_type": "speak",
                        "target": None,
                        "parameters": {
                            "content": "我会结合当前公开发言继续判断。",
                            "claim_role": "none",
                        },
                    },
                },
            }

    actions = [{
        "action_type": "speak",
        "target_required": False,
        "parameters": {
            "content": {"type": "string"},
            "claim_role": {"type": "string", "enum": ["none", "villager"]},
        },
    }]
    visible = {
        "phase": "day",
        "your_player_id": "AI-1",
        "your_role": "villager",
        "alive_players": ["AI-1", "AI-2"],
    }
    profiles = (
        {
            "name": "极简观察者", "tone": "calm", "reasoning_style": "evidence",
            "risk_tolerance": 1, "assertiveness": 1, "verbosity": 1,
        },
        {
            "name": "高调领袖", "tone": "direct", "reasoning_style": "pressure",
            "risk_tolerance": 5, "assertiveness": 5, "verbosity": 5,
        },
    )
    for profile in profiles:
        asyncio.run(AIAgent("AI-1", CapturingClient(), profile).decide(
            visible, actions
        ))

    assert [call["temperature"] for call in calls] == [0.45, 0.85]
    assert "25–60 个汉字" in calls[0]["prompt"]
    assert "160–260 个汉字" in calls[1]["prompt"]
    assert "给出唯一优先目标" in calls[1]["prompt"]
