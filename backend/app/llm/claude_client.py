"""
Anthropic Claude API Client Implementation

Claude 是项目中唯一使用非 OpenAI 协议的 provider，故单独实现。
其余 provider（OpenAI/DeepSeek/Gemini/Qwen/SiliconFlow/Ollama）
走 OpenAICompatibleClient。
"""
import anthropic
import json
from typing import Dict, Optional
from app.llm.client import ModelClient


class ClaudeClient(ModelClient):
    """Anthropic Claude API 客户端"""

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-5",
        cost_per_1m_input: float = 3.0,
        cost_per_1m_output: float = 15.0
    ):
        """
        初始化 Claude 客户端

        Args:
            api_key: Anthropic API 密钥
            model: 模型 ID
            cost_per_1m_input: 每 1M 输入 token 成本（美元）
            cost_per_1m_output: 每 1M 输出 token 成本（美元）
        """
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        # 成本单位统一为每 1M token（与 config/models.yaml 一致）
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

        # JSON 模式提示（Claude 没有原生 JSON mode，通过提示词实现）
        if json_mode:
            if system_prompt:
                kwargs["system"] = system_prompt + "\n\n请确保你的响应是有效的JSON格式。"
            else:
                kwargs["system"] = "请确保你的响应是有效的JSON格式。"

        try:
            response = await self.client.messages.create(**kwargs)

            # 记录 token 使用
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

            # 如果是 JSON 模式，解析 JSON
            if json_mode:
                try:
                    result["parsed"] = json.loads(content)
                except (json.JSONDecodeError, TypeError) as e:
                    # Claude 有时会在 JSON 前后添加说明文字，尝试提取
                    import re
                    json_match = re.search(r'\{.*\}', content or "", re.DOTALL)
                    if json_match:
                        try:
                            result["parsed"] = json.loads(json_match.group())
                        except json.JSONDecodeError:
                            result["parse_error"] = str(e)
                            result["parsed"] = None
                    else:
                        result["parse_error"] = str(e)
                        result["parsed"] = None

            return result

        except Exception as e:
            raise RuntimeError(f"Claude API调用失败: {str(e)}")

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
