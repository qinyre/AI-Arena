"""
AI Agent Implementation
"""
from typing import Dict, List, Optional
import asyncio
import logging
from app.llm.client import ModelClient, RetryableError, NonRetryableError
from app.core.models import GameAction, ActionType
import json

logger = logging.getLogger(__name__)


class AIAgent:
    """AI智能体"""

    def __init__(
        self,
        agent_id: str,
        model_client: ModelClient,
        personality: Optional[Dict] = None,
    ):
        """
        初始化AI智能体

        Args:
            agent_id: 智能体ID
            model_client: LLM客户端
        """
        self.agent_id = agent_id
        self.model_client = model_client
        self.personality = personality
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

        # 调用LLM（带重试）。重试覆盖三类失败：网络异常、JSON 解析失败、
        # 以及语义校验失败（action_type 非法 / target 越界 / content 为空等）。
        # 后两类是 LLM 偶发输出不规范，重试一次通常能修正，避免轻易降级。
        last_action: Optional[GameAction] = None
        for attempt in range(1, 4):  # 最多 3 轮：原始 + 2 次修正重试
            response = await self._generate_with_retry(
                action_prompt,
                system_prompt,
                temperature=self._decision_temperature(),
            )
            parsed = response.get("parsed")
            if not parsed:
                # 解析失败已在 _generate_with_retry 内重试过，这里直接进下一轮整体重试
                if attempt < 3:
                    await asyncio.sleep(1.0)
                    continue
                break

            action, ok, reason = self._build_action(parsed, available_actions)
            if ok and action is not None:
                last_action = action
                break
            # 语义校验失败：带提示重试，让 LLM 修正
            logger.warning("[%s] 动作语义校验失败（attempt %d）: %s", self.agent_id, attempt, reason)
            if attempt < 3:
                await asyncio.sleep(1.0)

        if last_action is not None:
            return last_action
        return self._fallback_action(available_actions)

    def _build_action(
        self,
        parsed: Dict,
        available_actions: List[Dict],
    ) -> tuple[Optional[GameAction], bool, str]:
        """把 LLM 解析结果构建为 GameAction，并做语义校验。

        返回 (action, ok, reason)。ok=False 时 reason 说明失败原因，
        供调用方决定是否带提示重试。
        """
        chosen_action = parsed.get("chosen_action", {})
        if not isinstance(chosen_action, dict):
            return None, False, "chosen_action 不是对象"
        try:
            action_type = ActionType(chosen_action.get("action_type"))
        except ValueError:
            return None, False, f"action_type 非法: {chosen_action.get('action_type')}"
        target_id = chosen_action.get("target")
        parameters = chosen_action.get("parameters", {})
        spec = next((a for a in available_actions if a["action_type"] == action_type.value), None)
        if not spec:
            return None, False, f"action_type {action_type.value} 不在当前可用动作中"
        if not isinstance(parameters, dict):
            return None, False, "parameters 不是对象"
        # 规范化 target：LLM 常给 speak 这类无 target 动作填空串/null/占位符，
        # 统一视为"未指定"，避免误判为格式错误而降级。
        if isinstance(target_id, str):
            target_id = target_id.strip()
        if target_id in ("", "null", "none", "None", "N/A", "-"):
            target_id = None
        if spec.get("target_required"):
            if target_id not in spec.get("valid_targets", []):
                return None, False, f"target {target_id} 不在合法目标 {spec.get('valid_targets')} 中"
        else:
            # 该动作不需要 target；LLM 若误填了实际玩家 id 才算错误，空值则忽略
            if target_id is not None:
                return None, False, f"该动作不需要 target，却传了 {target_id}"
        parameters["reasoning"] = parsed.get("reasoning", "")
        if not isinstance(parameters["reasoning"], str) or len(parameters["reasoning"]) > 500:
            return None, False, "reasoning 缺失或超长"
        if action_type in (ActionType.SPEAK, ActionType.WOLF_SPEAK):
            content = parameters.get("content")
            if not isinstance(content, str) or not content.strip() or len(content) > 500:
                return None, False, "发言动作缺少合法 content"
        if action_type == ActionType.SPEAK:
            claimable = next(
                (
                    set(spec["parameters"]["claim_role"].get("enum", []))
                    for spec in available_actions
                    if spec["action_type"] == "speak"
                    and "claim_role" in spec.get("parameters", {})
                ),
                {"none"},
            )
            if parameters.get("claim_role", "none") not in claimable:
                return None, False, f"claim_role 非法: {parameters.get('claim_role')}"
        elif action_type == ActionType.ABSTAIN:
            # 弃票必须有理由：避免 AI 信息不足时偷懒弃票而不给依据。
            # 校验失败会触发重试，让 LLM 补上 reasoning。
            abstain_reason = parameters.get("reasoning", "")
            if not isinstance(abstain_reason, str) or not abstain_reason.strip() or len(abstain_reason) > 500:
                return None, False, "弃票必须填写理由（reasoning 不能为空）"

        return GameAction(
            action_type=action_type,
            actor_id=self.agent_id,
            target_id=target_id,
            parameters=parameters,
        ), True, ""

    async def _generate_with_retry(
        self,
        prompt: str,
        system_prompt: str,
        max_attempts: int = 4,
        base_delay: float = 1.5,
        temperature: float = 0.7,
    ) -> Dict:
        """带指数退避的 LLM 调用重试。

        策略：
        - 可重试错误（网络/超时/限流 429/服务端 5xx）：指数退避重试，
          delay = base_delay * 2^(attempt-1)（1.5s → 3s → 6s → 12s），
          上限约 12s，配合 jitter 抖动避免雪崩。
        - 不可重试错误（鉴权 401 / 模型不存在 404 / 请求 400）：立即失败，
          不浪费配额与时间。
        - 解析失败（LLM 返回了但 JSON 解析不出）：重试 1 次（偶发格式问题），
          仍失败则返回 parsed=None 由调用方降级。
        """
        last_error: Optional[Exception] = None
        for attempt in range(1, max_attempts + 1):
            try:
                response = await self.model_client.generate(
                    prompt=prompt, system_prompt=system_prompt,
                    json_mode=True, temperature=temperature
                )
                if response.get("parsed"):
                    return response
                # 解析失败诊断：记录原始返回，便于定位是 LLM 没返回 JSON 还是格式问题
                raw = (response.get("content") or "")[:500]
                parse_err = response.get("parse_error", "")
                logger.warning("[%s] LLM 响应未解析成功 (attempt %d). parse_error=%s content=%s",
                               self.agent_id, attempt, parse_err, repr(raw))
                # 解析失败：首次重试一次（偶发），后续不再因解析失败重试
                if attempt == 1:
                    last_error = RuntimeError("LLM 响应 JSON 解析失败")
                    await asyncio.sleep(base_delay)
                    continue
                logger.warning("[%s] LLM 响应解析失败（attempt %d），降级", self.agent_id, attempt)
                return response  # parsed=None

            except NonRetryableError as e:
                # 鉴权/模型不存在/请求格式错——重试无意义，立即失败
                logger.error("[%s] LLM 不可重试错误，放弃: %s", self.agent_id, e)
                raise
            except RetryableError as e:
                last_error = e
                if attempt >= max_attempts:
                    logger.error("[%s] LLM 重试 %d 次仍失败，降级: %s", self.agent_id, max_attempts, e)
                    break
                # 指数退避 + jitter
                delay = min(base_delay * (2 ** (attempt - 1)), 15.0)
                import random as _r
                delay = delay * (0.5 + _r.random() * 0.5)  # 50%~100% 抖动
                logger.warning("[%s] LLM 可重试错误（attempt %d/%d），%.1fs 后重试: %s",
                               self.agent_id, attempt, max_attempts, delay, e)
                await asyncio.sleep(delay)
            except Exception as e:
                # 未知异常：保守当作可重试，但只重试一次
                last_error = e
                logger.warning("[%s] LLM 未知错误（attempt %d）: %s", self.agent_id, attempt, e)
                if attempt >= max_attempts:
                    break
                await asyncio.sleep(base_delay)

        return {"parsed": None, "_last_error": str(last_error) if last_error else "unknown"}

    def _fallback_action(self, available_actions: List[Dict]) -> GameAction:
        chosen = next((a for a in available_actions if a["action_type"] != "abstain"), available_actions[0])
        parameters = {"reasoning": "模型不可用，使用默认动作"}
        if chosen["action_type"] in ("speak", "wolf_speak"):
            if chosen["action_type"] == "wolf_speak":
                parameters.update(content="建议优先刀最像神职的玩家。")
            else:
                parameters.update(content="我暂时没有新的信息。", claim_role="none")
        return GameAction(ActionType(chosen["action_type"]), self.agent_id,
                          (chosen.get("valid_targets") or [None])[0], parameters)

    def _build_system_prompt(self, visible_state: Dict) -> str:
        """构建系统提示词"""
        role = visible_state.get("your_role", "unknown")

        role_descriptions = {
            "werewolf": """你是一名狼人。
- 目标：按本局胜利规则消灭好人阵营
- 能力：每晚选择一名玩家杀死
- 白天轮到自己行动时可以自爆，立即结束白天并进入夜晚
- 策略：隐藏身份，伪装成好人，在发言中误导其他玩家
- 注意：不要在公开发言中暴露自己是狼人""",

            "seer": """你是预言家。
- 目标：帮助好人阵营找出并放逐狼人
- 能力：每晚查验一名玩家的真实身份（好人/狼人）
- 策略：收集信息，选择合适时机公开身份，分享查验结果
- 注意：需要防备假预言家（狼人冒充）""",

            "witch": """你是女巫。
- 阵营：好人；解药和毒药各一瓶，每晚至多使用一瓶
- 解药只能救当晚狼队刀口；毒药可以毒杀一名其他存活玩家
- 守卫同守同救时目标仍会死亡，请谨慎判断是否用药""",

            "hunter": """你是猎人。
- 阵营：好人；死亡后可选择开枪带走一名存活玩家
- 若被女巫毒死则不能开枪，也可以主动放弃开枪""",

            "idiot": """你是白痴。
- 阵营：好人；白天首次被投票放逐时翻牌免死
- 翻牌后仍可发言，但永久失去投票权；夜杀、毒杀和枪杀不能免死""",

            "guard": """你是守卫。
- 阵营：好人；每晚可守护一名玩家，能挡住狼刀
- 不能连续两晚守护同一人；守护不能抵挡毒药
- 若女巫同时解救你守护的狼刀目标，同守同救会导致目标死亡""",

            "white_wolf_king": """你是白狼王，属于狼人阵营。
- 夜间与狼队共同选择刀口
- 白天任意玩家发言后都可能获得自爆窗口；自爆可带走一名存活玩家并立即入夜
- 普通死亡不能带人；公开发言不要暴露狼人身份""",

            "wolf_king": """你是狼王，属于狼人阵营。
- 夜间与狼队共同选择刀口
- 被狼刀、白天投票放逐或被猎人开枪带走后可带走一名存活玩家
- 被毒或自爆时不能发动；白天也可像普通狼人一样自爆入夜""",

            "villager": """你是一名普通村民。
- 目标：帮助好人阵营找出并放逐狼人
- 能力：无特殊能力，依靠观察和推理
- 策略：仔细分析每个人的发言，寻找矛盾点，合理投票
- 注意：你的发言和投票对好人阵营很重要"""
        }

        if visible_state.get("sheriff_enabled"):
            if role == "seer":
                role_descriptions["seer"] += (
                    "\n- 本局启用警长：优先考虑上警，公开首夜验人；竞选时安排一至两名未来查验对象，"
                    "明确说明查到好人/狼人时分别把警徽移交给谁或是否撕徽，这就是警徽流。"
                )
            elif role in ("werewolf", "white_wolf_king", "wolf_king"):
                role_descriptions[role] += (
                    "\n- 本局启用警长：可以上警争夺 1.5 票权，也可冒充预言家报假验人和假警徽流，"
                    "但公开说法必须与已知信息保持一致。"
                )

        your_id = visible_state.get("your_player_id", "?")
        alive = visible_state.get("alive_players", [])
        dead = visible_state.get("dead_players", [])
        phase = visible_state.get('phase', 'unknown')
        round_no = visible_state.get('round', 0)

        # 角色 + 队伍身份自述
        identity_lines = [f"你的玩家编号是 **{your_id}**。"]
        if role in ("werewolf", "white_wolf_king", "wolf_king"):
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
        if visible_state.get("sheriff_id") == your_id:
            identity_lines.append(
                "你是当前警长：负责决定白天发言方向、在全员发言后总结归票，"
                "且放逐投票按 1.5 票计算。"
            )
        identity = "\n".join(identity_lines)
        personality = self._build_personality_prompt()
        memory = self.get_recent_memory() or "暂无个人行动记录。"
        role_status = ""
        if role == "witch":
            antidote = "可用" if visible_state.get("antidote_available") else "已使用"
            poison = "可用" if visible_state.get("poison_available") else "已使用"
            role_status = (
                "\n# 当前角色资源（权威状态）\n"
                f"解药：{antidote} ｜ 毒药：{poison}\n"
                "发言和推理必须与此状态及个人行动记录一致；已使用的药不能再次使用，"
                "也不能声称本夜使用了未出现在个人行动记录中的药。\n"
            )

        # 白天发言顺序提示
        order_hint = ""
        if phase in (
            "day",
            "tiebreak_speech",
            "sheriff_campaign",
            "sheriff_tiebreak_speech",
        ):
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

        return f"""你是一个{visible_state.get('board_name', '狼人杀')}中的AI玩家。

# 你的身份
{identity}

# 你的角色
{role_descriptions.get(role, "未知角色")}
{role_status}

# 公共硬规则
- 守卫与女巫同时保护狼队刀口时属于“同守同救”，两种保护互相抵消，目标仍然死亡。
- 女巫的解药和毒药各只有一瓶，每晚至多使用一瓶。
- 夜间守护、用药等私密行动只有行动者本人知道；没有对应私密信息时不得假定具体目标。

# 你的性格
{personality}

# 当前局势
回合: {round_no} ｜ 阶段: {phase}
总玩家数: {visible_state.get('total_players', len(alive) + len(dead))}
胜利规则: {'屠边（狼人消灭全部神职或全部平民）' if visible_state.get('win_rule') == 'edge' else '人数优势（狼人数量不少于好人）'}
存活玩家: {', '.join(alive) if alive else '无'}
死亡玩家: {', '.join(dead) if dead else '无'}
{order_hint}

# 你的记忆
{memory}

# 行为准则
1. 你是 {your_id}。发言/推理中提到"我"指的就是 {your_id}，不要用第三人称称呼自己。
2. 严格按照你的角色行事，不要泄露隐藏信息（如狼人身份）。
3. 使用逻辑推理做出决策，推理要基于本局已知事实，不要套用多狼局才成立的套路（如"队友灭口"）。
4. 在公开发言中保持角色一致性。

请基于当前局势做出决策。
"""

    def _build_personality_prompt(self) -> str:
        if not self.personality:
            return "采用标准、平衡的表达与决策风格。"

        tone = {
            "calm": "冷静克制，避免情绪化措辞",
            "direct": "直接锋利，明确表达怀疑与结论",
            "diplomatic": "圆融审慎，重视说服与阵营协作",
            "playful": "轻松机敏，可以适度幽默但不玩梗干扰判断",
            "dramatic": "富有戏剧张力，但所有判断仍须基于事实",
        }.get(self.personality.get("tone"), "自然表达")
        reasoning = {
            "evidence": "优先引用具体发言、票型和行为证据",
            "intuition": "允许根据整体表现形成直觉，但要说明可观察依据",
            "pressure": "善用质询、对比和施压来寻找矛盾",
            "consensus": "重视多人观点与阵营协作，同时保留独立判断",
        }.get(self.personality.get("reasoning_style"), "综合分析")
        risk = int(self.personality.get("risk_tolerance", 3))
        assertiveness = int(self.personality.get("assertiveness", 3))
        verbosity = int(self.personality.get("verbosity", 3))

        return (
            f"性格名称：{self.personality.get('name', '自定义性格')}\n"
            f"- 表达语气：{tone}。\n"
            f"- 推理偏好：{reasoning}。\n"
            f"- 风险偏好：{risk}/5；数值越高越愿意主动跳身份、改变票型或承担策略风险。\n"
            f"- 主导性：{assertiveness}/5；数值越高越主动给出明确结论，越低越倾向观察和保留。\n"
            f"- 表达长度：{verbosity}/5；1 表示极简，5 表示较完整，但始终避免重复和空话。\n"
            "- 性格只影响表达方式与信息不足时的倾向，不得改变角色目标、游戏规则、"
            "可见信息边界或事实；若性格倾向与规则冲突，必须以规则为准。"
        )

    def _trait(self, name: str) -> int:
        try:
            value = int((self.personality or {}).get(name, 3))
        except (TypeError, ValueError):
            value = 3
        return max(1, min(5, value))

    def _decision_temperature(self) -> float:
        if not self.personality:
            return 0.7
        return round(0.45 + 0.1 * (self._trait("risk_tolerance") - 1), 2)

    def _build_personality_policy(
        self,
        phase: str,
        available_actions: List[Dict],
    ) -> str:
        """把性格从描述转换为本次决策可执行的约束。"""
        if not self.personality:
            return "未配置个性：采用平衡策略，优先遵守事实、角色目标和阶段规则。"

        risk = self._trait("risk_tolerance")
        assertiveness = self._trait("assertiveness")
        verbosity = self._trait("verbosity")
        action_types = {
            action.get("action_type") for action in available_actions
        }
        reasoning = {
            "evidence": "至少引用一项当前可见的具体发言、票型或行为；没有证据时明确说证据不足，禁止编造。",
            "intuition": "可以表达直觉，但必须指出触发直觉的可观察表现，不能把感觉说成事实。",
            "pressure": "锁定一个关键矛盾或玩家进行质询，并说明其回答将如何影响你的判断。",
            "consensus": "回应场上已有观点并说明赞同或反对的理由；不得为了合群放弃独立判断。",
        }.get(
            self.personality.get("reasoning_style"),
            "综合当前可见事实形成判断。",
        )
        tone = {
            "calm": "措辞冷静克制，区分事实、推测和结论。",
            "direct": "措辞直接，少铺垫，明确点名对象和结论。",
            "diplomatic": "先承接他人观点再表达分歧，避免无依据攻击。",
            "playful": "可以轻松机敏，但幽默不能替代证据和结论。",
            "dramatic": "允许有戏剧张力，但不得夸大或虚构事实。",
        }.get(self.personality.get("tone"), "自然、清晰地表达。")
        risk_policy = {
            1: "信息不足时优先保留一次性能力和隐藏身份，只在收益近乎确定时冒险。",
            2: "需要较强证据才承担暴露身份、消耗技能或改变稳定票型的风险。",
            3: "在收益与风险接近时采用平衡方案，不因性格刻意冒进或拖延。",
            4: "存在合理收益时可以主动跳身份、使用技能或打破僵局，但要说明代价。",
            5: "允许基于可信线索抢先行动和制造高收益局面，同时接受暴露或误判风险。",
        }[risk]
        assertive_policy = {
            1: "表达保留意见和观察点，不强行带队；仍要给出当前最倾向的判断。",
            2: "给出倾向但保留修正空间，不把弱证据包装成定论。",
            3: "明确表达主要判断，并指出什么新信息会让你改变立场。",
            4: "明确点名首要目标、理由和下一步建议，主动回应主要分歧。",
            5: "给出唯一优先目标和可执行建议，主动质询关键玩家，避免模糊站边。",
        }[assertiveness]

        length_policy = ""
        if "wolf_speak" in action_types:
            bounds = {
                1: (10, 30), 2: (20, 45), 3: (30, 60),
                4: (45, 80), 5: (60, 100),
            }[verbosity]
            length_policy = (
                f"若选择 wolf_speak，建议控制在 {bounds[0]}–{bounds[1]} 个汉字，"
                "只补充新目标、新依据或新风险。"
            )
        elif "speak" in action_types:
            bounds = {
                1: (25, 60), 2: (45, 90), 3: (70, 130),
                4: (110, 190), 5: (160, 260),
            }[verbosity]
            if phase in {"sheriff_campaign", "sheriff_summary"}:
                bounds = (bounds[0] + 30, min(bounds[1] + 60, 400))
            length_policy = (
                f"若选择 speak，建议控制在 {bounds[0]}–{bounds[1]} 个汉字；"
                "长度必须来自有效信息，禁止靠复述和套话凑字数。"
            )

        situational = []
        if "self_destruct" in action_types:
            situational.append(
                "低风险时仅在能中止明显不利白天或带走已确认核心时自爆；"
                "高风险时可为高价值收益提前自爆，但不能无目标送死。"
            )
        if action_types & {"heal", "poison", "shoot"}:
            situational.append(
                "一次性技能的使用门槛随风险偏好降低或提高，但已知事实、药物状态和终局优先级更高。"
            )
        if "vote" in action_types:
            situational.append(
                "谨慎不等于无理由弃票；assertiveness 越高，票型越应与公开主张一致。"
            )

        return "\n".join(filter(None, (
            f"- 决策风险 {risk}/5：{risk_policy}",
            f"- 主导程度 {assertiveness}/5：{assertive_policy}",
            f"- 推理方式：{reasoning}",
            f"- 表达语气：{tone}",
            f"- 表达长度 {verbosity}/5：{length_policy}" if length_policy else "",
            *situational,
            "- 以上只在多个合法且合理的方案之间生效；角色目标、确定事实、信息边界和硬规则始终优先。",
        )))

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
                "现在是【夜晚】阶段。你只能从当前角色可见的夜间行动中选择，"
                "不能公开发言、不能放逐投票、不能跳身份。wolf_speak 是仅狼队可见的密聊。"
            ),
            "day": (
                "现在是【白天发言】阶段。你只能【发言】一次（speak 动作），"
                "在 parameters.content 里写出你的公开发言内容。"
                "白天发言阶段不能投票、不能杀人、不能查验。"
                "你的查验/身份声明等必须通过公开发言（content）来表达，"
                "不要把 action_type 写成 vote / kill / investigate。\n"
                "发言要有信息量，推动局势。禁止只复述显而易见的事实（例如"
                "「昨晚有人死了，狼人行动了」「大家要小心」「我是村民没信息」"
                "这类空话）。你的发言应当至少包含以下之一：\n"
                "  - 对某个玩家的具体怀疑或信任，并给出依据（哪句话、哪个行为矛盾）\n"
                "  - 跳身份并公布查验结果（预言家）/ 伪造查验（悍跳狼）\n"
                "  - 分析死者的身份推断（被刀的人可能是预言家/关键好人吗）\n"
                "  - 对他人发言的回应或反驳（指出逻辑漏洞）\n"
                "  - 明确的投票倾向（建议投谁、跟谁的票）\n"
                "如果你确实没有信息可分析，也要基于已知发言给出你的立场和判断，"
                "而不是说「没有信息」收场。"
            ),
            "voting": (
                "现在是【投票】阶段。你只能投票或有理由地弃票，"
                "不能再发言、不能跳身份、不能杀人、不能查验。"
                "即便局势危急也只能选择投票目标——已没有发言机会。"
                "如果参数里有 content 字段会被忽略。"
            ),
            "death_skill": (
                "现在是【死亡技能】阶段。你已死亡，只能选择带走一名存活玩家，"
                "或选择 pass 放弃发动。"
            ),
        }
        guide = phase_guide.get(phase, f"当前阶段: {phase}。只能从可选动作中选择。")

        # 列出本阶段允许的 action_type（来自 available_actions）
        phase_guide.update({
            "speech_order": (
                "现在是【警长决定发言顺序】。选择 order_clockwise 或 "
                "order_counterclockwise。若昨夜恰有一名死者，发言从其相邻座位沿所选方向开始；"
                "若平安夜或多死，发言从警长相邻座位开始且警长最后发言。"
                "请根据你希望哪些玩家先表态、哪些玩家后置听信息来选择。"
            ),
            "sheriff_summary": (
                "现在是【警长总结归票】。你已听完本轮全部公开发言，只能用 speak 总结关键分歧，"
                "在 content 中公开说明归票理由，并把 target 设置为你号召全场放逐的存活玩家。"
                "归票只是公开建议，随后仍由每名玩家独立投票。"
            ),
            "sheriff_campaign": (
                "现在是【警长竞选】。pass 表示不上警；speak 表示上警并发表公开竞选发言。"
                "上警发言必须填写 parameters.content、claim_role 和 withdraw_after_speech。"
                "预言家应报告首夜验人并安排一至两名未来查验对象，明确好人/狼人结果对应的警徽移交或撕徽方案。"
                "悍跳狼可给出自洽的假验人和假警徽流。withdraw_after_speech=true 表示发言后退水，且不能投警长票。"
            ),
            "sheriff_voting": (
                "现在是【警长投票】。只能盲投一名候选人或有理由地弃票；候选人和退水玩家不能投票。"
                "警长当选后白天放逐票按 1.5 票计算。"
            ),
            "sheriff_tiebreak_speech": (
                "现在是【警长竞选平票 PK 发言】。只有同票候选人发言，请回应对手并解释自己的验人、警徽流或竞选价值。"
            ),
            "sheriff_tiebreak_voting": (
                "现在是【警长竞选平票复投】。只能在同票候选人中盲投或有理由地弃票；再次同票则本局没有警长。"
            ),
            "badge_transfer": (
                "现在是【警徽处理】。你已死亡，只能把警徽移交给一名存活玩家，或 destroy_badge 撕毁警徽。"
                "若你是预言家，应结合最后一次查验和此前公开的警徽流传递真实信息。"
            ),
        })
        guide = phase_guide.get(phase, guide)

        allowed_types = sorted({
            a.get("action_type", "") for a in available_actions if a.get("action_type")
        })
        if phase in (
            "day",
            "sheriff_summary",
            "tiebreak_speech",
            "sheriff_campaign",
            "sheriff_tiebreak_speech",
        ) and set(allowed_types) <= {"self_destruct", "pass"}:
            guide = (
                "现在是白狼王的【即时自爆窗口】。你可以立刻自爆带人，"
                "也可以选择 pass 继续观察；不能公开发言或投票。"
            )
        elif phase == "night" and "wolf_speak" in allowed_types:
            discussion = visible_state.get("werewolf_discussion", [])
            if discussion:
                guide += (
                    " 队友此前的密聊已列在 werewolf_discussion。"
                    "禁止复述、改写或只表示同意；只有能提出新目标、新依据或新风险时才选择 wolf_speak，"
                    "否则必须选择 pass。"
                )
            else:
                guide += (
                    " 本晚尚无队友发言。你可以用 wolf_speak 提出新目标或判断，"
                    "也可以选择 pass，把提议机会留给后续队友；不要为了发言而发言。"
                )
        elif phase in (
            "day",
            "sheriff_summary",
            "tiebreak_speech",
            "sheriff_campaign",
            "sheriff_tiebreak_speech",
        ) and "self_destruct" in allowed_types:
            guide += " 狼人还可以选择 self_destruct 自爆并立即进入夜晚。"

        personality_policy = self._build_personality_policy(
            phase,
            available_actions,
        )

        return f"""
请分析当前局势并选择一个动作。

# 当前阶段约束（必读）
{guide}
本轮你能执行的动作类型仅限: {', '.join(allowed_types) if allowed_types else '（无）'}。
禁止在 reasoning 中幻想当前阶段做不到的事（例如投票阶段不能"反跳预言家/发言/拉票"、
白天阶段不能"杀人/查验"）。reasoning 只应围绕"在当前可用动作中如何抉择"展开。

# 本次决策的性格行为契约
{personality_policy}

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
若是 speak/wolf_speak 动作，把发言写在 parameters.content；若是带目标的动作，
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
        elif event_type == "witch_heal":
            return f"[用药] 你已使用解药救助 {data.get('target')}"
        elif event_type == "witch_poison":
            return f"[用药] 你已使用毒药毒杀 {data.get('target')}"
        elif event_type == "guard_action":
            return f"[守护] 你守护了 {data.get('target')}"
        else:
            return f"[{event_type}] {json.dumps(data, ensure_ascii=False)}"
