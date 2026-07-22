"""
LLM Model Client Interface
"""
from abc import ABC, abstractmethod
from typing import Dict, Optional


class ModelClient(ABC):
    """LLM客户端抽象基类"""

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
