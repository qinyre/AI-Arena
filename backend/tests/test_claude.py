"""
Test Script - Run a game with Claude models
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.orchestrator import GameOrchestrator
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


async def main():
    """运行一局使用Claude模型的狼人杀游戏"""
    print("🎮 AI Arena - Claude模型测试")
    print("=" * 50)

    # 游戏配置 - 混合使用不同模型（展示多 provider 能力）
    config = {
        "game_id": "test_claude_001",
        "players": ["Claude-1", "Claude-2", "GPT-1", "GPT-2", "DeepSeek-1"],
        "seed": 42,
        "model_configs": {
            "Claude-1": {"provider": "anthropic", "model": "claude-sonnet-5"},
            "Claude-2": {"provider": "anthropic", "model": "claude-sonnet-5"},
            "GPT-1": {"provider": "openai", "model": "gpt-5.6-luna"},
            "GPT-2": {"provider": "openai", "model": "gpt-5.6-luna"},
            "DeepSeek-1": {"provider": "deepseek", "model": "deepseek-v4-flash"},
        }
    }

    # 创建编排器
    orchestrator = GameOrchestrator("test_claude_001", config)

    print("\n📝 初始化游戏...")
    print("  模型配置:")
    for player_id, cfg in config["model_configs"].items():
        print(f"    {player_id}: {cfg['provider']}/{cfg['model']}")

    await orchestrator.initialize()

    print("\n🚀 开始游戏...")
    result = await orchestrator.run_game()

    print("\n" + "=" * 50)
    print("🏆 游戏结束！")
    print(f"获胜方: {result.get('winner')}")
    print(f"结束轮次: {result.get('final_round')}")
    print(f"原因: {result.get('reason')}")
    print(f"耗时: {result.get('duration_seconds'):.2f}秒")

    # 打印成本
    total_cost = orchestrator.get_total_cost()
    print(f"\n💰 总成本: ${total_cost:.4f}")

    # 打印每个AI的token使用和成本对比
    print("\n📊 Token使用情况:")
    for player_id, agent in orchestrator.agents.items():
        usage = agent.model_client.get_total_usage()
        provider = config["model_configs"][player_id]["provider"]
        print(f"  {player_id} ({provider}): {usage['total_tokens']} tokens (${usage['estimated_cost']:.4f})")


if __name__ == "__main__":
    asyncio.run(main())
