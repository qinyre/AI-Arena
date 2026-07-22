"""
Game Orchestrator
Manages game lifecycle and coordinates AI agents
"""
import asyncio
from typing import Dict, List
from app.core.werewolf import WerewolfGame
from app.core.agent import AIAgent
from app.core.models import GamePhase, ActionType
from app.llm.openai_client import OpenAIClient, OllamaClient
import time


class GameOrchestrator:
    """游戏编排器"""

    def __init__(self, game_id: str, config: Dict):
        """
        初始化编排器

        Args:
            game_id: 游戏ID
            config: 游戏配置
        """
        self.game_id = game_id
        self.config = config
        self.game = WerewolfGame()
        self.agents: Dict[str, AIAgent] = {}
        self.start_time = None
        self.end_time = None

    async def initialize(self):
        """初始化游戏和AI智能体"""
        # 初始化游戏
        players = self.config.get("players", [])
        self.game.initialize(players, self.config)

        # 创建AI智能体
        for player_id in players:
            model_config = self.config.get("model_configs", {}).get(
                player_id,
                {"provider": "openai", "model": "gpt-4o-mini"}
            )

            # 创建LLM客户端
            if model_config["provider"] == "openai":
                import os
                client = OpenAIClient(
                    api_key=os.getenv("OPENAI_API_KEY"),
                    model=model_config["model"]
                )
            elif model_config["provider"] == "ollama":
                client = OllamaClient(
                    model=model_config["model"]
                )
            else:
                raise ValueError(f"Unsupported provider: {model_config['provider']}")

            # 创建智能体
            self.agents[player_id] = AIAgent(player_id, client)

    async def run_game(self) -> Dict:
        """运行完整游戏"""
        self.start_time = time.time()

        try:
            while not self.game.is_ended():
                await self.execute_round()

            self.end_time = time.time()

            # 获取游戏结果
            result = self.game.check_win_condition()
            if result:
                result.duration_seconds = self.end_time - self.start_time
                result.summary = self.game.get_game_summary()

            return result.to_dict() if result else {}

        except Exception as e:
            print(f"游戏运行错误: {e}")
            raise

    async def execute_round(self):
        """执行一轮游戏"""
        if self.game.state.phase == GamePhase.NIGHT:
            await self.execute_night_phase()
            events = self.game.advance_phase()
            self._broadcast_events(events)

        elif self.game.state.phase == GamePhase.DAY:
            await self.execute_day_phase()
            events = self.game.advance_phase()
            self._broadcast_events(events)

        elif self.game.state.phase == GamePhase.VOTING:
            await self.execute_voting_phase()
            events = self.game.advance_phase()
            self._broadcast_events(events)

    async def execute_night_phase(self):
        """执行夜晚阶段"""
        print(f"\n=== 第{self.game.state.round}轮 - 夜晚 ===")

        # 所有活着的玩家同时行动
        tasks = []
        for player_id in self.game.state.alive_players:
            agent = self.agents[player_id]
            visible_state = self.game.get_visible_state(player_id)
            available_actions = self.game.get_available_actions(player_id)

            if available_actions:
                tasks.append(self._agent_act(agent, visible_state, available_actions))

        # 并发执行
        if tasks:
            await asyncio.gather(*tasks)

    async def execute_day_phase(self):
        """执行白天发言阶段"""
        print(f"\n=== 第{self.game.state.round}轮 - 白天 ===")

        # 依次发言
        for player_id in self.game.state.alive_players:
            agent = self.agents[player_id]
            visible_state = self.game.get_visible_state(player_id)
            available_actions = self.game.get_available_actions(player_id)

            if available_actions:
                await self._agent_act(agent, visible_state, available_actions)

    async def execute_voting_phase(self):
        """执行投票阶段"""
        print(f"\n=== 第{self.game.state.round}轮 - 投票 ===")

        # 所有活着的玩家同时投票
        tasks = []
        for player_id in self.game.state.alive_players:
            agent = self.agents[player_id]
            visible_state = self.game.get_visible_state(player_id)
            available_actions = self.game.get_available_actions(player_id)

            if available_actions:
                tasks.append(self._agent_act(agent, visible_state, available_actions))

        if tasks:
            await asyncio.gather(*tasks)

    async def _agent_act(
        self,
        agent: AIAgent,
        visible_state: Dict,
        available_actions: List[Dict]
    ):
        """AI智能体执行动作"""
        try:
            # AI决策
            action = await agent.decide(visible_state, available_actions)

            # 应用动作
            events = self.game.apply_action(action)

            # 更新智能体记忆
            for event in events:
                agent.update_memory(event)

            # 打印动作（调试）
            print(f"  {agent.agent_id}: {action.action_type.value} -> {action.target_id}")

        except Exception as e:
            print(f"  {agent.agent_id} 动作失败: {e}")

    def _broadcast_events(self, events: List[Dict]):
        """广播事件（更新所有智能体的记忆）"""
        for event in events:
            visibility = event.get("visibility", "public")

            if visibility == "public":
                # 公开事件所有人都能看到
                for agent in self.agents.values():
                    agent.update_memory(event)
            elif visibility == "private":
                # 私密事件只有特定玩家能看到
                visible_to = event.get("visible_to", [])
                for player_id in visible_to:
                    if player_id in self.agents:
                        self.agents[player_id].update_memory(event)

    def get_total_cost(self) -> float:
        """获取总成本"""
        total_cost = 0.0
        for agent in self.agents.values():
            usage = agent.model_client.get_total_usage()
            total_cost += usage.get("estimated_cost", 0.0)
        return total_cost
