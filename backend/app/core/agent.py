"""
AI Agent Implementation

提示词构建(_build_system_prompt / _build_action_prompt 等)拆分在
app.core.agent_prompts 的 PromptBuilderMixin;本文件保留决策流程、
LLM 调用重试、语义校验与预算/熔断。
"""
from typing import Awaitable, Callable, Dict, List, Optional
import asyncio
from difflib import SequenceMatcher
import logging
import re
import time
from app.llm.client import ModelClient, RetryableError, NonRetryableError
from app.core.models import GameAction, ActionType
from app.core.agent_prompts import PromptBuilderMixin

logger = logging.getLogger(__name__)


class AIAgent(PromptBuilderMixin):
    """AI智能体"""

    def __init__(
        self,
        agent_id: str,
        model_client: ModelClient,
        personality: Optional[Dict] = None,
        prompt_variant: Optional[Dict] = None,
        max_output_tokens: int = 1200,
        player_token_budget: int = 80_000,
        game_budget_check: Optional[Callable[[], Optional[str]]] = None,
        circuit_breaker_failures: int = 2,
        budget_reserve: Optional[
            Callable[[str, int, int], Awaitable[Dict]]
        ] = None,
        budget_settle: Optional[Callable[[object, Dict], Awaitable[None]]] = None,
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
        self.prompt_variant = prompt_variant
        self.max_output_tokens = max_output_tokens
        self.player_token_budget = player_token_budget
        self.game_budget_check = game_budget_check
        self.budget_reserve = budget_reserve
        self.budget_settle = budget_settle
        self.circuit_breaker_failures = max(1, circuit_breaker_failures)
        self.memory: List[Dict] = []
        self.last_decision_error: Optional[Dict] = None
        self.last_decision_metrics: Dict = {}
        self._consecutive_failures = 0
        self._circuit_open_round: Optional[int] = None

    def update_memory(self, event: Dict):
        """更新记忆"""
        self.memory.append(event)

    def get_recent_memory(self, limit: int = 12) -> str:
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
        started_at = time.perf_counter()
        round_no = int(visible_state.get("round", 0))
        usage_before = self._usage_snapshot()
        self.last_decision_error = None
        self.last_decision_metrics = {}

        blocked_reason = self._request_block_reason(round_no, usage_before)
        if blocked_reason:
            return self._fallback_with_diagnostic(
                available_actions,
                blocked_reason,
                usage_before,
                started_at,
                {},
                0,
                round_no,
            )

        # 构建提示词
        system_prompt = self._build_system_prompt(visible_state)
        action_prompt = self._build_action_prompt(
            visible_state,
            available_actions
        )

        response = await self._generate_with_retry(
            action_prompt,
            system_prompt,
            temperature=self._decision_temperature(),
        )
        request_attempts = int(response.get("_request_attempts", 1))
        last_reason = response.get("_last_error")
        parsed = response.get("parsed")

        if not last_reason and isinstance(parsed, dict):
            action, ok, last_reason = self._build_action(
                parsed,
                available_actions,
                visible_state,
            )
            if ok and action is not None:
                self._consecutive_failures = 0
                self._circuit_open_round = None
                self.last_decision_metrics = self._decision_metrics(
                    True,
                    usage_before,
                    started_at,
                    response,
                    request_attempts,
                )
                return action
            logger.warning("[%s] 动作语义校验失败: %s", self.agent_id, last_reason)
        elif not last_reason:
            last_reason = (
                response.get("parse_error")
                if parsed is None
                else "模型响应的 JSON 顶层不是对象"
            ) or "模型响应不是有效 JSON"
            logger.warning("[%s] LLM 响应未解析成功: %s", self.agent_id, last_reason)

        if not response.get("_budget_blocked"):
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.circuit_breaker_failures:
                self._circuit_open_round = round_no
        return self._fallback_with_diagnostic(
            available_actions,
            last_reason or "模型未返回有效动作",
            usage_before,
            started_at,
            response,
            request_attempts,
            round_no,
        )

    def _build_action(
        self,
        parsed: Dict,
        available_actions: List[Dict],
        visible_state: Optional[Dict] = None,
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
        if (
            action_type == ActionType.SPEAK
            and spec.get("target_required")
            and target_id is None
            and parameters.get("intended_vote") in spec.get("valid_targets", [])
        ):
            target_id = parameters["intended_vote"]
        if spec.get("target_required"):
            if target_id not in spec.get("valid_targets", []):
                return None, False, f"target {target_id} 不在合法目标 {spec.get('valid_targets')} 中"
        else:
            # pass/abstain/withdraw 的语义与目标无关；部分兼容端点会沿用
            # 上一动作的 target，安全丢弃即可，避免有效决策整次降级。
            if action_type in {
                ActionType.PASS,
                ActionType.ABSTAIN,
                ActionType.WITHDRAW,
                ActionType.WOLF_SPEAK,
            }:
                target_id = None
            elif target_id is not None:
                return None, False, f"该动作不需要 target，却传了 {target_id}"
        # 兼容部分 OpenAI-compatible 模型把理由放进 chosen_action.parameters。
        # 顶层 reasoning 仍优先，缺失时保留嵌套值，避免有效弃票被误判为空理由。
        parameters["reasoning"] = (
            parsed.get("reasoning") or parameters.get("reasoning", "")
        )
        if not isinstance(parameters["reasoning"], str) or len(parameters["reasoning"]) > 500:
            return None, False, "reasoning 缺失或超长"
        if action_type in (ActionType.SPEAK, ActionType.WOLF_SPEAK):
            content = parameters.get("content")
            if not isinstance(content, str) or not content.strip() or len(content) > 500:
                return None, False, "发言动作缺少合法 content"
            if (
                action_type == ActionType.WOLF_SPEAK
                and visible_state
                and self._is_redundant_wolf_speech(
                    content,
                    visible_state.get("werewolf_discussion", []),
                )
                and any(a["action_type"] == "pass" for a in available_actions)
            ):
                return GameAction(
                    action_type=ActionType.PASS,
                    actor_id=self.agent_id,
                    parameters={"reasoning": "队友已经表达相同目标和依据，避免重复发言"},
                ), True, ""
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
            self._normalize_stance_parameters(parameters, spec)
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

    @staticmethod
    def _is_redundant_wolf_speech(content: str, discussion: List[Dict]) -> bool:
        """识别复述队友结论的狼聊；出现新目标时始终保留。"""
        previous = [
            item.get("content", "")
            for item in discussion
            if isinstance(item, dict) and isinstance(item.get("content"), str)
        ]
        if not previous:
            return False

        player_pattern = r"AI-\d+"
        mentioned = {
            player_id.upper()
            for player_id in re.findall(player_pattern, content, flags=re.IGNORECASE)
        }
        previous_mentions = {
            player_id.upper()
            for player_id in re.findall(
                player_pattern,
                " ".join(previous),
                flags=re.IGNORECASE,
            )
        }
        if mentioned - previous_mentions:
            return False

        if any(marker in content[:40] for marker in (
            "同意", "赞同", "支持", "没问题", "就按", "跟随",
        )):
            return True

        normalized = re.sub(r"[\W_]+", "", content).lower()
        for earlier in previous:
            prior = re.sub(r"[\W_]+", "", earlier).lower()
            if min(len(normalized), len(prior)) < 12:
                continue
            if normalized in prior or prior in normalized:
                return True
            if SequenceMatcher(None, normalized, prior, autojunk=False).ratio() >= 0.45:
                return True
        return False

    @staticmethod
    def _normalize_stance_parameters(parameters: Dict, spec: Dict) -> None:
        """清洗可选的公开立场元数据，不因辅助字段瑕疵丢掉整段发言。"""
        schema = spec.get("parameters", {})

        def player_list(field: str) -> List[str]:
            field_schema = schema.get(field, {})
            valid = set(field_schema.get("items", {}).get("enum", []))
            limit = int(field_schema.get("maxItems", 3))
            raw = parameters.get(field, [])
            if not isinstance(raw, list):
                return []
            cleaned = []
            for value in raw:
                if isinstance(value, str) and value in valid and value not in cleaned:
                    cleaned.append(value)
            return cleaned[:limit]

        suspects = player_list("suspects")
        trusted = [player for player in player_list("trusted") if player not in suspects]
        parameters["suspects"] = suspects
        parameters["trusted"] = trusted

        vote_schema = schema.get("intended_vote", {})
        intended_vote = parameters.get("intended_vote")
        if intended_vote in ("", "none", "undecided", "null"):
            intended_vote = None
        parameters["intended_vote"] = (
            intended_vote if intended_vote in vote_schema.get("enum", []) else None
        )

        reads_schema = schema.get("role_reads", {})
        valid_players = set(reads_schema.get("allowed_players", []))
        valid_reads = set(reads_schema.get("allowed_values", []))
        max_reads = int(reads_schema.get("maxProperties", 4))
        raw_reads = parameters.get("role_reads", {})
        parameters["role_reads"] = {
            player: read
            for player, read in (
                raw_reads.items() if isinstance(raw_reads, dict) else []
            )
            if (
                isinstance(player, str)
                and isinstance(read, str)
                and player in valid_players
                and read in valid_reads
            )
        }
        parameters["role_reads"] = dict(
            list(parameters["role_reads"].items())[:max_reads]
        )

        evidence_schema = schema.get("evidence_event_indexes", {})
        available_count = int(evidence_schema.get("available_count", 0))
        allowed_evidence = set(
            evidence_schema.get("allowed_values", range(available_count))
        )
        max_evidence = int(evidence_schema.get("maxItems", 5))
        raw_evidence = parameters.get("evidence_event_indexes", [])
        evidence = []
        if isinstance(raw_evidence, list):
            for index in raw_evidence:
                if (
                    isinstance(index, int)
                    and not isinstance(index, bool)
                    and index in allowed_evidence
                    and index not in evidence
                ):
                    evidence.append(index)
        parameters["evidence_event_indexes"] = evidence[:max_evidence]

    async def _generate_with_retry(
        self,
        prompt: str,
        system_prompt: str,
        max_attempts: int = 2,
        base_delay: float = 1.5,
        temperature: float = 0.7,
    ) -> Dict:
        """仅重试网络类错误；格式和语义修正由 decide 统一控制。"""
        last_error: Optional[Exception] = None
        input_reserve = self._estimate_input_token_reserve(prompt, system_prompt)
        for attempt in range(1, max_attempts + 1):
            reservation: Dict = {}
            request_max_tokens = self.max_output_tokens
            if self.budget_reserve:
                try:
                    reservation = await self.budget_reserve(
                        self.agent_id,
                        input_reserve,
                        self.max_output_tokens,
                    )
                except Exception as error:
                    logger.exception("[%s] 预留模型预算失败: %s", self.agent_id, error)
                    return {
                        "parsed": None,
                        "_last_error": f"模型预算预留失败，已停止调用: {error}",
                        "_request_attempts": attempt - 1,
                    }
                if reservation.get("reason"):
                    return {
                        "parsed": None,
                        "_last_error": reservation["reason"],
                        "_request_attempts": attempt - 1,
                        "_budget_blocked": True,
                    }
                request_max_tokens = max(1, int(
                    reservation.get("max_tokens", self.max_output_tokens)
                ))

            usage_before = self._usage_snapshot()
            response: Optional[Dict] = None
            try:
                try:
                    response = await self.model_client.generate(
                        prompt=prompt, system_prompt=system_prompt,
                        json_mode=True, temperature=temperature,
                        max_tokens=request_max_tokens,
                    )
                finally:
                    reservation_id = reservation.get("reservation_id")
                    if reservation_id is not None and self.budget_settle:
                        provider_usage = (response or {}).get("usage") or self._usage_delta(usage_before)
                        try:
                            await self.budget_settle(reservation_id, provider_usage)
                        except Exception as error:
                            # 不因本地统计失败丢弃已返回的模型结果。
                            logger.exception("[%s] 结算模型预算失败: %s", self.agent_id, error)
                assert response is not None
                response["_request_attempts"] = attempt
                return response

            except NonRetryableError as e:
                logger.error("[%s] LLM 不可重试错误，放弃: %s", self.agent_id, e)
                return {"parsed": None, "_last_error": str(e), "_request_attempts": attempt}
            except RetryableError as e:
                last_error = e
                if attempt >= max_attempts:
                    logger.error("[%s] LLM 重试 %d 次仍失败，降级: %s", self.agent_id, max_attempts, e)
                    break
                delay = min(base_delay * (2 ** (attempt - 1)), 15.0)
                import random as _r
                delay = delay * (0.5 + _r.random() * 0.5)
                logger.warning("[%s] LLM 可重试错误（attempt %d/%d），%.1fs 后重试: %s",
                               self.agent_id, attempt, max_attempts, delay, e)
                await asyncio.sleep(delay)
            except Exception as e:
                logger.exception("[%s] LLM 未知错误，放弃重试: %s", self.agent_id, e)
                return {"parsed": None, "_last_error": str(e), "_request_attempts": attempt}

        return {
            "parsed": None,
            "_last_error": str(last_error) if last_error else "unknown",
            "_request_attempts": max_attempts,
        }

    @staticmethod
    def _estimate_input_token_reserve(prompt: str, system_prompt: str) -> int:
        """保守估计本次输入的最大 token 占用。

        字节数上界兼容中英文与不同 tokenizer，256 用于覆盖聊天消息包装与
        provider 附加的 JSON 指令。预留会在请求结束后按实际 usage 释放。
        """
        content = f"{system_prompt}\n{prompt}"
        return len(content.encode("utf-8")) + 256

    def _usage_snapshot(self) -> Dict:
        try:
            return self.model_client.get_total_usage()
        except (AttributeError, NotImplementedError):
            return {}

    def _request_block_reason(self, round_no: int, usage: Dict) -> Optional[str]:
        if self._circuit_open_round is not None and self._circuit_open_round != round_no:
            self._circuit_open_round = None
            self._consecutive_failures = 0
        if self._circuit_open_round == round_no:
            return f"本回合连续失败达到 {self.circuit_breaker_failures} 次，熔断后续模型调用"
        if self.player_token_budget > 0 and usage.get("total_tokens", 0) >= self.player_token_budget:
            return f"玩家 token 预算已达到 {self.player_token_budget}，停止继续调用模型"
        if self.game_budget_check:
            try:
                return self.game_budget_check()
            except Exception as error:
                logger.warning("[%s] 检查全局模型预算失败: %s", self.agent_id, error)
        return None

    def _usage_delta(self, before: Dict) -> Dict:
        after = self._usage_snapshot()
        return {
            key: max(0, after.get(key, 0) - before.get(key, 0))
            for key in (
                "total_input_tokens",
                "total_output_tokens",
                "total_tokens",
                "estimated_cost",
            )
        }

    def _decision_metrics(
        self,
        success: bool,
        usage_before: Dict,
        started_at: float,
        response: Dict,
        attempts: int,
        reason: Optional[str] = None,
    ) -> Dict:
        return {
            "success": success,
            "attempts": attempts,
            "latency_ms": round((time.perf_counter() - started_at) * 1000),
            "usage": self._usage_delta(usage_before),
            "finish_reason": response.get("finish_reason"),
            "json_repaired": bool(response.get("json_repaired")),
            "failure_reason": reason,
        }

    def _fallback_with_diagnostic(
        self,
        available_actions: List[Dict],
        reason: str,
        usage_before: Dict,
        started_at: float,
        response: Dict,
        attempts: int,
        round_no: int,
    ) -> GameAction:
        action = self._fallback_action(available_actions, round_no)
        metrics = self._decision_metrics(
            False,
            usage_before,
            started_at,
            response,
            attempts,
            reason,
        )
        self.last_decision_metrics = metrics
        self.last_decision_error = {
            "reason": reason,
            "attempts": attempts,
            "usage": metrics["usage"],
            "response_excerpt": str(response.get("content") or "")[:300],
            "finish_reason": response.get("finish_reason"),
        }
        return action

    def _fallback_action(
        self,
        available_actions: List[Dict],
        round_no: int = 0,
    ) -> GameAction:
        chosen = next(
            (
                action for action in available_actions
                if action["action_type"] in {"pass", "abstain"}
            ),
            available_actions[0],
        )
        parameters = {"reasoning": "模型不可用，使用默认动作"}
        if chosen["action_type"] in ("speak", "wolf_speak"):
            if chosen["action_type"] == "wolf_speak":
                parameters.update(content="建议优先刀最像神职的玩家。")
            else:
                parameters.update(
                    content="我暂时没有新的信息。",
                    claim_role="none",
                    suspects=[],
                    trusted=[],
                    intended_vote=None,
                    role_reads={},
                    evidence_event_indexes=[],
                )
        targets = chosen.get("valid_targets") or []
        if chosen["action_type"] == "kill":
            # 自刀必须是模型的主动策略，不能由本地降级随机制造。
            # 只要还有其他合法刀口，兜底就排除狼人自己。
            safe_targets = [target for target in targets if target != self.agent_id]
            if safe_targets:
                targets = safe_targets
                target_index = max(round_no - 1, 0) % len(targets)
            else:
                target_index = round_no % len(targets) if targets else 0
        else:
            target_index = round_no % len(targets) if targets else 0
        target = targets[target_index] if targets else None
        return GameAction(
            ActionType(chosen["action_type"]),
            self.agent_id,
            target,
            parameters,
        )
