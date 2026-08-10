"""
LLM Model Client Interface

所有 provider 客户端的抽象基类。具体实现：
  - OpenAICompatibleClient: OpenAI/DeepSeek/Gemini/Qwen/Kimi/MiMo/MiniMax/GLM/SiliconFlow 等
    所有 OpenAI 兼容协议的 provider
  - ClaudeClient: Anthropic Claude（唯一非 OpenAI 协议）

成本单位约定：所有 cost / estimate_cost 统一按「每 1M token 美元」计算，
与 config/models.yaml 及业界报价口径一致。
"""
from abc import ABC, abstractmethod
import json
import re
from typing import Any, Dict, Optional, Tuple


def parse_json_response(content: Optional[str]) -> Tuple[Optional[Any], Optional[str], bool]:
    """解析模型 JSON；对代码围栏、前后说明和尾部截断做保守的本地修复。"""
    text = (content or "").strip()
    if not text:
        return None, "模型返回了空内容", False

    try:
        return json.loads(text), None, False
    except json.JSONDecodeError as original_error:
        pass

    fenced = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    fenced = re.sub(r"\s*```$", "", fenced).strip()
    decoder = json.JSONDecoder()
    for start in (index for index, char in enumerate(fenced) if char == "{"):
        try:
            value, _ = decoder.raw_decode(fenced[start:])
            return value, None, True
        except json.JSONDecodeError:
            repaired = _close_truncated_json(fenced[start:])
            if repaired:
                try:
                    return json.loads(repaired), None, True
                except json.JSONDecodeError:
                    pass

    return None, str(original_error), False


def _close_truncated_json(candidate: str) -> Optional[str]:
    """只补齐未闭合的字符串/括号，不猜测缺失字段或修改已有值。"""
    stack = []
    in_string = False
    escaped = False

    for char in candidate:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in "[{":
            stack.append(char)
        elif char in "]}":
            expected = "[" if char == "]" else "{"
            if not stack or stack.pop() != expected:
                return None

    if not stack and not in_string:
        return None

    result = candidate.rstrip()
    if in_string:
        if escaped and result.endswith("\\"):
            result = result[:-1]
        result += '"'
    for opener in reversed(stack):
        result = re.sub(r",\s*$", "", result)
        result += "]" if opener == "[" else "}"
    return result


class LLMError(RuntimeError):
    """LLM 调用错误基类。"""


class RetryableError(LLMError):
    """可重试错误：网络抖动、超时、限流(429)、服务端临时故障(5xx)。
    上层应带指数退避重试。"""


class NonRetryableError(LLMError):
    """不可重试错误：鉴权失败(401)、模型不存在(404)、请求格式错误(400)。
    重试无意义，应立即失败并暴露给调用方。"""


class ModelClient(ABC):
    """LLM 客户端抽象基类"""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_mode: bool = True,
        temperature: float = 0.7,
        max_tokens: int = 1500
    ) -> Dict:
        """
        生成响应

        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词
            json_mode: 是否使用JSON模式
            temperature: 温度参数
            max_tokens: 最大token数

        Returns:
            响应字典，包含content, usage等
        """
        pass

    @abstractmethod
    def get_total_usage(self) -> Dict:
        """
        获取总token使用情况

        Returns:
            包含total_tokens, estimated_cost的字典
        """
        pass

    @abstractmethod
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """
        估算成本（美元）

        Args:
            input_tokens: 输入token数
            output_tokens: 输出token数

        Returns:
            成本（美元）
        """
        pass
