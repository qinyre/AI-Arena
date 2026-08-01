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
from typing import Dict, Optional


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
