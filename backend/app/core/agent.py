"""
AI Agent Implementation
"""
from typing import Dict, List, Optional
from app.llm.client import ModelClient
from app.core.models import GameAction, ActionType
import json


class AIAgent:
    """AI智能体"""

    def __init__(
        self,
        agent_id: str,
        model_client: ModelClient
    ):
        """
        初始化AI智能体

        Args:
            agent_id: 智能体ID
            model_client: LLM客户端
        """
        self.agent_id = agent_id
        self.model_client = model_client
        self.memory: List[Dict] = []

    def update_memory(self, event: Dict):
        """更新记忆"""
        self.memory.append(event)

    def get_recent_memory(self, limit: int = 20) -> str:
        """获取最近的记忆（压缩）"""
        recent = self.memory[-limit:]
        return "\n".join([self._format_event(e) for e in recent])

    async def decide(
        self,
        visible_state: Dict,
        available_actions: List[Dict]
    ) -> GameAction:
        """
        基于当前状态做出决策

        Args:
            visible_state: 可见游戏状态
            available_actions: 可选动作列表

        Returns:
            选择的动作
        """
        # 构建提示词
        system_prompt = self._build_system_prompt(visible_state)
        action_prompt = self._build_action_prompt(
            visible_state,
            available_actions
        )

        # 调用LLM
        response = await self.model_client.generate(
            prompt=action_prompt,
            system_prompt=system_prompt,
            json_mode=True,
            temperature=0.7
        )

        # 解析响应
        parsed = response.get("parsed")
        if not parsed:
            # 降级：随机选择一个动作
            import random
            chosen = random.choice(available_actions)
            return GameAction(
                action_type=ActionType(chosen["action_type"]),
                actor_id=self.agent_id,
                target_id=chosen.get("valid_targets", [None])[0] if chosen.get("valid_targets") else None,
                parameters={"reasoning": "LLM解析失败，随机选择"}
            )

        # 构建GameAction
        chosen_action = parsed.get("chosen_action", {})
        action_type = ActionType(chosen_action.get("action_type"))
        target_id = chosen_action.get("target")
        parameters = chosen_action.get("parameters", {})
        parameters["reasoning"] = parsed.get("reasoning", "")

        return GameAction(
            action_type=action_type,
            actor_id=self.agent_id,
            target_id=target_id,
            parameters=parameters
        )

    def _build_system_prompt(self, visible_state: Dict) -> str:
        """构建系统提示词"""
        role = visible_state.get("your_role", "unknown")

        role_descriptions = {
            "werewolf": """你是一名狼人。
- 目标：消灭所有好人，让狼人数量 ≥ 好人数量
- 能力：每晚选择一名玩家杀死
- 策略：隐藏身份，伪装成好人，在发言中误导其他玩家
- 注意：不要在公开发言中暴露自己是狼人""",

            "seer": """你是预言家。
- 目标：帮助好人阵营找出并放逐狼人
- 能力：每晚查验一名玩家的真实身份（好人/狼人）
- 策略：收集信息，选择合适时机公开身份，分享查验结果
- 注意：需要防备假预言家（狼人冒充）""",

            "villager": """你是一名普通村民。
- 目标：帮助好人阵营找出并放逐狼人
- 能力：无特殊能力，依靠观察和推理
- 策略：仔细分析每个人的发言，寻找矛盾点，合理投票
- 注意：你的发言和投票对好人阵营很重要"""
        }

        return f"""你是一个狼人杀游戏中的AI玩家。

# 你的角色
{role_descriptions.get(role, "未知角色")}

# 当前局势
回合: {visible_state.get('round', 0)}
阶段: {visible_state.get('phase', 'unknown')}
存活玩家: {', '.join(visible_state.get('alive_players', []))}
死亡玩家: {', '.join(visible_state.get('dead_players', []))}

# 你的记忆
{self.get_recent_memory()}

# 行为准则
1. 严格按照你的角色行事
2. 不要泄露隐藏信息（如狼人身份）
3. 使用逻辑推理做出决策
4. 在公开发言中保持角色一致性

请基于当前局势做出决策。
"""

    def _build_action_prompt(
        self,
        visible_state: Dict,
        available_actions: List[Dict]
    ) -> str:
        """构建动作选择提示词"""
        return f"""
请分析当前局势并选择一个动作：

# 可选动作
{json.dumps(available_actions, ensure_ascii=False, indent=2)}

# 当前游戏状态
{json.dumps(visible_state, ensure_ascii=False, indent=2)}

请返回JSON格式：
{{
    "reasoning": "你的推理过程（2-3句话，内部思考）",
    "chosen_action": {{
        "action_type": "...",
        "target": "...",
        "parameters": {{}}
    }}
}}

注意：reasoning是你的内部推理，不会被其他玩家看到。如果是speak动作，在parameters.content中写你的公开发言。
"""

    def _format_event(self, event: Dict) -> str:
        """格式化事件为文本"""
        event_type = event.get("event_type", "unknown")
        data = event.get("data", {})

        if event_type == "player_death":
            return f"[死亡] {data.get('player')} 在第{data.get('round')}轮被杀"
        elif event_type == "player_speech":
            return f"[发言] {data.get('speaker')}: {data.get('content')}"
        elif event_type == "player_vote":
            return f"[投票] {data.get('voter')} 投给 {data.get('target')}"
        elif event_type == "vote_result":
            if data.get("result") == "eliminated":
                return f"[结果] {data.get('eliminated')} 被放逐"
            elif data.get("result") == "tie":
                return f"[结果] 平票，无人出局"
        elif event_type == "seer_investigate":
            return f"[查验] 你查验了 {data.get('target')}，结果: {data.get('result')}"
        else:
            return f"[{event_type}] {json.dumps(data, ensure_ascii=False)}"
