"""
Base Game Abstract Interface
All games must implement this interface
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any
from app.core.models import GameAction, GameState, Player, GameResult


class BaseGame(ABC):
    """所有游戏的抽象基类"""

    @abstractmethod
    def initialize(self, players: List[str], config: Dict) -> None:
        """
        初始化游戏，分配角色

        Args:
            players: 玩家ID列表
            config: 游戏配置（包含随机种子等）
        """
        pass

    @abstractmethod
    def get_visible_state(self, player_id: str) -> Dict[str, Any]:
        """
        获取特定玩家可见的游戏状态（信息过滤）

        Args:
            player_id: 玩家ID

        Returns:
            过滤后的游戏状态字典
        """
        pass

    @abstractmethod
    def get_available_actions(self, player_id: str) -> List[Dict]:
        """
        获取玩家当前可执行的动作列表

        Args:
            player_id: 玩家ID

        Returns:
            可选动作列表（JSON Schema格式）
        """
        pass

    @abstractmethod
    def is_valid_action(self, action: GameAction) -> bool:
        """
        验证动作是否合法

        Args:
            action: 游戏动作

        Returns:
            是否合法
        """
        pass

    @abstractmethod
    def apply_action(self, action: GameAction) -> List[Dict]:
        """
        应用动作，返回产生的事件列表

        Args:
            action: 游戏动作

        Returns:
            事件列表
        """
        pass

    @abstractmethod
    def check_win_condition(self) -> Optional[GameResult]:
        """
        检查胜利条件

        Returns:
            如果游戏结束，返回游戏结果；否则返回None
        """
        pass

    @abstractmethod
    def get_game_summary(self) -> Dict:
        """
        返回游戏总结数据

        Returns:
            总结数据字典
        """
        pass

    @abstractmethod
    def is_ended(self) -> bool:
        """
        检查游戏是否结束

        Returns:
            是否结束
        """
        pass

    def get_current_player(self) -> Optional[str]:
        """
        获取当前行动的玩家ID

        Returns:
            玩家ID或None
        """
        pass
