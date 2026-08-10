"""
Core game models and data structures
"""
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import datetime


class GamePhase(Enum):
    """游戏阶段"""
    SETUP = "setup"
    NIGHT = "night"
    SHERIFF_CAMPAIGN = "sheriff_campaign"
    SHERIFF_WITHDRAWAL = "sheriff_withdrawal"
    SHERIFF_VOTING = "sheriff_voting"
    SHERIFF_TIEBREAK_SPEECH = "sheriff_tiebreak_speech"
    SHERIFF_TIEBREAK_VOTING = "sheriff_tiebreak_voting"
    BADGE_TRANSFER = "badge_transfer"
    SPEECH_ORDER = "speech_order"
    DAY = "day"
    SHERIFF_SUMMARY = "sheriff_summary"
    VOTING = "voting"
    TIEBREAK_SPEECH = "tiebreak_speech"
    TIEBREAK_VOTING = "tiebreak_voting"
    DEATH_SKILL = "death_skill"
    LAST_WORDS = "last_words"
    KNIGHT_DUEL = "knight_duel"
    ENDED = "ended"


class Role(Enum):
    """角色"""
    WEREWOLF = "werewolf"
    SEER = "seer"
    WITCH = "witch"
    HUNTER = "hunter"
    IDIOT = "idiot"
    GUARD = "guard"
    WHITE_WOLF_KING = "white_wolf_king"
    WOLF_KING = "wolf_king"
    WOLF_BEAUTY = "wolf_beauty"
    KNIGHT = "knight"
    VILLAGER = "villager"


class ActionType(Enum):
    """动作类型"""
    KILL = "kill"
    WOLF_SPEAK = "wolf_speak"
    INVESTIGATE = "investigate"
    HEAL = "heal"
    POISON = "poison"
    GUARD = "guard"
    CHARM = "charm"
    DUEL = "duel"
    SHOOT = "shoot"
    SELF_DESTRUCT = "self_destruct"
    PASS = "pass"
    SPEAK = "speak"
    VOTE = "vote"
    ABSTAIN = "abstain"
    WITHDRAW = "withdraw"
    TRANSFER_BADGE = "transfer_badge"
    DESTROY_BADGE = "destroy_badge"
    ORDER_CLOCKWISE = "order_clockwise"
    ORDER_COUNTERCLOCKWISE = "order_counterclockwise"


@dataclass
class GameAction:
    """游戏动作"""
    action_type: ActionType
    actor_id: str
    target_id: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict:
        return {
            "action_type": self.action_type.value,
            "actor_id": self.actor_id,
            "target_id": self.target_id,
            "parameters": self.parameters,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class GameEvent:
    """游戏事件"""
    event_type: str
    data: Dict[str, Any]
    visibility: str = "public"  # "public", "private"
    visible_to: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict:
        return {
            "event_type": self.event_type,
            "data": self.data,
            "visibility": self.visibility,
            "visible_to": self.visible_to,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class Player:
    """玩家"""
    id: str
    role: Role
    is_alive: bool = True
    can_vote: bool = True
    investigation_results: List[Dict] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "role": self.role.value,
            "is_alive": self.is_alive,
            "can_vote": self.can_vote
        }


@dataclass
class GameConfig:
    """游戏配置"""
    game_id: str
    num_players: int = 5
    seed: Optional[int] = None
    model_configs: Dict[str, Dict] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "game_id": self.game_id,
            "num_players": self.num_players,
            "seed": self.seed,
            "model_configs": self.model_configs
        }


@dataclass
class GameState:
    """游戏状态"""
    game_id: str
    phase: GamePhase
    round: int
    players: Dict[str, Player]
    alive_players: List[str]
    dead_players: List[str]
    events: List[GameEvent] = field(default_factory=list)
    speeches: List[Dict] = field(default_factory=list)
    vote_results: List[Dict] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "game_id": self.game_id,
            "phase": self.phase.value,
            "round": self.round,
            "players": {pid: p.to_dict() for pid, p in self.players.items()},
            "alive_players": self.alive_players,
            "dead_players": self.dead_players,
            "events": [e.to_dict() for e in self.events],
            "speeches": self.speeches,
            "vote_results": self.vote_results
        }


@dataclass
class GameResult:
    """游戏结果"""
    game_id: str
    winner: str  # "good" or "werewolf"
    final_round: int
    reason: str
    duration_seconds: float
    summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "game_id": self.game_id,
            "winner": self.winner,
            "final_round": self.final_round,
            "reason": self.reason,
            "duration_seconds": self.duration_seconds,
            "summary": self.summary
        }
