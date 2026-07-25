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
        response = await self._generate_with_retry(action_prompt, system_prompt)

        # 解析响应
        parsed = response.get("parsed")
        if not parsed:
            # 降级：随机选择一个动作
            chosen = next((a for a in available_actions if a["action_type"] != "abstain"), available_actions[0])
            if chosen["action_type"] == "speak":
                return GameAction(
                    action_type=ActionType.SPEAK, actor_id=self.agent_id,
                    parameters={"content": "我暂时没有新的信息。", "claim_role": "none", "reasoning": "模型不可用，使用默认动作"}
                )
            return GameAction(
                action_type=ActionType(chosen["action_type"]),
                actor_id=self.agent_id,
                target_id=chosen.get("valid_targets", [None])[0] if chosen.get("valid_targets") else None,
                parameters={"reasoning": "LLM解析失败，随机选择"}
            )

        # 构建GameAction
        chosen_action = parsed.get("chosen_action", {})
        if not isinstance(chosen_action, dict):
            return self._fallback_action(available_actions)
        try:
            action_type = ActionType(chosen_action.get("action_type"))
        except ValueError:
            return self._fallback_action(available_actions)
        target_id = chosen_action.get("target")
        parameters = chosen_action.get("parameters", {})
        spec = next((a for a in available_actions if a["action_type"] == action_type.value), None)
        if not spec or not isinstance(parameters, dict):
            return self._fallback_action(available_actions)
        if spec.get("target_required") and target_id not in spec.get("valid_targets", []):
            return self._fallback_action(available_actions)
        if not spec.get("target_required") and target_id is not None:
            return self._fallback_action(available_actions)
        parameters["reasoning"] = parsed.get("reasoning", "")
        if not isinstance(parameters["reasoning"], str) or len(parameters["reasoning"]) > 500:
            return self._fallback_action(available_actions)
        if action_type == ActionType.SPEAK:
            if not isinstance(parameters.get("content"), str) or not parameters["content"].strip() or len(parameters["content"]) > 500:
                return self._fallback_action(available_actions)
            if parameters.get("claim_role", "none") not in ("none", "seer", "villager"):
                return self._fallback_action(available_actions)

        return GameAction(
            action_type=action_type,
            actor_id=self.agent_id,
            target_id=target_id,
            parameters=parameters
        )

    async def _generate_with_retry(self, prompt: str, system_prompt: str) -> Dict:
        for _ in range(2):
            try:
                response = await self.model_client.generate(
                    prompt=prompt, system_prompt=system_prompt,
                    json_mode=True, temperature=0.7
                )
                if response.get("parsed"):
                    return response
            except Exception:
                pass
        return {"parsed": None}

    def _fallback_action(self, available_actions: List[Dict]) -> GameAction:
        chosen = next((a for a in available_actions if a["action_type"] != "abstain"), available_actions[0])
        parameters = {"reasoning": "模型不可用，使用默认动作"}
        if chosen["action_type"] == "speak":
            parameters.update(content="我暂时没有新的信息。", claim_role="none")
        return GameAction(ActionType(chosen["action_type"]), self.agent_id,
                          (chosen.get("valid_targets") or [None])[0], parameters)

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

        your_id = visible_state.get("your_player_id", "?")
        alive = visible_state.get("alive_players", [])
        dead = visible_state.get("dead_players", [])
        phase = visible_state.get('phase', 'unknown')
        round_no = visible_state.get('round', 0)

        # 角色 + 队伍身份自述
        identity_lines = [f"你的玩家编号是 **{your_id}**。"]
        if role == "werewolf":
            teammates = visible_state.get("werewolf_teammates", [])
            wc = visible_state.get("werewolf_count", 1)
            if wc <= 1 or not teammates:
                identity_lines.append(
                    f"本局只有 **{wc}** 个狼人，就是你本人（{your_id}）。"
                    "你是【独狼】，没有任何狼人队友。"
                    "禁止用「队友」「悍跳狼被队友灭口」「同伴配合」等多狼套路来推理——"
                    "夜间被杀/被放逐的所谓「预言家/悍跳」都只可能是好人，不存在队友灭口的可能。"
                )
            else:
                identity_lines.append(
                    f"本局共有 {wc} 个狼人。你的狼人队友是: {', '.join(teammates)}（若为空则你是独狼）。"
                )
        identity = "\n".join(identity_lines)

        # 白天发言顺序提示
        order_hint = ""
        if phase == "day":
            order = visible_state.get("speak_order", [])
            already = visible_state.get("speakers_already_spoke", [])
            remaining = visible_state.get("speakers_remaining", [])
            pos = visible_state.get("your_speak_position")
            total = visible_state.get("total_speakers")
            is_last = visible_state.get("is_last_speaker", False)
            is_first = visible_state.get("is_first_speaker", False)
            parts = [
                f"发言顺序: {' → '.join(order) if order else '未知'}",
                f"已发言: {', '.join(already) if already else '无'}",
                f"待发言: {', '.join(remaining) if remaining else '无'}",
            ]
            if pos and total:
                parts.append(f"你是第 {pos}/{total} 位发言者。")
            if is_first:
                parts.append("你是首位发言者，之前无人发言，不要说「看后面玩家的发言」。")
            if is_last:
                parts.append(
                    "你是【最后一位】发言者。本轮所有玩家都已发过言，"
                    "你之后没有人再说话。不要说「看后面玩家发言/等后续发言」，"
                    "应直接基于已收集到的全部信息做总结和判断。"
                )
            elif remaining:
                not_me_after = [p for p in remaining if p != your_id]
                if not_me_after:
                    parts.append(f"在你之后还有 {', '.join(not_me_after)} 将要发言。")
            order_hint = "\n# 发言顺序\n" + "\n".join(parts)

        return f"""你是一个5人局狼人杀游戏中的AI玩家（1狼人 + 1预言家 + 3村民）。

# 你的身份
{identity}

# 你的角色
{role_descriptions.get(role, "未知角色")}

# 当前局势
回合: {round_no} ｜ 阶段: {phase}
总玩家数: {visible_state.get('total_players', len(alive) + len(dead))}
存活玩家: {', '.join(alive) if alive else '无'}
死亡玩家: {', '.join(dead) if dead else '无'}
{order_hint}

# 你的记忆
# 行为准则
1. 你是 {your_id}。发言/推理中提到"我"指的就是 {your_id}，不要用第三人称称呼自己。
2. 严格按照你的角色行事，不要泄露隐藏信息（如狼人身份）。
3. 使用逻辑推理做出决策，推理要基于本局已知事实，不要套用多狼局才成立的套路（如"队友灭口"）。
4. 在公开发言中保持角色一致性。

请基于当前局势做出决策。
"""

    def _build_action_prompt(
        self,
        visible_state: Dict,
        available_actions: List[Dict]
    ) -> str:
        """构建动作选择提示词"""
        phase = visible_state.get("phase", "unknown")

        # 把阶段翻译成 LLM 能理解的"现在能做什么/不能做什么"
        phase_guide = {
            "night": (
                "现在是【夜晚】阶段。你只能执行夜间行动（狼人杀人 / 预言家查验），"
                "不能发言、不能投票、不能跳身份。所有决策都是暗中进行的。"
            ),
            "day": (
                "现在是【白天发言】阶段。你只能【发言】一次（speak 动作），"
                "在 parameters.content 里写出你的公开发言内容。"
                "白天发言阶段不能投票、不能杀人、不能查验。"
                "你的查验/身份声明等必须通过公开发言（content）来表达，"
                "不要把 action_type 写成 vote / kill / investigate。"
            ),
            "voting": (
                "现在是【投票】阶段。你只能【投票】放逐一名玩家（vote 动作），"
                "不能再发言、不能跳身份、不能杀人、不能查验。"
                "即便局势危急也只能选择投票目标——已没有发言机会。"
                "如果参数里有 content 字段会被忽略；chosen_action 只能是 vote。"
            ),
        }
        guide = phase_guide.get(phase, f"当前阶段: {phase}。只能从可选动作中选择。")

        # 列出本阶段允许的 action_type（来自 available_actions）
        allowed_types = sorted({
            a.get("action_type", "") for a in available_actions if a.get("action_type")
        })

        return f"""
请分析当前局势并选择一个动作。

# 当前阶段约束（必读）
{guide}
本轮你能执行的动作类型仅限: {', '.join(allowed_types) if allowed_types else '（无）'}。
禁止在 reasoning 中幻想当前阶段做不到的事（例如投票阶段不能"反跳预言家/发言/拉票"、
白天阶段不能"杀人/查验"）。reasoning 只应围绕"在当前可用动作中如何抉择"展开。

# 可选动作（你只能从中选择，不得自创）
{json.dumps(available_actions, ensure_ascii=False, indent=2)}

# 当前游戏状态
{json.dumps(visible_state, ensure_ascii=False, indent=2)}

请返回JSON格式：
{{
    "reasoning": "你的内部推理（2-3句话，只针对当前可用动作的抉择，不得幻想阶段外的行动）",
    "chosen_action": {{
        "action_type": "...（必须从上面可选动作里选）",
        "target": "...（该动作要求 target 时填玩家ID，否则留空）",
        "parameters": {{}}
    }}
}}

注意：reasoning 是你的内部思考，不会被其他玩家看到。chosen_action 必须严格匹配上面的可选动作；
若是 speak 动作，把公开发言写在 parameters.content；若是 vote/kill/investigate 动作，
parameters 里通常只需 reasoning（如需），不要硬塞 content。
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
