"""
OpenAI API Client Implementation
Also compatible with Ollama (OpenAI-compatible API)
"""
from openai import AsyncOpenAI
import json
import os
from typing import Dict, Optional
from app.llm.client import ModelClient


class OpenAIClient(ModelClient):
    """OpenAI API客户端（也兼容Ollama）"""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: Optional[str] = None,
        cost_per_1k_input: float = 0.00015,
        cost_per_1k_output: float = 0.0006
    ):
        """
        初始化OpenAI客户端

        Args:
            api_key: API密钥
            model: 模型ID
            base_url: API基础URL（Ollama使用）
            cost_per_1k_input: 每1k输入token成本
            cost_per_1k_output: 每1k输出token成本
        """
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.model = model
        self.cost_per_1k_input = cost_per_1k_input
        self.cost_per_1k_output = cost_per_1k_output
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

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        # JSON模式
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self.client.chat.completions.create(**kwargs)

            # 记录token使用
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

            # 如果是JSON模式，解析JSON
            if json_mode:
                try:
                    result["parsed"] = json.loads(result["content"])
                except json.JSONDecodeError as e:
                    result["parse_error"] = str(e)
                    result["parsed"] = None

            return result

        except Exception as e:
            raise RuntimeError(f"LLM API调用失败: {str(e)}")

    def get_total_usage(self) -> Dict:
        """获取总token使用情况"""
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
        """估算成本（美元）"""
        input_cost = (input_tokens / 1000) * self.cost_per_1k_input
        output_cost = (output_tokens / 1000) * self.cost_per_1k_output
        return input_cost + output_cost


class OllamaClient(OpenAIClient):
    """Ollama本地模型客户端（OpenAI兼容）"""

    def __init__(
        self,
        model: str = "llama3.2",
        base_url: str = "http://localhost:11434/v1"
    ):
        """
        初始化Ollama客户端

        Args:
            model: 模型名称
            base_url: Ollama API地址
        """
        super().__init__(
            api_key="ollama",  # Ollama不需要真实API key
            model=model,
            base_url=base_url,
            cost_per_1k_input=0.0,  # 本地模型免费
            cost_per_1k_output=0.0
        )
