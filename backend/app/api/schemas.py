"""
API Schemas (Pydantic) — 严格匹配前端 frontend/src/types/api.ts 的数据契约。

每个模型的字段名与前端 interface 一一对应，确保前后端无需手动转换。
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 请求模型
# ---------------------------------------------------------------------------

class PlayerConfig(BaseModel):
    """单个玩家的模型配置（provider 名 或 自定义端点二选一）。"""
    player_id: str
    provider: Optional[str] = None
    model: str
    # 自定义端点字段（对应后端 orchestrator 用户直填路径）
    api_format: Optional[str] = None      # "openai" | "anthropic"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    key_env: Optional[str] = None


class CreateGameRequest(BaseModel):
    """POST /api/games/ 请求体。"""
    player_configs: List[PlayerConfig]
    board_id: str = "5p"
    seed: Optional[int] = None


class ModelConnectionTestRequest(BaseModel):
    """测试用户直填模型端点。"""
    api_format: Literal["openai", "anthropic"] = "openai"
    base_url: str = Field(min_length=1)
    model: str = Field(min_length=1)
    api_key: Optional[str] = None


# ---------------------------------------------------------------------------
# 响应模型
# ---------------------------------------------------------------------------

class CreateGameResponse(BaseModel):
    """POST /api/games/ 响应。"""
    game_id: str
    status: str
    message: str
    players: List[str]


class GameStatusResponse(BaseModel):
    """GET /api/games/{id}/status 响应。

    注意 current_phase 用前端期望的 'night'|'day'|'vote'（引擎内部是 'voting'）。
    """
    game_id: str
    status: str  # pending | initialized | running | completed | error
    current_phase: Optional[str] = None
    current_round: Optional[int] = None
    alive_players: List[str] = Field(default_factory=list)
    dead_players: List[str] = Field(default_factory=list)
    winner: Optional[str] = None
    total_cost: Optional[float] = None
    role_assignment: Dict[str, str] = Field(default_factory=dict)  # 玩家角色分配


class GameResultResponse(BaseModel):
    """GET /api/games/{id}/result 响应（仅 completed 时有意义）。"""
    game_id: str
    winner: str
    final_round: int
    reason: str
    duration_seconds: float
    total_cost: float
    player_costs: Dict[str, float]
    summary: Any = None


class GameListItem(BaseModel):
    game_id: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ListGamesResponse(BaseModel):
    total: int
    games: List[GameListItem]


class StatsResponse(BaseModel):
    total_games: int
    completed: int
    running: int
    error: int
    total_cost: float


class DeleteResponse(BaseModel):
    message: str


class GameEventResponse(BaseModel):
    """GET /api/games/{id}/events 响应 - 事件流数据。"""
    game_id: str
    events: List[Dict[str, Any]]
    total: int
