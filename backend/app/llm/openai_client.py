"""
OpenAI 兼容协议客户端实现。

覆盖所有走 OpenAI 兼容接口的 provider（通过 base_url 区分）：
  - OpenAI 官方
  - DeepSeek
  - Google Gemini（官方 OpenAI 兼容端点）
  - 通义千问 Qwen（DashScope 兼容接口）
  - Kimi、Xiaomi MiMo、MiniMax、智谱 GLM
  - 硅基流动 SiliconFlow

只需 openai SDK，无需为每家单独装 SDK。
"""
from openai import AsyncOpenAI
from typing import Dict, Optional
from app.llm.client import (
    ModelClient,
    NonRetryableError,
    RetryableError,
    parse_json_response,
)


class OpenAICompatibleClient(ModelClient):
    """OpenAI 兼容协议客户端。所有 OpenAI 格式的 provider 共用此类。"""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-5.6-luna",
        base_url: Optional[str] = None,
        cost_per_1m_input: float = 0.4,
        cost_per_1m_output: float = 1.6
    ):
        """
        初始化客户端

        Args:
            api_key: API 密钥
            model: 模型 ID（由 registry / orchestrator 传入）
            base_url: API 基础 URL（不同 provider 不同；None 用 OpenAI 默认）
            cost_per_1m_input: 每 1M 输入 token 成本（美元）
            cost_per_1m_output: 每 1M 输出 token 成本（美元）
        """
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            max_retries=0,
        )
        self.model = model
        self.base_url = base_url
        # 成本单位统一为每 1M token（与 config/models.yaml、业界报价一致）
        self.cost_per_1m_input = cost_per_1m_input
        self.cost_per_1m_output = cost_per_1m_output
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_mode: bool = True,
        temperature: float = 0.7,
        max_tokens: int = 1500
    ) -> Dict:
        """生成响应"""

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        model_name = self.model.casefold()
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": 1.0 if model_name.startswith("kimi-k") else temperature,
        }
        kwargs["max_completion_tokens" if model_name.startswith("mimo-") else "max_tokens"] = max_tokens
        if model_name.startswith("minimax-"):
            kwargs["extra_body"] = {"reasoning_split": True}

        # JSON 模式（部分兼容 provider 可能不支持 response_format，
        # 失败时由调用方/解析层降级到正则抽取 JSON）
        if json_mode and model_name != "longcat-2.0" and not model_name.startswith("minimax-"):
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self.client.chat.completions.create(**kwargs)

            # 记录 token 使用
            usage = response.usage
            self.total_input_tokens += usage.prompt_tokens
            self.total_output_tokens += usage.completion_tokens

            result = {
                "content": response.choices[0].message.content,
                "usage": {
                    "input_tokens": usage.prompt_tokens,
                    "output_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens
                },
                "model": response.model,
                "finish_reason": response.choices[0].finish_reason
            }

            # 如果是 JSON 模式，解析 JSON
            if json_mode:
                parsed, parse_error, repaired = parse_json_response(result["content"])
                result["parsed"] = parsed
                result["json_repaired"] = repaired
                if parse_error:
                    result["parse_error"] = parse_error

            return result

        except Exception as e:
            # 区分可重试错误（网络/超时/限流/服务端临时故障）与不可重试错误
            # （鉴权失败/模型不存在/请求格式错误）。前者交给上层带退避重试，
            # 后者立即失败避免无意义重试浪费配额。
            name = type(e).__name__
            msg = str(e)
            # openai SDK 的异常类名：APIConnectionError/APITimeoutError/RateLimitError/
            # InternalServerError 可重试；AuthenticationError/NotFoundError/BadRequestError 不可重试
            retryable_names = {
                "APIConnectionError", "APITimeoutError", "RateLimitError",
                "InternalServerError", "APIError", "ConflictError",
            }
            # 兜底：状态码 408/429/5xx 或明显网络错误也视为可重试
            status = getattr(e, "status_code", None) or getattr(getattr(e, "response", None), "status_code", None)
            is_retryable = (
                name in retryable_names
                or status in (408, 425, 429, 500, 502, 503, 504)
                or any(k in msg for k in ("timeout", "timed out", "connection", "Connection", "temporarily", "overloaded"))
            )
            err_cls = RetryableError if is_retryable else NonRetryableError
            raise err_cls(f"LLM API调用失败[{name}]: {msg}") from e

    def get_total_usage(self) -> Dict:
        """获取总 token 使用情况"""
        total_tokens = self.total_input_tokens + self.total_output_tokens
        estimated_cost = self.estimate_cost(
            self.total_input_tokens,
            self.total_output_tokens
        )

        return {
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_tokens": total_tokens,
            "estimated_cost": estimated_cost
        }

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """估算成本（美元）。成本字段单位为每 1M token。"""
        input_cost = (input_tokens / 1_000_000) * self.cost_per_1m_input
        output_cost = (output_tokens / 1_000_000) * self.cost_per_1m_output
        return input_cost + output_cost


# 向后兼容别名：旧代码 import OpenAIClient 仍可用
OpenAIClient = OpenAICompatibleClient
