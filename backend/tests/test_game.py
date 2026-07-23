"""
Test Script - Run a complete werewolf game
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
    """运行一局完整的狼人杀游戏"""
    print("🎮 AI Arena - 狼人杀游戏测试")
    print("=" * 50)

    # 游戏配置
    config = {
        "game_id": "test_game_001",
        "players": ["AI-1", "AI-2", "AI-3", "AI-4", "AI-5"],
        "seed": 42,  # 固定种子，可复现
        "model_configs": {
            "AI-1": {"provider": "deepseek", "model": "deepseek-chat"},
            "AI-2": {"provider": "deepseek", "model": "deepseek-chat"},
            "AI-3": {"provider": "deepseek", "model": "deepseek-chat"},
            "AI-4": {"provider": "deepseek", "model": "deepseek-chat"},
            "AI-5": {"provider": "deepseek", "model": "deepseek-chat"},
        }
    }

    # 创建编排器
    orchestrator = GameOrchestrator("test_game_001", config)

    print("\n📝 初始化游戏...")
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

    # 打印每个AI的token使用
    print("\n📊 Token使用情况:")
    for player_id, agent in orchestrator.agents.items():
        usage = agent.model_client.get_total_usage()
        print(f"  {player_id}: {usage['total_tokens']} tokens (${usage['estimated_cost']:.4f})")


if __name__ == "__main__":
    asyncio.run(main())
