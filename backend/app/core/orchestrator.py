"""
Game Orchestrator
Manages game lifecycle and coordinates AI agents
"""
import asyncio
import os
from typing import Dict, List, Optional
from urllib.parse import urlparse
from app.core.werewolf import WOLF_ROLES, WerewolfGame
from app.core.agent import AIAgent
from app.core.models import ActionType, GameEvent, GamePhase, Role
from app.llm.registry import get_registry
from app.llm.openai_client import OpenAICompatibleClient
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
        self.call_metrics: List[Dict] = []
        self.max_output_tokens = int(
            config.get("ai_max_output_tokens") or os.getenv("AI_MAX_OUTPUT_TOKENS", "1200")
        )
        self.player_token_budget = int(
            config.get("ai_player_token_budget") or os.getenv("AI_PLAYER_TOKEN_BUDGET", "80000")
        )
        self.game_token_budget = int(
            config.get("ai_game_token_budget") or os.getenv("AI_GAME_TOKEN_BUDGET", "500000")
        )
        self.circuit_breaker_failures = int(
            config.get("ai_circuit_breaker_failures")
            or os.getenv("AI_CIRCUIT_BREAKER_FAILURES", "2")
        )
        self._run_gate = asyncio.Event()
        self._run_gate.set()
        self._budget_lock = asyncio.Lock()
        self._budget_reservation_seq = 0
        self._budget_reservations: Dict[int, tuple[str, int]] = {}
        self._reserved_game_tokens = 0
        self._reserved_player_tokens: Dict[str, int] = {}
        self._settled_game_tokens = 0
        self._settled_player_tokens: Dict[str, int] = {}

    def pause(self):
        self._run_gate.clear()

    def resume(self):
        self._run_gate.set()

    async def wait_if_paused(self):
        await self._run_gate.wait()

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
            output_limit = (
                max(self.max_output_tokens, 8192)
                if str(model_config.get("model", "")).casefold() == "step-3.7-flash"
                else self.max_output_tokens
            )
            self.agents[player_id] = AIAgent(
                player_id,
                client,
                personality=model_config.get("personality"),
                prompt_variant=model_config.get("prompt_variant"),
                max_output_tokens=output_limit,
                player_token_budget=self.player_token_budget,
                budget_reserve=self._reserve_model_tokens,
                budget_settle=self._settle_model_tokens,
                circuit_breaker_failures=self.circuit_breaker_failures,
            )

    @staticmethod
    def _create_client(model_config: Dict, registry):
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
            return GameOrchestrator._create_client_from_explicit(model_config)

        # ---- 路径 2：provider 名兜底（查 yaml）----
        return GameOrchestrator._create_client_from_registry(model_config, registry)

    @staticmethod
    def _create_client_from_explicit(model_config: Dict):
        """用户直填路径：完全按用户给的 api_format/base_url/model 构造 client。"""
        api_format = model_config.get("api_format", "openai")
        base_url = model_config["base_url"]
        model_name = model_config["model"]

        # api_key：优先用户在配置里直接给的；否则按 key_env 取环境变量；都没有用占位符
        api_key = (model_config.get("api_key") or "").strip() or None
        if not api_key:
            key_env = model_config.get("key_env")
            if key_env:
                api_key = (os.getenv(key_env) or "").strip() or None
                if not api_key:
                    raise ValueError(
                        f"配置了 key_env={key_env!r}，但该环境变量未设置。"
                    )
            elif (
                api_format == "anthropic"
                and (urlparse(base_url).hostname or "").lower()
                not in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError(
                    "Anthropic 远程端点必须填写 API Key；"
                    "请在模型预设中补充 Key 后重试。"
                )
            else:
                api_key = "dummy"  # 无需鉴权的兼容端点使用占位 key

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
                api_key=api_key, model=model_name, base_url=base_url,
                cost_per_1m_input=cost_in, cost_per_1m_output=cost_out,
            )
        else:
            raise ValueError(
                f"api_format 只支持 'openai' 或 'anthropic'，收到 {api_format!r}。"
            )

    @staticmethod
    def _create_client_from_registry(model_config: Dict, registry):
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

        # 读取 API key（无 key_env 时使用占位符）
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
                base_url=prov.api_base,
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
            while not self.game.is_ended():
                await self.wait_if_paused()
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

        elif self.game.state.phase in (
            GamePhase.SPEECH_ORDER,
            GamePhase.SHERIFF_SUMMARY,
        ):
            await self.execute_sheriff_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase in (
            GamePhase.SHERIFF_CAMPAIGN,
            GamePhase.SHERIFF_TIEBREAK_SPEECH,
        ):
            await self.execute_day_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.SHERIFF_WITHDRAWAL:
            await self.execute_sheriff_withdrawal_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase in (
            GamePhase.VOTING,
            GamePhase.SHERIFF_VOTING,
            GamePhase.SHERIFF_TIEBREAK_VOTING,
        ):
            await self.execute_voting_phase()
            events = self.game.advance_phase()
            self._broadcast_events(events)

        elif self.game.state.phase == GamePhase.TIEBREAK_SPEECH:
            await self.execute_day_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.TIEBREAK_VOTING:
            await self.execute_voting_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.DEATH_SKILL:
            await self.execute_death_skill_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.LAST_WORDS:
            await self.execute_last_words_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.BADGE_TRANSFER:
            await self.execute_badge_transfer_phase()
            self._broadcast_events(self.game.advance_phase())

        elif self.game.state.phase == GamePhase.KNIGHT_DUEL:
            await self.execute_knight_duel_phase()
            self._broadcast_events(self.game.advance_phase())

    async def execute_night_phase(self):
        """执行夜晚阶段"""
        print(f"\n=== 第{self.game.state.round}轮 - 夜晚 ===")

        # 主持人口令顺序：狼美人魅惑 → 守卫 → 狼队密聊/投刀 → 女巫 → 预言家。
        # 不含对应角色的板型在该阶段不会产生动作或模型调用。
        for stage in ("charm", "guard", "wolf_discussion", "wolves", "witch", "seer"):
            self.game.night_stage = stage
            self.game.acted_players = set()
            if stage == "wolf_discussion":
                alive_wolves = [
                    player_id
                    for player_id in self.game.state.alive_players
                    if self.game.state.players[player_id].role in WOLF_ROLES
                ]
                # 单狼没有队友可交流，跳过一次无意义且计费的模型调用。
                if len(alive_wolves) < 2:
                    continue
                # 依次密聊，确保后发言狼人能看到前面队友的意见。
                for player_id in alive_wolves:
                    available_actions = self.game.get_available_actions(player_id)
                    if available_actions:
                        await self._agent_act(
                            self.agents[player_id],
                            self.game.get_visible_state(player_id),
                            available_actions,
                        )
                continue
            tasks = []
            for player_id in list(self.game.state.alive_players):
                available_actions = self.game.get_available_actions(player_id)
                if available_actions:
                    tasks.append(self._agent_act(
                        self.agents[player_id],
                        self.game.get_visible_state(player_id),
                        available_actions,
                    ))
            if tasks:
                await asyncio.gather(*tasks)
            if stage == "wolves":
                self.game.finalize_wolf_vote()

    async def execute_knight_duel_phase(self):
        """全员发言后、放逐投票前，给未发动技能的存活骑士一次决斗窗口。"""
        knight_id = next((
            player_id
            for player_id in self.game.state.alive_players
            if self.game.state.players[player_id].role == Role.KNIGHT
        ), None)
        if not knight_id:
            return
        actions = self.game.get_available_actions(knight_id)
        if actions:
            await self._agent_act(
                self.agents[knight_id],
                self.game.get_visible_state(knight_id),
                actions,
            )

    async def execute_day_phase(self):
        """执行白天发言阶段"""
        print(f"\n=== 第{self.game.state.round}轮 - 白天 ===")

        # 依次发言
        order = (
            self.game.day_speech_order or self.game.state.alive_players
            if self.game.state.phase == GamePhase.DAY
            else self.game.state.alive_players
        )
        for player_id in list(order):
            agent = self.agents[player_id]
            visible_state = self.game.get_visible_state(player_id)
            available_actions = self.game.get_available_actions(player_id)

            action = None
            if available_actions:
                action = await self._agent_act(agent, visible_state, available_actions)
            if self.game.day_interrupted:
                break
            if (
                action
                and action.action_type == ActionType.SPEAK
                and self.game.state.players[player_id].role.value != "white_wolf_king"
                and await self._offer_white_wolf_interrupt()
            ):
                break

    async def execute_sheriff_phase(self):
        """执行警长选序或归票；无警长时由规则引擎直接推进。"""
        player_id = self.game.sheriff_id
        if player_id not in self.game.state.alive_players:
            return
        actions = self.game.get_available_actions(player_id)
        if actions:
            await self._agent_act(
                self.agents[player_id],
                self.game.get_visible_state(player_id),
                actions,
            )
        if (
            self.game.state.phase == GamePhase.SHERIFF_SUMMARY
            and not self.game.day_interrupted
            and self.game.state.players[player_id].role.value != "white_wolf_king"
        ):
            await self._offer_white_wolf_interrupt()

    async def execute_sheriff_withdrawal_phase(self):
        """所有警上玩家听完竞选发言后，依次决定退水或继续竞选。"""
        for player_id in list(self.game.sheriff_candidates):
            actions = self.game.get_available_actions(player_id)
            if actions:
                await self._agent_act(
                    self.agents[player_id],
                    self.game.get_visible_state(player_id),
                    actions,
                )
            if self.game.day_interrupted:
                break

    async def execute_last_words_phase(self):
        """首夜死亡或白天被放逐的玩家发表遗言。"""
        player_id = self.game.last_words_actor
        if not player_id:
            return
        actions = self.game.get_available_actions(player_id)
        if actions:
            await self._agent_act(
                self.agents[player_id],
                self.game.get_visible_state(player_id),
                actions,
            )

    async def _offer_white_wolf_interrupt(self) -> bool:
        """每次其他玩家发言后，给存活白狼王一个即时自爆窗口。"""
        white_wolf = next(
            (
                player_id
                for player_id in self.game.state.alive_players
                if self.game.state.players[player_id].role.value == "white_wolf_king"
            ),
            None,
        )
        if not white_wolf:
            return False

        day_acted = set(self.game.acted_players)
        self.game.day_interrupt_window = True
        self.game.acted_players = set()
        try:
            actions = self.game.get_available_actions(white_wolf)
            if actions:
                await self._agent_act(
                    self.agents[white_wolf],
                    self.game.get_visible_state(white_wolf),
                    actions,
                )
        finally:
            self.game.day_interrupt_window = False
            if not self.game.day_interrupted:
                self.game.acted_players = day_acted
        return self.game.day_interrupted

    async def execute_death_skill_phase(self):
        """猎人/狼王死亡后依次发动技能。"""
        player_id = self.game.death_skill_actor
        if not player_id:
            return
        actions = self.game.get_available_actions(player_id)
        if actions:
            await self._agent_act(
                self.agents[player_id],
                self.game.get_visible_state(player_id),
                actions,
            )

    async def execute_badge_transfer_phase(self):
        """死亡警长移交或撕毁警徽。"""
        player_id = self.game.badge_transfer_actor
        if not player_id:
            return
        actions = self.game.get_available_actions(player_id)
        if actions:
            await self._agent_act(
                self.agents[player_id],
                self.game.get_visible_state(player_id),
                actions,
            )

    async def execute_voting_phase(self):
        """执行投票阶段。

        所有玩家【盲投】并发投票——投票期间任何人都看不到他人的投票
        对象和理由（符合真实狼人杀规则）。投票结束后才统一公布结果
        （每人投了谁）。因此用并发 gather，且 visible_state 在投票开始前
        统一生成，投票过程中产生的新 player_vote 事件不喂给同阶段其他玩家。
        """
        print(f"\n=== 第{self.game.state.round}轮 - 投票（盲投） ===")

        # 并发盲投。注意：visible_state 在此循环内逐个生成，但因并发执行，
        # 各玩家的 get_visible_state 看到的都是投票前的状态（互不可见）。
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
            await self.wait_if_paused()
            # AI决策
            action = await agent.decide(visible_state, available_actions)
            decision_metrics = dict(getattr(agent, "last_decision_metrics", {}))
            decision_metrics.update({
                "player": agent.agent_id,
                "round": self.game.state.round,
                "phase": self.game.state.phase.value,
                "night_stage": self.game.night_stage,
                "action": action.action_type.value,
                "fallback": bool(getattr(agent, "last_decision_error", None)),
            })
            self.call_metrics.append(decision_metrics)

            # 应用动作
            events = self.game.apply_action(action)
            diagnostic_data = getattr(agent, "last_decision_error", None)
            if diagnostic_data:
                diagnostic = GameEvent(
                    event_type="agent_fallback",
                    data={
                        "player": agent.agent_id,
                        "round": self.game.state.round,
                        "phase": self.game.state.phase.value,
                        "message": diagnostic_data["reason"],
                        "attempts": diagnostic_data["attempts"],
                        "usage": diagnostic_data["usage"],
                        "response_excerpt": diagnostic_data["response_excerpt"],
                        "finish_reason": diagnostic_data["finish_reason"],
                        "fallback_action": action.action_type.value,
                    },
                    visibility="private",
                    visible_to=["admin"],
                )
                self.game.state.events.append(diagnostic)
                print(f"  [FALLBACK] {agent.agent_id}: {diagnostic_data['reason']}", flush=True)

            # 更新智能体记忆
            for event in events:
                agent.update_memory(event)

            # 打印动作（调试）
            print(f"  {agent.agent_id}: {action.action_type.value} -> {action.target_id}")
            return action

        except Exception as e:
            import traceback
            print(f"  [DIAG] {agent.agent_id} 动作失败: {type(e).__name__}: {e}", flush=True)
            traceback.print_exc()
            return None

    def _broadcast_events(self, events: List[Dict]):
        """广播事件（更新所有智能体的记忆）"""
        for event in events:
            visibility = event.get("visibility", "public")

            if visibility == "public":
                # 公开事件所有人都能看到
                memory_event = event
                if (
                    event.get("event_type") == "player_death"
                    and event.get("data", {}).get("cause") in {"werewolf_kill", "poison"}
                ):
                    memory_event = {
                        **event,
                        "data": {**event["data"], "cause": "night_death"},
                    }
                for agent in self.agents.values():
                    agent.update_memory(memory_event)
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

    async def _reserve_model_tokens(
        self,
        player_id: str,
        estimated_input_tokens: int,
        requested_output_tokens: int,
    ) -> Dict:
        """为一次 provider 请求原子预留玩家和全局 token 预算。"""
        estimated_input_tokens = max(0, int(estimated_input_tokens))
        requested_output_tokens = max(1, int(requested_output_tokens))
        async with self._budget_lock:
            live_player_tokens = 0
            agent = self.agents.get(player_id)
            if agent:
                live_player_tokens = int(
                    agent.model_client.get_total_usage().get("total_tokens", 0)
                )
            player_tokens = max(
                live_player_tokens,
                self._settled_player_tokens.get(player_id, 0),
            )
            live_game_tokens = sum(
                int(agent.model_client.get_total_usage().get("total_tokens", 0))
                for agent in self.agents.values()
            )
            game_tokens = max(live_game_tokens, self._settled_game_tokens)

            limits = []
            if self.player_token_budget > 0:
                limits.append((
                    "玩家",
                    self.player_token_budget
                    - player_tokens
                    - self._reserved_player_tokens.get(player_id, 0),
                ))
            if self.game_token_budget > 0:
                limits.append((
                    "本局",
                    self.game_token_budget - game_tokens - self._reserved_game_tokens,
                ))
            if not limits:
                return {"max_tokens": requested_output_tokens, "reservation_id": None}

            scope, remaining = min(limits, key=lambda item: item[1])
            minimum_output = min(64, requested_output_tokens)
            if remaining < estimated_input_tokens + minimum_output:
                return {
                    "reason": (
                        f"{scope} token 预算仅剩 {max(0, remaining)}，不足为新请求预留"
                        f"预计输入 {estimated_input_tokens} + 最少输出 {minimum_output} token，"
                        "已停止调用并使用默认动作"
                    )
                }

            max_tokens = min(requested_output_tokens, remaining - estimated_input_tokens)
            reserved_tokens = estimated_input_tokens + max_tokens
            self._budget_reservation_seq += 1
            reservation_id = self._budget_reservation_seq
            self._budget_reservations[reservation_id] = (player_id, reserved_tokens)
            self._reserved_game_tokens += reserved_tokens
            self._reserved_player_tokens[player_id] = (
                self._reserved_player_tokens.get(player_id, 0) + reserved_tokens
            )
            return {
                "reservation_id": reservation_id,
                "max_tokens": max_tokens,
                "reserved_tokens": reserved_tokens,
            }

    async def _settle_model_tokens(self, reservation_id: object, provider_usage: Dict):
        """按 provider usage 结算实际消耗，并释放未使用的预留额度。"""
        input_tokens = int(
            provider_usage.get("input_tokens")
            or provider_usage.get("total_input_tokens")
            or 0
        )
        output_tokens = int(
            provider_usage.get("output_tokens")
            or provider_usage.get("total_output_tokens")
            or 0
        )
        reported_tokens = max(0, int(
            provider_usage.get("total_tokens") or input_tokens + output_tokens
        ))
        async with self._budget_lock:
            reservation = self._budget_reservations.pop(reservation_id, None)
            if reservation is None:
                return
            player_id, reserved_tokens = reservation
            # 某些 OpenAI 兼容端点不返回 usage。此时无法证明真实用量低于
            # 预留值，硬上限必须按保守上界结算，不能把一次付费请求记作 0。
            actual_tokens = reported_tokens or reserved_tokens
            self._reserved_game_tokens = max(
                0, self._reserved_game_tokens - reserved_tokens
            )
            player_reserved = max(
                0,
                self._reserved_player_tokens.get(player_id, 0) - reserved_tokens,
            )
            if player_reserved:
                self._reserved_player_tokens[player_id] = player_reserved
            else:
                self._reserved_player_tokens.pop(player_id, None)
            self._settled_game_tokens += actual_tokens
            self._settled_player_tokens[player_id] = (
                self._settled_player_tokens.get(player_id, 0) + actual_tokens
            )

    def _game_budget_reason(self) -> Optional[str]:
        if self.game_token_budget <= 0:
            return None
        live_tokens = sum(
            agent.model_client.get_total_usage().get("total_tokens", 0)
            for agent in self.agents.values()
        )
        total_tokens = max(live_tokens, self._settled_game_tokens)
        if total_tokens + self._reserved_game_tokens >= self.game_token_budget:
            return f"本局 token 预算已达到 {self.game_token_budget}，停止继续调用模型"
        return None

    def get_model_metrics(self) -> Dict:
        """返回不污染对局事件流的模型调用明细与聚合统计。"""
        by_player: Dict[str, Dict] = {}
        by_stage: Dict[str, Dict] = {}
        for call in self.call_metrics:
            usage = call.get("usage", {})
            for bucket, key in (
                (by_player, call.get("player") or "unknown"),
                (by_stage, call.get("night_stage") or call.get("phase") or "unknown"),
            ):
                stats = bucket.setdefault(key, {"calls": 0, "fallbacks": 0, "tokens": 0})
                stats["calls"] += 1
                stats["fallbacks"] += int(bool(call.get("fallback")))
                stats["tokens"] += int(usage.get("total_tokens", 0))

        # provider 未返回 usage 时，调用明细无法给出真实 token；模型排行仍应
        # 使用硬预算的保守结算，避免把这类模型误显示为“0 消耗”。
        for player_id, settled_tokens in self._settled_player_tokens.items():
            stats = by_player.setdefault(
                player_id,
                {"calls": 0, "fallbacks": 0, "tokens": 0},
            )
            stats["tokens"] = max(stats["tokens"], int(settled_tokens))

        calls = len(self.call_metrics)
        return {
            "total_calls": calls,
            "successful_calls": sum(bool(call.get("success")) for call in self.call_metrics),
            "fallback_calls": sum(bool(call.get("fallback")) for call in self.call_metrics),
            "repaired_json_calls": sum(bool(call.get("json_repaired")) for call in self.call_metrics),
            "average_latency_ms": round(
                sum(call.get("latency_ms", 0) for call in self.call_metrics) / calls
            ) if calls else 0,
            "by_player": by_player,
            "by_stage": by_stage,
            "calls": self.call_metrics,
        }
