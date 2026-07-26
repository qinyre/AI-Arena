"""
Game Manager — 游戏生命周期、持久化、状态查询。

职责:
  - 创建游戏: 转换前端配置 → orchestrator 配置,启动后台 asyncio.Task
  - 内存追踪: 保存 orchestrator 引用与 task,供 status 端点实时查询
  - JSON 持久化: 记录每局 game_id/status/时间戳/最终结果/成本
  - 状态查询: 从 orchestrator.game.state 构建 GameStatusResponse(含阶段映射、成本注入)
  - 结果查询: 合并 GameResult + player_costs + total_cost

设计:
  - 后台 task 跑 orchestrator.run_game(),不阻塞 HTTP 请求
  - task 完成回调更新持久化状态(completed/error)
  - 前端纯轮询(每3秒)读 status,无需 WebSocket
"""
import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.orchestrator import GameOrchestrator

# 持久化文件路径: backend/data/games.json
_STORAGE_PATH = Path(__file__).resolve().parents[2] / "data" / "games.json"

# 引擎 phase → 前端期望 phase 的映射
# 引擎用 GamePhase.VOTING="voting",前端 GameView 期望 "vote"
_PHASE_MAP = {"voting": "vote", "tiebreak_speech": "day", "tiebreak_voting": "vote"}


class GameManager:
    """单例游戏管理器(模块级实例 game_manager)。"""

    def __init__(self):
        # game_id → orchestrator 引用(内存中,进程重启丢失)
        self._orchestrators: Dict[str, GameOrchestrator] = {}
        # game_id → asyncio.Task
        self._tasks: Dict[str, asyncio.Task] = {}
        # 写保护锁(JSON 文件并发写)
        self._lock = asyncio.Lock()
        # 确保存储目录存在
        _STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # 创建游戏
    # ------------------------------------------------------------------
    async def create_game(
        self, player_configs: List[Dict], seed: Optional[int], board_id: str = "5p"
    ) -> Dict:
        """
        创建并启动一局游戏。

        Args:
            player_configs: 前端的玩家配置列表(player_id + provider/model 或 base_url)
            seed: 随机种子(可选)

        Returns:
            {"game_id", "status", "message", "players"}

        Raises:
            ValueError: 板型不存在或玩家数不匹配
        """
        from app.core.werewolf import BOARD_PRESETS

        board = BOARD_PRESETS.get(board_id)
        if not board:
            raise ValueError(f"未知板型: {board_id}")
        if len(player_configs) != len(board["roles"]):
            raise ValueError(
                f"{board['name']}需要 {len(board['roles'])} 人,收到 {len(player_configs)} 人"
            )

        game_id = f"game-{uuid.uuid4().hex[:8]}"
        players = [c["player_id"] for c in player_configs]
        # orchestrator 期望 model_configs 以 player_id 为 key
        model_configs = {
            c["player_id"]: {k: v for k, v in c.items() if k != "player_id"}
            for c in player_configs
        }

        config = {
            "game_id": game_id,
            "players": players,
            "model_configs": model_configs,
            "board_id": board_id,
            "seed": seed,
        }

        orchestrator = GameOrchestrator(game_id, config)
        self._orchestrators[game_id] = orchestrator

        # 持久化 initialized 状态
        now = _now_iso()
        record = {
            "game_id": game_id,
            "status": "initialized",
            "created_at": now,
            "started_at": now,
            "completed_at": None,
            "winner": None,
            "final_round": None,
            "reason": None,
            "duration_seconds": None,
            "total_cost": 0.0,
            "player_costs": {},
        }
        await self._save_record(record)

        # 启动后台 task 跑游戏
        task = asyncio.create_task(self._run_game_safe(game_id))
        self._tasks[game_id] = task

        return {
            "game_id": game_id,
            "status": "initialized",
            "message": "游戏已创建,正在后台启动",
            "players": players,
            "board_id": board_id,
        }

    async def _run_game_safe(self, game_id: str):
        """后台运行游戏,捕获异常,结束更新状态。"""
        orch = self._orchestrators[game_id]
        await self._update_status(game_id, status="running")

        try:
            await orch.initialize()
            result = await orch.run_game()

            # 合成成本
            player_costs = self._collect_costs(orch)
            total_cost = sum(player_costs.values())

            # 持久化完整事件流（包含 AI 推理）
            await self._save_events(game_id, orch)

            # 终局玩家状态:游戏完成后内存 orchestrator 会被清理,
            # get_status 不再能从内存读,所以这里必须持久化下来,
            # 否则前端复盘时玩家列表会变空(触发"等待玩家入场")。
            state = orch.game.state
            final_role_assignment = (
                {pid: p.role.value for pid, p in state.players.items()}
                if state and state.players else {}
            )
            final_alive = list(state.alive_players) if state else []
            final_dead = list(state.dead_players) if state else []
            final_phase = _PHASE_MAP.get(state.phase.value, state.phase.value) if state else None

            # 更新持久化记录
            update = {
                "status": "completed",
                "completed_at": _now_iso(),
                "winner": result.get("winner"),
                "final_round": result.get("final_round"),
                "reason": result.get("reason"),
                "duration_seconds": result.get("duration_seconds"),
                "total_cost": total_cost,
                "player_costs": player_costs,
                "summary": result.get("summary"),  # 原本漏存，导致 get_result() 永远返回 null
                # 终局玩家状态(复盘用)
                "role_assignment": final_role_assignment,
                "alive_players": final_alive,
                "dead_players": final_dead,
                "current_phase": final_phase,
                "current_round": state.round if state else result.get("final_round"),
            }
            await self._update_status(game_id, **update)

        except Exception as e:
            # 捕获异常,标记 error,否则前端永远 running
            print(f"❌ 游戏 {game_id} 运行失败: {e}")
            await self._update_status(
                game_id, status="error", completed_at=_now_iso(),
                reason=f"运行错误: {str(e)}",
            )

    # ------------------------------------------------------------------
    # 状态查询
    # ------------------------------------------------------------------
    def get_status(self, game_id: str) -> Optional[Dict]:
        """
        构建 GameStatusResponse 数据。

        运行中: 从内存 orchestrator.game.state 实时读取
        否则: 从持久化记录读取
        """
        record = self._load_record(game_id)
        if record is None:
            return None

        # 默认从持久化记录取(完成/出错的游戏靠这些字段复盘,不再依赖内存 orchestrator)
        status_data = {
            "game_id": game_id,
            "status": record["status"],
            "current_phase": record.get("current_phase"),
            "current_round": record.get("current_round"),
            "alive_players": record.get("alive_players", []),
            "dead_players": record.get("dead_players", []),
            "winner": record.get("winner"),
            "total_cost": record.get("total_cost", 0.0),
            "role_assignment": record.get("role_assignment", {}),
        }

        # 运行中且有内存 orchestrator: 实时读 state(覆盖持久化的初始值)
        orch = self._orchestrators.get(game_id)
        if record["status"] in ("initialized", "running") and orch and orch.game.state:
            state = orch.game.state
            status_data["current_phase"] = _PHASE_MAP.get(
                state.phase.value, state.phase.value
            )
            status_data["current_round"] = state.round
            status_data["alive_players"] = list(state.alive_players)
            status_data["dead_players"] = list(state.dead_players)
            # 运行中实时成本
            status_data["total_cost"] = sum(self._collect_costs(orch).values())

            # 获取角色分配信息（从 game.state.players）
            if state.players:
                status_data["role_assignment"] = {
                    player_id: player.role.value
                    for player_id, player in state.players.items()
                }

        return status_data

    def get_result(self, game_id: str) -> Optional[Dict]:
        """构建 GameResultResponse 数据(仅 completed 有意义)。"""
        record = self._load_record(game_id)
        if record is None:
            return None
        return {
            "game_id": game_id,
            "winner": record.get("winner") or "",
            "final_round": record.get("final_round") or 0,
            "reason": record.get("reason") or "",
            "duration_seconds": record.get("duration_seconds") or 0.0,
            "total_cost": record.get("total_cost", 0.0),
            "player_costs": record.get("player_costs", {}),
            "summary": record.get("summary"),
        }

    # ------------------------------------------------------------------
    # 列表与统计
    # ------------------------------------------------------------------
    def list_games(self) -> Dict:
        """返回所有游戏记录(按创建时间倒序)。"""
        records = self._load_all()
        records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        games = [
            {
                "game_id": r["game_id"],
                "status": r["status"],
                "created_at": r["created_at"],
                "started_at": r.get("started_at"),
                "completed_at": r.get("completed_at"),
            }
            for r in records
        ]
        return {"total": len(games), "games": games}

    def get_stats(self) -> Dict:
        """汇总统计。"""
        records = self._load_all()
        return {
            "total_games": len(records),
            "completed": sum(1 for r in records if r["status"] == "completed"),
            "running": sum(
                1 for r in records if r["status"] in ("running", "initialized")
            ),
            "error": sum(1 for r in records if r["status"] == "error"),
            "total_cost": sum(r.get("total_cost", 0.0) for r in records),
        }

    # ------------------------------------------------------------------
    # 删除
    # ------------------------------------------------------------------
    async def delete_game(self, game_id: str) -> bool:
        """删除游戏:取消运行中 task + 删除持久化记录 + 事件文件。返回是否找到。"""
        task = self._tasks.get(game_id)
        if task and not task.done():
            task.cancel()
        self._orchestrators.pop(game_id, None)
        self._tasks.pop(game_id, None)

        # 删除事件文件
        events_file = _STORAGE_PATH.parent / f"{game_id}_events.json"
        if events_file.exists():
            try:
                events_file.unlink()
            except Exception as e:
                print(f"⚠️ 删除事件文件失败: {e}")

        return await self._delete_record(game_id)

    # ------------------------------------------------------------------
    # 事件流持久化
    # ------------------------------------------------------------------
    async def _save_events(self, game_id: str, orch: GameOrchestrator):
        """将游戏的完整事件流保存到独立文件。"""
        events_file = _STORAGE_PATH.parent / f"{game_id}_events.json"
        if orch.game.state and orch.game.state.events:
            events_data = [e.to_dict() for e in orch.game.state.events]
            try:
                with open(events_file, "w", encoding="utf-8") as f:
                    json.dump(events_data, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"⚠️ 保存事件流失败 {game_id}: {e}")

    def get_events(self, game_id: str) -> Optional[List[Dict]]:
        """读取游戏的事件流（支持实时和历史）。"""
        # 优先从内存读取（游戏运行中）
        orch = self._orchestrators.get(game_id)
        if orch and orch.game.state:
            return [e.to_dict() for e in orch.game.state.events]

        # 从文件读取（游戏已完成）
        events_file = _STORAGE_PATH.parent / f"{game_id}_events.json"
        if events_file.exists():
            try:
                with open(events_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return None
        return None

    # ------------------------------------------------------------------
    # 成本合成
    # ------------------------------------------------------------------
    def _collect_costs(self, orch: GameOrchestrator) -> Dict[str, float]:
        """从各 agent 的 model_client 聚合每个玩家成本。"""
        costs = {}
        for agent_id, agent in orch.agents.items():
            try:
                usage = agent.model_client.get_total_usage()
                costs[agent_id] = usage.get("estimated_cost", 0.0)
            except Exception:
                costs[agent_id] = 0.0
        return costs

    # ------------------------------------------------------------------
    # JSON 持久化(简单实现,数据量小)
    # ------------------------------------------------------------------
    def _load_all(self) -> List[Dict]:
        """读取全部记录。文件不存在返回空列表。"""
        if not _STORAGE_PATH.exists():
            return []
        try:
            with open(_STORAGE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return []

    def _load_record(self, game_id: str) -> Optional[Dict]:
        for r in self._load_all():
            if r.get("game_id") == game_id:
                return r
        return None

    async def _save_record(self, record: Dict):
        """新增一条记录。"""
        async with self._lock:
            records = self._load_all()
            records.append(record)
            self._write_all(records)

    async def _update_status(self, game_id: str, **fields):
        """更新某条记录的部分字段。"""
        async with self._lock:
            records = self._load_all()
            for r in records:
                if r.get("game_id") == game_id:
                    r.update(fields)
                    break
            self._write_all(records)

    async def _delete_record(self, game_id: str) -> bool:
        async with self._lock:
            records = self._load_all()
            before = len(records)
            records = [r for r in records if r.get("game_id") != game_id]
            self._write_all(records)
            return len(records) < before

    def _write_all(self, records: List[Dict]):
        """同步写文件(在 _lock 保护下调用)。"""
        tmp = _STORAGE_PATH.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        tmp.replace(_STORAGE_PATH)


def _now_iso() -> str:
    """当前 UTC 时间 ISO 字符串。"""
    return datetime.now(timezone.utc).isoformat()


# 模块级单例
game_manager = GameManager()
