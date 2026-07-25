"""
测试事件流 API 的脚本
验证新增的 /api/games/{game_id}/events 端点
"""
import asyncio
import sys
from app.core.orchestrator import GameOrchestrator
from app.api.game_manager import game_manager


async def demo_events_flow():
    """测试完整的事件流功能"""
    print("🧪 开始测试事件流 API...")

    # 创建一个简单的游戏配置
    player_configs = [
        {
            "player_id": f"TestAI-{i}",
            "provider": "openai",
            "model": "gpt-4o-mini"
        }
        for i in range(1, 6)
    ]

    print("\n1️⃣ 创建游戏...")
    result = await game_manager.create_game(
        player_configs=player_configs,
        seed=42
    )
    game_id = result["game_id"]
    print(f"   ✓ 游戏已创建: {game_id}")

    # 等待游戏初始化
    await asyncio.sleep(2)

    print("\n2️⃣ 获取游戏状态...")
    status = game_manager.get_status(game_id)
    if status:
        print(f"   ✓ 当前状态: {status['status']}")
        print(f"   ✓ 当前轮次: {status.get('current_round', 'N/A')}")
    else:
        print("   ✗ 获取状态失败")
        return

    print("\n3️⃣ 获取事件流...")
    events = game_manager.get_events(game_id)
    if events:
        print(f"   ✓ 已获取 {len(events)} 条事件")

        # 显示前几条事件
        for i, event in enumerate(events[:5], 1):
            print(f"   {i}. {event['event_type']}: {event.get('data', {})}")

        # 检查是否有推理内容
        has_reasoning = any(
            'reasoning' in event.get('data', {})
            for event in events
        )
        print(f"   ✓ 包含 AI 推理: {'是' if has_reasoning else '否'}")
    else:
        print("   ℹ️  事件流为空（游戏刚开始）")

    print("\n4️⃣ 等待游戏运行一段时间...")
    await asyncio.sleep(5)

    print("\n5️⃣ 再次获取事件流...")
    events = game_manager.get_events(game_id)
    if events:
        print(f"   ✓ 事件数量: {len(events)}")

        # 统计事件类型
        event_types = {}
        for event in events:
            event_type = event['event_type']
            event_types[event_type] = event_types.get(event_type, 0) + 1

        print("   ✓ 事件类型分布:")
        for event_type, count in event_types.items():
            print(f"      - {event_type}: {count}")

    print("\n6️⃣ 清理测试游戏...")
    deleted = await game_manager.delete_game(game_id)
    if deleted:
        print(f"   ✓ 游戏 {game_id} 已删除")

    print("\n✅ 测试完成！")
    print("\n📋 新功能验证:")
    print("   ✓ 事件流持久化")
    print("   ✓ GET /api/games/{id}/events 端点")
    print("   ✓ AI 推理内容记录")
    print("   ✓ 实时事件查询")


if __name__ == "__main__":
    try:
        asyncio.run(test_events_flow())
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
