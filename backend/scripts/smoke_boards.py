"""使用真实模型批量跑完所有板型，输出机器可读的冒烟测试结果。"""
import argparse
import asyncio
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core.orchestrator import GameOrchestrator
from app.core.werewolf import BOARD_PRESETS


async def run_game(board_id: str, run: int, max_rounds: int) -> dict:
    count = len(BOARD_PRESETS[board_id]["roles"])
    game_id = f"smoke-{board_id}-{run}"
    players = [f"AI-{i}" for i in range(1, count + 1)]
    model_configs = {
        player: {"provider": "deepseek", "model": "deepseek-v4-flash"}
        for player in players
    }
    orchestrator = GameOrchestrator(game_id, {
        "game_id": game_id,
        "board_id": board_id,
        "players": players,
        "model_configs": model_configs,
        "seed": 10_000 + run,
        "max_rounds": max_rounds,
    })
    print(f"START {game_id}", flush=True)
    try:
        await orchestrator.initialize()
        result = await orchestrator.run_game()
        output = {
            "game_id": game_id,
            "board": BOARD_PRESETS[board_id]["name"],
            "winner": result.get("winner"),
            "reason": result.get("reason"),
            "rounds": result.get("final_round"),
            "events": len(orchestrator.game.state.events),
            "cost_usd": round(orchestrator.get_total_cost(), 6),
            "status": "ok",
        }
    except Exception as exc:
        output = {
            "game_id": game_id,
            "board": BOARD_PRESETS[board_id]["name"],
            "status": "error",
            "error": f"{type(exc).__name__}: {exc}",
        }
    print("RESULT " + json.dumps(output, ensure_ascii=False), flush=True)
    return output


async def main(runs: int, max_rounds: int) -> None:
    results = []
    for run in range(1, runs + 1):
        batch = await asyncio.gather(*(
            run_game(board_id, run, max_rounds)
            for board_id in BOARD_PRESETS
        ))
        results.extend(batch)
    print("SUMMARY " + json.dumps(results, ensure_ascii=False), flush=True)
    if any(result["status"] != "ok" for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--max-rounds", type=int, default=12)
    args = parser.parse_args()
    asyncio.run(main(args.runs, args.max_rounds))
