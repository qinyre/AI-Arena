"""狼人杀核心规则。

WerewolfGame 按 mixin 组合拆分(行为与单文件时代完全一致):
  - werewolf_visibility  信息可见性(玩家视野/公开事件过滤/局势档案)
  - werewolf_actions     动作目录与合法性校验
  - werewolf_apply       动作执行(apply_action)
  - werewolf_phases      阶段推进状态机与结算
本文件保留:构造/初始化、胜负判定、终局总结。
板型常量(BOARD_PRESETS 等)在 app.core.boards,此处转出口以保持旧导入面。
"""
import random
from typing import Dict, List, Optional

from app.core.game import BaseGame
from app.core.models import (
    GameState, Player, GameResult,
    GamePhase, Role, GameEvent
)
from app.core.boards import (
    BOARD_PRESETS,
    GOD_ROLES,
    WOLF_ROLES,
    resolve_board_config,
)
from app.core.werewolf_visibility import VisibilityMixin
from app.core.werewolf_actions import AvailableActionsMixin
from app.core.werewolf_apply import ApplyActionMixin
from app.core.werewolf_phases import PhaseFlowMixin


class WerewolfGame(
    VisibilityMixin,
    AvailableActionsMixin,
    ApplyActionMixin,
    PhaseFlowMixin,
    BaseGame,
):
    """狼人杀游戏实现。"""

    def __init__(self):
        self.game_id: str = ""
        self.state: Optional[GameState] = None
        self.config: Dict = {}
        self.last_night_kill: Optional[str] = None
        self.current_votes: Dict[str, Optional[str]] = {}
        self.tie_candidates: List[str] = []
        self.acted_players = set()
        self.rng = random.Random()
        self.board_id = "5p"
        self.board = resolve_board_config(self.board_id)
        self.night_stage = (
            "charm" if Role.WOLF_BEAUTY in self.board["roles"]
            else "guard" if Role.GUARD in self.board["roles"]
            else "wolves"
        )
        self.wolf_votes: Dict[str, str] = {}
        self.guarded_target: Optional[str] = None
        self.guard_last_target: Optional[str] = None
        self.witch_healed = False
        self.witch_poison_target: Optional[str] = None
        self.witch_antidote_available = True
        self.witch_poison_available = True
        self.pending_death_skills: List[str] = []
        self.death_skill_actor: Optional[str] = None
        self.pending_last_words: List[str] = []
        self.last_words_actor: Optional[str] = None
        self.sheriff_enabled = False
        self.sheriff_election_done = False
        self.sheriff_id: Optional[str] = None
        self.sheriff_runners: List[str] = []
        self.sheriff_candidates: List[str] = []
        self.sheriff_withdrawn: List[str] = []
        self.sheriff_voters: List[str] = []
        self.sheriff_tie_candidates: List[str] = []
        self.badge_transfer_actor: Optional[str] = None
        self.seat_order: List[str] = []
        self.last_night_deaths: List[str] = []
        self.day_speech_order: List[str] = []
        self.speech_direction: Optional[str] = None
        self.sheriff_nomination: Optional[str] = None
        self.resume_phase: Optional[GamePhase] = None
        self.day_interrupted = False
        self.day_interrupt_window = False
        self.forced_winner: Optional[str] = None
        self.forced_win_reason: Optional[str] = None
        self.charmed_target: Optional[str] = None
        self.knight_duel_used = False
        self.knight_duel_ends_day = False
        self.max_rounds = 20
        self.round_limit_reached = False

    def initialize(self, players: List[str], config: Dict) -> None:
        """初始化游戏"""
        self.board_id = config.get("board_id", "5p")
        board = resolve_board_config(self.board_id, config.get("custom_board"))
        self.board = board
        if len(players) != len(board["roles"]):
            raise ValueError(f"{board['name']}需要恰好{len(board['roles'])}名玩家")

        self.game_id = config.get("game_id", "")
        self.config = config
        self.max_rounds = max(1, int(config.get("max_rounds", 20)))
        self.round_limit_reached = False
        self.sheriff_enabled = bool(config.get("enable_sheriff", False))
        self.seat_order = list(players)

        # 设置随机种子（可复现性）
        seed = config.get("seed")
        self.rng = random.Random(seed)

        roles = list(board["roles"])
        self.night_stage = (
            "charm" if Role.WOLF_BEAUTY in roles
            else "guard" if Role.GUARD in roles
            else "wolves"
        )
        self.rng.shuffle(roles)

        # 创建玩家对象
        player_objs = {}
        for player_id, role in zip(players, roles):
            player_objs[player_id] = Player(id=player_id, role=role)

        # 初始化游戏状态
        self.state = GameState(
            game_id=self.game_id,
            phase=GamePhase.NIGHT,
            round=1,
            players=player_objs,
            alive_players=players.copy(),
            dead_players=[]
        )

        # 记录角色分配事件
        role_assignment = {pid: p.role.value for pid, p in player_objs.items()}
        self.state.events.append(GameEvent(
            event_type="game_start",
            data={
                "game_id": self.game_id,
                "players": players,
                "board_id": self.board_id,
                "board_name": board["name"],
                "sheriff_enabled": self.sheriff_enabled,
                "role_assignment": role_assignment
            },
            visibility="private",
            visible_to=["admin"]  # 只有管理员能看到完整角色分配
        ))

    def check_win_condition(self) -> Optional[GameResult]:
        """检查胜利条件"""
        if not self.state:
            return None

        if self.forced_winner:
            return GameResult(
                game_id=self.game_id,
                winner=self.forced_winner,
                final_round=self.state.round,
                reason=self.forced_win_reason or "priority_win",
                duration_seconds=0.0,
            )

        if self._has_pending_resolution() or self.state.phase in (
            GamePhase.DEATH_SKILL,
            GamePhase.BADGE_TRANSFER,
        ):
            return None

        if self.round_limit_reached:
            return GameResult(
                game_id=self.game_id,
                winner="draw",
                final_round=self.state.round,
                reason="max_rounds_reached",
                duration_seconds=0.0,
            )

        werewolves_alive = sum(
            1 for p in self.state.players.values()
            if p.is_alive and p.role in WOLF_ROLES
        )
        good_alive = sum(
            1 for p in self.state.players.values()
            if p.is_alive and p.role not in WOLF_ROLES
        )

        if werewolves_alive == 0:
            return GameResult(
                game_id=self.game_id,
                winner="good",
                final_round=self.state.round,
                reason="all_werewolves_eliminated",
                duration_seconds=0.0
            )

        if self.board["win_rule"] == "edge":
            villagers_alive = sum(
                1 for p in self.state.players.values()
                if p.is_alive and p.role == Role.VILLAGER
            )
            gods_alive = sum(
                1 for p in self.state.players.values()
                if p.is_alive and p.role in GOD_ROLES
            )
            wolf_wins = villagers_alive == 0 or gods_alive == 0
            reason = "all_villagers_or_gods_eliminated"
        else:
            wolf_wins = werewolves_alive >= good_alive
            reason = "werewolves_outnumber_villagers"

        if wolf_wins:
            return GameResult(
                game_id=self.game_id,
                winner="werewolf",
                final_round=self.state.round,
                reason=reason,
                duration_seconds=0.0
            )

        return None

    def _edge_completed(self) -> bool:
        if self.board["win_rule"] != "edge":
            return False
        villagers_alive = any(
            p.is_alive and p.role == Role.VILLAGER
            for p in self.state.players.values()
        )
        gods_alive = any(
            p.is_alive and p.role in GOD_ROLES
            for p in self.state.players.values()
        )
        return not villagers_alive or not gods_alive

    def _force_winner(self, winner: str, reason: str) -> None:
        if self.forced_winner is None:
            self.forced_winner = winner
            self.forced_win_reason = reason

    def get_game_summary(self) -> Dict:
        """获取游戏总结"""
        if not self.state:
            return {}

        return {
            "game_id": self.game_id,
            "board_id": self.board_id,
            "board_name": self.board["name"],
            "sheriff_enabled": self.sheriff_enabled,
            "final_sheriff": self.sheriff_id,
            "total_rounds": self.state.round,
            "total_events": len(self.state.events),
            "total_speeches": len(self.state.speeches),
            "survivors": self.state.alive_players,
            "casualties": self.state.dead_players
        }

    def is_ended(self) -> bool:
        """检查游戏是否结束"""
        return self.check_win_condition() is not None

    def record_game_end(self, result) -> Dict:
        """
        对局终结时追加 game_end 事件（含胜负/轮次/时长），并写入事件流。
        返回事件字典，供 orchestrator 广播给所有智能体记忆。
        """
        end_event = {
            "event_type": "game_end",
            "data": {
                "winner": result.winner,
                "reason": result.reason,
                "final_round": result.final_round,
                "duration_seconds": result.duration_seconds,
            },
            "visibility": "public",
        }
        self.state.events.append(GameEvent(**end_event))
        return end_event
