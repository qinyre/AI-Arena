"""
API Schemas (Pydantic) — 严格匹配前端 frontend/src/types/api.ts 的数据契约。

每个模型的字段名与前端 interface 一一对应，确保前后端无需手动转换。
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------------------------------------------------------------------------
# 请求模型
# ---------------------------------------------------------------------------

class PersonalityConfig(BaseModel):
    """结构化玩家性格；禁止注入任意提示词字段。"""
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=30, pattern=r"^[^\r\n]+$")
    tone: Literal["calm", "direct", "diplomatic", "playful", "dramatic"]
    reasoning_style: Literal["evidence", "intuition", "pressure", "consensus"]
    risk_tolerance: int = Field(ge=1, le=5)
    assertiveness: int = Field(ge=1, le=5)
    verbosity: int = Field(ge=1, le=5)


class PlayerConfig(BaseModel):
    """单个玩家的模型配置（provider 名 或 自定义端点二选一）。"""
    player_id: str
    avatar_id: Optional[str] = Field(
        default=None, min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$"
    )
    provider: Optional[str] = None
    model: str
    # 自定义端点字段（对应后端 orchestrator 用户直填路径）
    api_format: Optional[str] = None      # "openai" | "anthropic"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    key_env: Optional[str] = None
    personality: Optional[PersonalityConfig] = None


RoleName = Literal[
    "werewolf", "seer", "witch", "hunter", "idiot", "guard",
    "white_wolf_king", "wolf_king", "wolf_beauty", "knight", "villager",
]


class CustomBoardConfig(BaseModel):
    """仅使用规则引擎已经支持的角色组成自定义板型。"""
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=30, pattern=r"^[^\r\n]+$")
    roles: List[RoleName] = Field(min_length=5, max_length=18)
    win_rule: Literal["parity", "edge"] = "edge"


class CreateGameRequest(BaseModel):
    """POST /api/games/ 请求体。"""
    player_configs: List[PlayerConfig]
    board_id: str = "5p"
    custom_board: Optional[CustomBoardConfig] = None
    seed: Optional[int] = None
    enable_sheriff: bool = False
    budget_tier: Literal["economy", "standard", "premium"] = "standard"
    max_rounds: int = Field(default=20, ge=1, le=50)
    parent_game_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        pattern=r"^[a-zA-Z0-9_-]+$",
    )

    @model_validator(mode="after")
    def validate_custom_board_pair(self):
        if self.board_id == "custom" and self.custom_board is None:
            raise ValueError("自定义板型必须提供 custom_board")
        if self.board_id != "custom" and self.custom_board is not None:
            raise ValueError("仅 board_id=custom 时可以提供 custom_board")
        return self


class CreateSeriesRequest(CreateGameRequest):
    """POST /api/games/series 请求体。"""
    game_count: int = Field(ge=2, le=24)
    base_seed: Optional[int] = None
    max_total_tokens: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_series_seed(self):
        if self.seed is not None and self.base_seed is not None:
            raise ValueError("seed 与 base_seed 只能填写一个")
        if self.parent_game_id is not None:
            raise ValueError("自动系列赛不能同时指定复赛来源")
        seat_count = len(self.player_configs)
        if seat_count and self.game_count % seat_count:
            raise ValueError(
                f"公平系列赛必须完成整轮席位轮换；{seat_count} 个席位时，"
                f"局数必须是 {seat_count} 的整数倍"
            )
        return self


class ModelConnectionTestRequest(BaseModel):
    """测试预设 provider 或用户直填模型端点。"""
    provider: Optional[str] = None
    api_format: Literal["openai", "anthropic"] = "openai"
    base_url: Optional[str] = Field(default=None, min_length=1)
    model: str = Field(min_length=1)
    api_key: Optional[str] = None

    @model_validator(mode="after")
    def validate_source(self):
        if bool(self.provider) == bool(self.base_url):
            raise ValueError("provider 与 base_url 必须且只能填写一个")
        return self


class GameReviewRequest(BaseModel):
    """使用预设 provider 或用户直填端点生成终局复盘。"""
    provider: Optional[str] = None
    api_format: Literal["openai", "anthropic"] = "openai"
    base_url: Optional[str] = Field(default=None, min_length=1)
    model: str = Field(min_length=1)
    api_key: Optional[str] = None

    @model_validator(mode="after")
    def validate_source(self):
        if bool(self.provider) == bool(self.base_url):
            raise ValueError("provider 与 base_url 必须且只能填写一个")
        return self


# ---------------------------------------------------------------------------
# 响应模型
# ---------------------------------------------------------------------------

class CreateGameResponse(BaseModel):
    """POST /api/games/ 响应。"""
    game_id: str
    status: str
    message: str
    players: List[str]
    board_id: str
    series_id: str
    series_game_number: int


class SeriesStatusResponse(BaseModel):
    """公平系列赛的实时进度。"""
    series_id: str
    status: str
    game_count: int
    completed_games: int
    current_game_number: int
    current_game_id: Optional[str] = None
    total_tokens: int
    total_cost: float
    max_total_tokens: Optional[int] = None
    base_seed: int
    stopped: bool
    reason: Optional[str] = None
    error: Optional[str] = None
    games: List[Dict[str, Any]] = Field(default_factory=list)


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
    custom_model_players: List[str] = Field(default_factory=list)
    custom_tokens: int = 0
    role_assignment: Dict[str, str] = Field(default_factory=dict)  # 玩家角色分配
    personality_assignment: Dict[str, PersonalityConfig] = Field(default_factory=dict)
    avatar_assignment: Dict[str, str] = Field(default_factory=dict)
    sheriff_enabled: bool = False
    sheriff_id: Optional[str] = None


class GameReviewMVP(BaseModel):
    player_id: str
    reason: str


class GameReviewTurningPoint(BaseModel):
    round: int = Field(ge=0)
    event_index: int = Field(ge=0)
    title: str
    impact: str


class GameReviewPlayer(BaseModel):
    player_id: str
    score: int = Field(ge=0, le=100)
    verdict: str
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)


class GameReviewAward(BaseModel):
    title: str
    player_id: str
    reason: str


class GameReviewContent(BaseModel):
    headline: str
    overview: str
    mvp: GameReviewMVP
    turning_points: List[GameReviewTurningPoint] = Field(default_factory=list)
    player_reviews: List[GameReviewPlayer]
    awards: List[GameReviewAward] = Field(default_factory=list)


class GameReview(GameReviewContent):
    model: str
    usage: Dict[str, int] = Field(default_factory=dict)
    generated_at: str


class QualityFinding(BaseModel):
    id: str
    category: Literal["rules", "privacy", "flow", "coherence", "personality", "reliability"]
    severity: Literal["error", "warning", "info"]
    confidence: Literal["certain", "heuristic"]
    title: str
    detail: str
    event_index: Optional[int] = Field(default=None, ge=0)
    round: Optional[int] = Field(default=None, ge=0)
    player_id: Optional[str] = None


class QualityCheck(BaseModel):
    category: str
    label: str
    description: str
    status: Literal["passed", "warning", "failed"]
    finding_count: int = Field(ge=0)


class QualitySummary(BaseModel):
    error: int = Field(ge=0)
    warning: int = Field(ge=0)
    info: int = Field(ge=0)
    issues: int = Field(ge=0)
    observations: int = Field(ge=0)
    checks_total: int = Field(ge=0)
    checks_passed: int = Field(ge=0)


class GameQualityReport(BaseModel):
    schema_version: int = 1
    generated_at: str
    status: Literal["passed", "warning", "failed"]
    score: int = Field(ge=0, le=100)
    summary: QualitySummary
    metrics: Dict[str, Any] = Field(default_factory=dict)
    checks: List[QualityCheck] = Field(default_factory=list)
    findings: List[QualityFinding] = Field(default_factory=list)


class GameResultResponse(BaseModel):
    """GET /api/games/{id}/result 响应（仅 completed 时有意义）。"""
    game_id: str
    winner: str
    final_round: int
    reason: str
    duration_seconds: float
    total_cost: float
    player_costs: Dict[str, float]
    custom_model_players: List[str] = Field(default_factory=list)
    custom_tokens: int = 0
    player_tokens: Dict[str, int] = Field(default_factory=dict)
    llm_metrics: Dict[str, Any] = Field(default_factory=dict)
    match_facts: Dict[str, Any] = Field(default_factory=dict)
    replay_config: Dict[str, Any] = Field(default_factory=dict)
    series: Dict[str, Any] = Field(default_factory=dict)
    budget_tier: str = "standard"
    budget_profile: Dict[str, int] = Field(default_factory=dict)
    summary: Any = None
    ai_review: Optional[GameReview] = None
    quality_report: Optional[GameQualityReport] = None


class GameListItem(BaseModel):
    game_id: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    board_id: Optional[str] = None
    winner: Optional[str] = None
    series_id: Optional[str] = None
    series_game_number: int = 1
    automated_series: bool = False
    quality_status: Optional[Literal["passed", "warning", "failed"]] = None
    quality_score: Optional[int] = Field(default=None, ge=0, le=100)
    quality_issue_count: Optional[int] = Field(default=None, ge=0)


class ListGamesResponse(BaseModel):
    total: int
    games: List[GameListItem]


class StatsResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    total_games: int
    completed: int
    running: int
    error: int
    total_cost: float
    custom_tokens: int = 0
    model_stats: List[Dict[str, Any]] = Field(default_factory=list)
    personality_stats: List[Dict[str, Any]] = Field(default_factory=list)


class DeleteResponse(BaseModel):
    message: str


class GameEventResponse(BaseModel):
    """GET /api/games/{id}/events 响应 - 事件流数据。"""
    game_id: str
    events: List[Dict[str, Any]]
    from_index: int
    next_index: int
    total: int
    terminal: bool = False
