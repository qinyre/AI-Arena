"""用典型局面回归 AI 的提示词、信息边界和决策质量。"""
import argparse
import asyncio
import os

from dotenv import load_dotenv

from app.core.agent import AIAgent
from app.core.models import ActionType, GameAction, GamePhase, Role
from app.core.werewolf import BOARD_PRESETS, WerewolfGame
from app.llm.claude_client import ClaudeClient


def make_game(board_id: str, seed: int, sheriff: bool = False) -> WerewolfGame:
    count = len(BOARD_PRESETS[board_id]["roles"])
    players = [f"AI-{index}" for index in range(1, count + 1)]
    game = WerewolfGame()
    game.initialize(players, {
        "game_id": f"eval-{board_id}-{seed}",
        "board_id": board_id,
        "seed": seed,
        "enable_sheriff": sheriff,
    })
    return game


def build_scenarios() -> list[dict]:
    scenarios = []

    game = make_game("9p", 21)
    witch = next(pid for pid, player in game.state.players.items() if player.role == Role.WITCH)
    target = next(pid for pid in game.state.alive_players if pid != witch)
    game.night_stage = "witch"
    game.last_night_kill = target
    game.witch_antidote_available = False
    agent = AIAgent(witch, None)
    agent.update_memory({
        "event_type": "witch_heal",
        "data": {"witch": witch, "target": target},
    })
    visible = game.get_visible_state(witch)
    actions = game.get_available_actions(witch)
    scenarios.append({
        "name": "女巫记得解药已使用",
        "game": game,
        "agent": agent,
        "visible": visible,
        "actions": actions,
        "must_contain": ("解药：已使用", "同守同救", "[用药] 你已使用解药"),
        "forbidden": ('"action_type": "heal"',),
        "live_check": lambda action: (
            None if action.action_type != ActionType.HEAL else "重复使用解药"
        ),
    })

    game = make_game("9p", 22)
    wolves = [
        pid for pid, player in game.state.players.items()
        if player.role == Role.WEREWOLF
    ]
    target = next(pid for pid in game.state.alive_players if pid not in wolves)
    first, current = wolves[:2]
    game.night_stage = "wolf_discussion"
    game.apply_action(GameAction(
        ActionType.WOLF_SPEAK,
        first,
        parameters={
            "content": f"建议今晚刀{target}，他像预言家。",
            "reasoning": "测试已有意见",
        },
    ))
    agent = AIAgent(current, None)
    visible = game.get_visible_state(current)
    actions = game.get_available_actions(current)

    def check_wolf_reply(action):
        if action.action_type == ActionType.PASS:
            return None
        content = action.parameters.get("content", "")
        alternatives = [
            pid for pid in game.state.alive_players
            if pid not in {*wolves, target} and pid in content
        ]
        repeated = target in content and not alternatives and any(
            phrase in content for phrase in ("同意", "赞成", "就刀", "必须刀", "刀掉")
        )
        return "狼聊只复述了已有刀口" if repeated else None

    scenarios.append({
        "name": "后置狼人不复读刀口",
        "game": game,
        "agent": agent,
        "visible": visible,
        "actions": actions,
        "must_contain": (f"建议今晚刀{target}", "禁止复述", "否则必须选择 pass"),
        "forbidden": (),
        # ponytail: 先覆盖已知复读句式；出现真实误报时再引入模型裁判。
        "live_check": check_wolf_reply,
    })

    game = make_game("9p", 23, sheriff=True)
    seer = next(pid for pid, player in game.state.players.items() if player.role == Role.SEER)
    checked = next(pid for pid in game.state.alive_players if pid != seer)
    is_wolf = game.state.players[checked].role == Role.WEREWOLF
    game.state.players[seer].investigation_results.append({
        "target": checked,
        "is_werewolf": is_wolf,
        "round": 1,
        "phase": "night",
    })
    game.state.phase = GamePhase.SHERIFF_CAMPAIGN
    game.acted_players = set()
    agent = AIAgent(seer, None)
    visible = game.get_visible_state(seer)
    actions = game.get_available_actions(seer)

    def check_sheriff_speech(action):
        if action.action_type != ActionType.SPEAK:
            return "预言家没有上警"
        content = action.parameters.get("content", "")
        if checked not in content:
            return "预言家没有报告首夜验人"
        if "警徽" not in content:
            return "预言家没有安排警徽流"
        return None

    scenarios.append({
        "name": "预言家上警报告验人和警徽流",
        "game": game,
        "agent": agent,
        "visible": visible,
        "actions": actions,
        "must_contain": ("警徽流", "一至两名未来查验对象", checked),
        "forbidden": (),
        "live_check": check_sheriff_speech,
    })

    game = make_game("9p", 24)
    wolves = [
        pid for pid, player in game.state.players.items()
        if player.role == Role.WEREWOLF
    ]
    villager = next(
        pid for pid, player in game.state.players.items()
        if player.role == Role.VILLAGER
    )
    secret = "绝密刀口暗号"
    game.night_stage = "wolf_discussion"
    game.apply_action(GameAction(
        ActionType.WOLF_SPEAK,
        wolves[0],
        parameters={"content": secret, "reasoning": "私密信息"},
    ))
    game.state.phase = GamePhase.DAY
    game.acted_players = set()
    agent = AIAgent(villager, None)
    scenarios.append({
        "name": "村民看不到狼队私聊",
        "game": game,
        "agent": agent,
        "visible": game.get_visible_state(villager),
        "actions": game.get_available_actions(villager),
        "must_contain": ("夜间守护、用药等私密行动只有行动者本人知道",),
        "forbidden": (secret, "werewolf_team", "werewolf_discussion"),
        "live_check": None,
    })
    return scenarios


def build_personality_pair() -> dict:
    """同一公开局面下对比两个极端性格。"""
    game = make_game("9p", 25)
    actor = next(
        pid for pid, player in game.state.players.items()
        if player.role == Role.VILLAGER
    )
    speakers = [pid for pid in game.state.alive_players if pid != actor][:2]
    suspect = next(
        pid for pid in game.state.alive_players
        if pid not in {actor, *speakers}
    )
    game.state.phase = GamePhase.DAY
    game.day_speech_order = list(game.state.alive_players)
    game.acted_players = set()
    game.apply_action(GameAction(
        ActionType.SPEAK,
        speakers[0],
        parameters={
            "content": f"我怀疑{suspect}，他上轮的站边没有给出具体依据。",
            "claim_role": "none",
            "reasoning": "制造中性争议局面",
        },
    ))
    game.apply_action(GameAction(
        ActionType.SPEAK,
        speakers[1],
        parameters={
            "content": f"我暂时不认同直接打{suspect}，还需要听他的解释。",
            "claim_role": "none",
            "reasoning": "制造中性争议局面",
        },
    ))
    visible = game.get_visible_state(actor)
    actions = game.get_available_actions(actor)
    return {
        "game": game,
        "visible": visible,
        "actions": actions,
        "suspect": suspect,
        "compact": AIAgent(actor, None, personality={
            "name": "极简观察者",
            "tone": "calm",
            "reasoning_style": "evidence",
            "risk_tolerance": 1,
            "assertiveness": 1,
            "verbosity": 1,
        }),
        "forceful": AIAgent(actor, None, personality={
            "name": "高调领袖",
            "tone": "direct",
            "reasoning_style": "pressure",
            "risk_tolerance": 5,
            "assertiveness": 5,
            "verbosity": 5,
        }),
    }


def personality_pair_errors(pair: dict) -> list[str]:
    compact_prompt = pair["compact"]._build_action_prompt(
        pair["visible"], pair["actions"]
    )
    forceful_prompt = pair["forceful"]._build_action_prompt(
        pair["visible"], pair["actions"]
    )
    checks = (
        ("谨慎型温度不是 0.45", pair["compact"]._decision_temperature() == 0.45),
        ("冒险型温度不是 0.85", pair["forceful"]._decision_temperature() == 0.85),
        ("极简型没有 25–60 字约束", "25–60 个汉字" in compact_prompt),
        ("高表达型没有 160–260 字约束", "160–260 个汉字" in forceful_prompt),
        ("谨慎型没有保留策略", "优先保留一次性能力和隐藏身份" in compact_prompt),
        ("高主导型没有唯一目标要求", "给出唯一优先目标" in forceful_prompt),
        ("施压型没有质询要求", "进行质询" in forceful_prompt),
    )
    return [message for message, passed in checks if not passed]


def prompt_errors(scenario: dict) -> list[str]:
    agent = scenario["agent"]
    system = agent._build_system_prompt(scenario["visible"])
    action = agent._build_action_prompt(scenario["visible"], scenario["actions"])
    prompt = system + action
    errors = [
        f"提示词缺少: {text}"
        for text in scenario["must_contain"]
        if text not in prompt
    ]
    errors.extend(
        f"提示词泄露/误含: {text}"
        for text in scenario["forbidden"]
        if text in prompt
    )
    return errors


def run_offline() -> list[dict]:
    results = []
    for scenario in build_scenarios():
        errors = prompt_errors(scenario)
        results.append({
            "name": scenario["name"],
            "status": "ok" if not errors else "error",
            "errors": errors,
        })
    errors = personality_pair_errors(build_personality_pair())
    results.append({
        "name": "同局面性格行为契约产生差异",
        "status": "ok" if not errors else "error",
        "errors": errors,
    })
    return results


async def run_live(client: ClaudeClient, timeout: float) -> list[dict]:
    results = []
    for scenario in build_scenarios():
        if scenario["live_check"] is None:
            continue
        errors = prompt_errors(scenario)
        if not errors:
            scenario["agent"].model_client = client
            try:
                action = await asyncio.wait_for(
                    scenario["agent"].decide(
                        scenario["visible"],
                        scenario["actions"],
                    ),
                    timeout=timeout,
                )
                if not scenario["game"].is_valid_action(action):
                    errors.append(f"模型返回非法动作: {action.to_dict()}")
                else:
                    semantic_error = scenario["live_check"](action)
                    if semantic_error:
                        errors.append(semantic_error)
            except Exception as exc:
                errors.append(f"{type(exc).__name__}: {exc}")
        results.append({
            "name": scenario["name"],
            "status": "ok" if not errors else "error",
            "errors": errors,
        })

    pair = build_personality_pair()
    errors = personality_pair_errors(pair)
    contents = {}
    for label in ("compact", "forceful"):
        agent = pair[label]
        agent.model_client = client
        try:
            action = await asyncio.wait_for(
                agent.decide(pair["visible"], pair["actions"]),
                timeout=timeout,
            )
            if not pair["game"].is_valid_action(action):
                errors.append(f"{label} 返回非法动作")
            elif action.action_type != ActionType.SPEAK:
                errors.append(f"{label} 没有执行公开发言")
            else:
                contents[label] = action.parameters.get("content", "")
        except Exception as exc:
            errors.append(f"{label}: {type(exc).__name__}: {exc}")
    if len(contents) == 2:
        if contents["compact"] == contents["forceful"]:
            errors.append("两个极端性格生成了完全相同的发言")
        if len(contents["forceful"]) <= len(contents["compact"]):
            errors.append(
                f"高表达发言没有更长（{len(contents['forceful'])}"
                f" <= {len(contents['compact'])}）"
            )
        if not any(
            pid in contents["forceful"]
            for pid in pair["game"].state.alive_players
            if pid != pair["forceful"].agent_id
        ):
            errors.append("高主导型没有点名任何玩家")
    results.append({
        "name": "同局面极简观察者 vs 高调领袖",
        "status": "ok" if not errors else "error",
        "errors": errors,
    })
    return results


def print_results(results: list[dict], label: str) -> None:
    for result in results:
        detail = "" if not result["errors"] else f"：{'；'.join(result['errors'])}"
        print(f"{'PASS' if result['status'] == 'ok' else 'FAIL'} {result['name']}{detail}")
    passed = sum(result["status"] == "ok" for result in results)
    print(f"{label}: {passed}/{len(results)} 通过")


async def main(args) -> None:
    if not args.live:
        results = run_offline()
        print_results(results, "离线场景")
    else:
        load_dotenv()
        api_key = os.getenv(args.api_key_env)
        if not api_key:
            raise SystemExit(f"缺少环境变量 {args.api_key_env}")
        client = ClaudeClient(
            api_key=api_key,
            model=args.model,
            base_url=args.base_url,
        )
        results = await run_live(client, args.timeout)
        print_results(results, "真实模型场景")
        usage = client.get_total_usage()
        print(
            f"Token: 输入 {usage['total_input_tokens']}，"
            f"输出 {usage['total_output_tokens']}，合计 {usage['total_tokens']}"
        )
    if any(result["status"] != "ok" for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="回归 AI 在典型狼人杀局面中的决策")
    parser.add_argument("--live", action="store_true", help="显式调用真实模型")
    parser.add_argument("--base-url", default="https://apiclaude.cc")
    parser.add_argument("--model", default="claude-fable-5")
    parser.add_argument("--api-key-env", default="ANTHROPIC_API_KEY")
    parser.add_argument("--timeout", type=float, default=90.0)
    asyncio.run(main(parser.parse_args()))
