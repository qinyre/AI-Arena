"""
Anthropic Claude API Client Implementation
"""
import anthropic
import json
import os
from typing import Dict, Optional
from app.llm.client import ModelClient


class ClaudeClient(ModelClient):
    """Anthropic Claude API客户端"""

    def __init__(
        self,
        api_key: str,
        model: str = "claude-3-5-sonnet-20241022",
        cost_per_1k_input: float = 0.003,
        cost_per_1k_output: float = 0.015
    ):
        """
        初始化Claude客户端

        Args:
            api_key: Anthropic API密钥
            model: 模型ID
            cost_per_1k_input: 每1k输入token成本
            cost_per_1k_output: 每1k输出token成本
        """
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
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

        messages = [{"role": "user", "content": prompt}]

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        # 添加系统提示词
        if system_prompt:
            kwargs["system"] = system_prompt

        # JSON模式提示（Claude没有原生JSON mode，通过提示词实现）
        if json_mode:
            if system_prompt:
                kwargs["system"] = system_prompt + "\n\n请确保你的响应是有效的JSON格式。"
            else:
                kwargs["system"] = "请确保你的响应是有效的JSON格式。"

        try:
            response = await self.client.messages.create(**kwargs)

            # 记录token使用
            usage = response.usage
            self.total_input_tokens += usage.input_tokens
            self.total_output_tokens += usage.output_tokens

            # 提取文本内容
            content = ""
            for block in response.content:
                if block.type == "text":
                    content += block.text

            result = {
                "content": content,
                "usage": {
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "total_tokens": usage.input_tokens + usage.output_tokens
                },
                "model": response.model,
                "finish_reason": response.stop_reason
            }

            # 如果是JSON模式，解析JSON
            if json_mode:
                try:
                    result["parsed"] = json.loads(content)
                except json.JSONDecodeError as e:
                    # Claude有时会在JSON前后添加说明文字，尝试提取
                    import re
                    json_match = re.search(r'\{.*\}', content, re.DOTALL)
                    if json_match:
                        try:
                            result["parsed"] = json.loads(json_match.group())
                        except:
                            result["parse_error"] = str(e)
                            result["parsed"] = None
                    else:
                        result["parse_error"] = str(e)
                        result["parsed"] = None

            return result

        except Exception as e:
            raise RuntimeError(f"Claude API调用失败: {str(e)}")

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
