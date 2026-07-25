"""
Game Orchestrator
Manages game lifecycle and coordinates AI agents
"""
import asyncio
import os
from typing import Dict, List
from app.core.werewolf import WerewolfGame
from app.core.agent import AIAgent
from app.core.models import GamePhase, GameResult
from app.llm.registry import get_registry
from app.llm.openai_client import OpenAICompatibleClient, OllamaClient
from app.llm.claude_client import ClaudeClient
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
        registry = get_registry()
        default_provider = registry.default_provider
        default_model = registry.default_model

        for player_id in players:
            model_config = self.config.get("model_configs", {}).get(
                player_id,
                {"provider": default_provider, "model": default_model}
            )
            client = self._create_client(model_config, registry)
            self.agents[player_id] = AIAgent(player_id, client)

    def _create_client(self, model_config: Dict, registry):
        """
        根据 model_config 创建 LLM 客户端。

        支持两种配置方式（优先级从高到低）：

        1. 用户直填（推荐，任何端点都能用）：
           {
             "api_format": "openai" | "anthropic",  # 接口格式，二选一
             "base_url": "https://your-endpoint/v1", # 用户自己填
             "model": "model-name",                  # 用户自己填
             "api_key": "sk-xxx"                     # 可选；不填则按 key_env 取
           }
           只要给了 base_url，就走这条路径——不查 yaml、不受 provider 白名单限制，
           任何 OpenAI/Anthropic 格式的端点（官方、中转、自建、聚合、本地）都能跑。

        2. provider 名兜底（方便快捷）：
           {"provider": "deepseek", "model": "deepseek-v4-flash"}
           从 config/models.yaml 查 base_url/协议/定价/key_env。
           适合用 yaml 里预定义好的常见 provider。
        """
        # ---- 路径 1：用户直填（只要给了 base_url 就完全听用户的）----
        if model_config.get("base_url"):
            return self._create_client_from_explicit(model_config)

        # ---- 路径 2：provider 名兜底（查 yaml）----
        return self._create_client_from_registry(model_config, registry)

    def _create_client_from_explicit(self, model_config: Dict):
        """用户直填路径：完全按用户给的 api_format/base_url/model 构造 client。"""
        api_format = model_config.get("api_format", "openai")
        base_url = model_config["base_url"]
        model_name = model_config["model"]

        # api_key：优先用户在配置里直接给的；否则按 key_env 取环境变量；都没有用占位符
        api_key = model_config.get("api_key")
        if not api_key:
            key_env = model_config.get("key_env")
            if key_env:
                api_key = os.getenv(key_env)
                if not api_key:
                    raise ValueError(
                        f"配置了 key_env={key_env!r}，但该环境变量未设置。"
                    )
            else:
                api_key = "dummy"  # 本地端点（如 Ollama）可能不需要 key

        # 定价：用户填了就用，没填默认 0（不强制，成本统计只是参考）
        cost_in = model_config.get("cost_per_1m_input", 0.0)
        cost_out = model_config.get("cost_per_1m_output", 0.0)

        if api_format == "openai":
            return OpenAICompatibleClient(
                api_key=api_key, model=model_name, base_url=base_url,
                cost_per_1m_input=cost_in, cost_per_1m_output=cost_out,
            )
        elif api_format == "anthropic":
            return ClaudeClient(
                api_key=api_key, model=model_name,
                cost_per_1m_input=cost_in, cost_per_1m_output=cost_out,
            )
        else:
            raise ValueError(
                f"api_format 只支持 'openai' 或 'anthropic'，收到 {api_format!r}。"
            )

    def _create_client_from_registry(self, model_config: Dict, registry):
        """provider 名兜底路径：从 config/models.yaml 查配置构造 client。"""
        provider_name = model_config["provider"]
        model_name = model_config["model"]

        if provider_name not in registry:
            raise ValueError(
                f"未知的 provider: {provider_name}。"
                f"请在 config/models.yaml 中配置，或直接在 model_config 里填 "
                f"api_format + base_url + model 自定义端点。"
                f"已注册: {list(registry.providers.keys())}"
            )

        prov = registry[provider_name]
        model_info = registry.get_model_info(provider_name, model_name)
        if model_info is None:
            raise ValueError(
                f"provider {provider_name} 下未配置模型 {model_name}。"
                f"请在 config/models.yaml 中添加，或直接填 base_url + model 自定义。"
            )

        # 读取 API key（无 key_env 的 provider 如 Ollama 用占位符）
        api_key = "dummy"
        if prov.api_key_env:
            api_key = os.getenv(prov.api_key_env)
            if not api_key:
                raise ValueError(
                    f"provider {provider_name} 需要环境变量 {prov.api_key_env}，但未设置。"
                )

        # 按 protocol 路由到对应 client
        if prov.protocol == "openai":
            return OpenAICompatibleClient(
                api_key=api_key,
                model=model_name,
                base_url=prov.api_base,
                cost_per_1m_input=model_info.cost_in,
                cost_per_1m_output=model_info.cost_out,
            )
        elif prov.protocol == "anthropic":
            return ClaudeClient(
                api_key=api_key,
                model=model_name,
                cost_per_1m_input=model_info.cost_in,
                cost_per_1m_output=model_info.cost_out,
            )
        else:
            raise ValueError(
                f"provider {provider_name} 的 protocol {prov.protocol!r} 不支持。"
                f"仅支持 'openai' 或 'anthropic'。"
            )

    async def run_game(self) -> Dict:
        """运行完整游戏"""
        self.start_time = time.time()

        try:
            result = None
            max_rounds = int(self.config.get("max_rounds", 20))
            while not self.game.is_ended():
                if self.game.state.round > max_rounds:
                    result = GameResult(self.game_id, "draw", self.game.state.round - 1,
                                        "max_rounds_reached", 0.0)
                    break
                await self.execute_round()

            self.end_time = time.time()

            # 获取游戏结果
            result = result or self.game.check_win_condition()
            if result:
                result.duration_seconds = self.end_time - self.start_time
                result.summary = self.game.get_game_summary()
                self.game.state.phase = GamePhase.ENDED

                # 追加 game_end 事件，标记对局终结（供前端观战界面识别结束态）
                end_event = self.game.record_game_end(result)
                self._broadcast_events([end_event])

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

        elif self.game.state.phase == GamePhase.TIEBREAK_SPEECH:
            await self.execute_day_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.TIEBREAK_VOTING:
            await self.execute_voting_phase()
            self._broadcast_events(self.game.advance_phase())

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
