# LLM API集成技术参考

**整理日期**: 2026-07-23  
**用途**: AI Arena LLM集成实现参考

---

## 1. OpenAI API集成

### 1.1 基础客户端

```python
from openai import AsyncOpenAI
import json

class OpenAIClient:
    """OpenAI API客户端"""
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        self.total_tokens = 0
    
    async def generate(
        self, 
        prompt: str, 
        system_prompt: str = None,
        json_mode: bool = True,
        temperature: float = 0.7,
        max_tokens: int = 1500
    ) -> dict:
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
        
        # JSON模式（确保输出是有效JSON）
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        
        response = await self.client.chat.completions.create(**kwargs)
        
        # 记录token使用
        usage = response.usage
        self.total_tokens += usage.total_tokens
        
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
        
        return result
    
    def get_total_usage(self) -> dict:
        """获取总token使用情况"""
        return {
            "total_tokens": self.total_tokens,
            "estimated_cost": self.estimate_cost(self.total_tokens)
        }
    
    def estimate_cost(self, total_tokens: int) -> float:
        """估算成本（美元）"""
        # GPT-4o定价（2024年数据，需要更新）
        # Input: $5/1M tokens, Output: $15/1M tokens
        # 简化计算：平均 $10/1M tokens
        return (total_tokens / 1_000_000) * 10
```

### 1.2 结构化输出（Function Calling）

```python
async def generate_with_tools(
    self,
    prompt: str,
    tools: list,
    tool_choice: str = "auto"
) -> dict:
    """使用工具调用（Function Calling）"""
    
    messages = [{"role": "user", "content": prompt}]
    
    response = await self.client.chat.completions.create(
        model=self.model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice
    )
    
    message = response.choices[0].message
    
    if message.tool_calls:
        # 模型选择调用工具
        tool_call = message.tool_calls[0]
        return {
            "type": "tool_call",
            "tool_name": tool_call.function.name,
            "tool_args": json.loads(tool_call.function.arguments),
            "usage": {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens
            }
        }
    else:
        # 模型直接回复
        return {
            "type": "message",
            "content": message.content,
            "usage": {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens
            }
        }
```

### 1.3 工具定义示例

```python
# 狼人杀动作工具定义
WEREWOLF_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "kill_player",
            "description": "狼人在夜晚杀死一个玩家",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_id": {
                        "type": "string",
                        "description": "要杀死的玩家ID"
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "选择该目标的理由"
                    }
                },
                "required": ["target_id", "reasoning"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "investigate_player",
            "description": "预言家查验一个玩家的身份",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_id": {
                        "type": "string",
                        "description": "要查验的玩家ID"
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "选择该目标的理由"
                    }
                },
                "required": ["target_id", "reasoning"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "vote_player",
            "description": "投票放逐一个玩家",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_id": {
                        "type": "string",
                        "description": "要投票的玩家ID"
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "投票理由（公开）"
                    }
                },
                "required": ["target_id", "reasoning"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "speak",
            "description": "在白天发言",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "发言内容"
                    },
                    "claim_role": {
                        "type": "string",
                        "enum": ["none", "seer", "villager"],
                        "description": "是否跳身份"
                    }
                },
                "required": ["content"]
            }
        }
    }
]
```

---

## 2. Ollama本地模型集成

### 2.1 Ollama客户端

Ollama提供OpenAI兼容的API，可以复用OpenAI客户端：

```python
class OllamaClient(OpenAIClient):
    """Ollama本地模型客户端（OpenAI兼容）"""
    
    def __init__(self, model: str = "llama3.2", base_url: str = "http://localhost:11434/v1"):
        # Ollama使用OpenAI兼容接口
        self.client = AsyncOpenAI(
            api_key="ollama",  # Ollama不需要真实API key
            base_url=base_url
        )
        self.model = model
        self.total_tokens = 0
    
    def estimate_cost(self, total_tokens: int) -> float:
        """本地模型成本为0"""
        return 0.0
```

### 2.2 支持的模型

```yaml
# Ollama模型列表
models:
  - name: "llama3.2"
    size: "3B"
    performance: "快速，适合测试"
    
  - name: "llama3.1"
    size: "8B"
    performance: "平衡"
    
  - name: "mistral"
    size: "7B"
    performance: "推理能力较强"
    
  - name: "mixtral"
    size: "47B"
    performance: "强力，但需要更多资源"
```

---

## 3. 统一模型接口

### 3.1 抽象基类

```python
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

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
        """生成响应"""
        pass
    
    @abstractmethod
    async def generate_with_tools(
        self,
        prompt: str,
        tools: List[Dict],
        tool_choice: str = "auto"
    ) -> Dict:
        """使用工具调用"""
        pass
    
    @abstractmethod
    def get_total_usage(self) -> Dict:
        """获取token使用情况"""
        pass
    
    @abstractmethod
    def estimate_cost(self, total_tokens: int) -> float:
        """估算成本"""
        pass
```

### 3.2 模型管理器

```python
class ModelManager:
    """模型管理器"""
    
    def __init__(self, config_path: str = "config/models.yaml"):
        self.config = self.load_config(config_path)
        self.clients = {}
    
    def load_config(self, path: str) -> Dict:
        """加载模型配置"""
        with open(path) as f:
            return yaml.safe_load(f)
    
    def create_client(
        self,
        provider: str,
        model_id: str,
        **kwargs
    ) -> ModelClient:
        """创建模型客户端"""
        
        if provider == "openai":
            return OpenAIClient(
                api_key=kwargs.get("api_key") or os.getenv("OPENAI_API_KEY"),
                model=model_id
            )
        
        elif provider == "ollama":
            return OllamaClient(
                model=model_id,
                base_url=kwargs.get("base_url", "http://localhost:11434/v1")
            )
        
        # 未来扩展：Claude、Gemini等
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    def get_model_info(self, provider: str, model_id: str) -> Dict:
        """获取模型信息"""
        models = self.config["providers"][provider]["models"]
        for model in models:
            if model["id"] == model_id:
                return model
        return None
```

---

## 4. Prompt工程最佳实践

### 4.1 系统提示词模板

```python
SYSTEM_PROMPT_TEMPLATE = """你是一个狼人杀游戏中的AI玩家。

# 你的角色
{role_description}

# 当前局势
回合: {round}
阶段: {phase}
存活玩家: {alive_players}
死亡玩家: {dead_players}

# 你的记忆
{memory_context}

# 行为准则
1. 严格按照你的角色行事
2. 不要泄露隐藏信息（如狼人身份）
3. 使用逻辑推理做出决策
4. 在公开发言中保持角色一致性

# 输出格式
你必须返回有效的JSON格式，包含以下字段：
- reasoning: 你的内部推理过程（不会被其他玩家看到）
- action: 你要执行的动作
- public_statement: 公开发言内容（如果需要）

请基于当前局势做出决策。
"""
```

### 4.2 角色描述

```python
ROLE_DESCRIPTIONS = {
    "werewolf": """
你是一名狼人。
- 目标：消灭所有好人，让狼人数量 ≥ 好人数量
- 能力：每晚选择一名玩家杀死
- 策略：隐藏身份，伪装成好人，在发言中误导其他玩家
- 注意：不要在公开发言中暴露自己是狼人
""",
    
    "seer": """
你是预言家（先知）。
- 目标：帮助好人阵营找出并放逐狼人
- 能力：每晚查验一名玩家的真实身份（好人/狼人）
- 策略：收集信息，选择合适时机公开身份，分享查验结果
- 注意：需要防备假预言家（狼人冒充）
""",
    
    "villager": """
你是一名普通村民。
- 目标：帮助好人阵营找出并放逐狼人
- 能力：无特殊能力，依靠观察和推理
- 策略：仔细分析每个人的发言，寻找矛盾点，合理投票
- 注意：你的发言和投票对好人阵营很重要
"""
}
```

### 4.3 动作提示词

```python
def build_action_prompt(
    available_actions: List[Dict],
    game_state: Dict,
    reasoning_depth: str = "standard"
) -> str:
    """构建动作选择提示词"""
    
    depth_prompts = {
        "quick": "请快速分析当前局势并选择一个动作。",
        "standard": """请分析当前局势：
1. 已知的信息有哪些？
2. 各个玩家的可疑程度如何？
3. 你的最佳策略是什么？
然后选择一个动作。""",
        "deep": """请进行深度分析：
1. 回顾所有历史信息和发言
2. 分析每个玩家的行为模式和矛盾点
3. 构建完整的逻辑推理链
4. 评估各种可能性的概率
5. 制定详细的决策策略
然后选择最优动作。"""
    }
    
    prompt = f"""
{depth_prompts[reasoning_depth]}

# 可选动作
你可以从以下动作中选择一个：

{json.dumps(available_actions, ensure_ascii=False, indent=2)}

# 当前游戏状态
{json.dumps(game_state, ensure_ascii=False, indent=2)}

请返回JSON格式：
{{
    "reasoning": "你的推理过程（2-3句话）",
    "chosen_action": {{
        "action_type": "...",
        "target": "...",  // 如果需要
        "parameters": {{}}  // 其他参数
    }}
}}
"""
    return prompt
```

---

## 5. 错误处理和重试

### 5.1 重试机制

```python
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential

class RobustModelClient:
    """带重试机制的模型客户端"""
    
    def __init__(self, base_client: ModelClient):
        self.client = base_client
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def generate_with_retry(self, *args, **kwargs):
        """带重试的生成"""
        try:
            return await self.client.generate(*args, **kwargs)
        except Exception as e:
            print(f"API调用失败: {e}, 正在重试...")
            raise
    
    async def generate_with_fallback(
        self,
        prompt: str,
        fallback_action: Dict = None,
        **kwargs
    ):
        """带降级的生成"""
        try:
            return await self.generate_with_retry(prompt, **kwargs)
        except Exception as e:
            print(f"所有重试失败: {e}")
            if fallback_action:
                print(f"使用降级动作: {fallback_action}")
                return {"parsed": fallback_action, "fallback": True}
            else:
                raise
```

### 5.2 JSON解析容错

```python
def safe_parse_json(content: str) -> Dict:
    """安全解析JSON，带容错"""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # 尝试提取JSON块
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except:
                pass
        
        # 如果仍然失败，返回错误信息
        return {
            "error": "JSON解析失败",
            "raw_content": content
        }
```

---

## 6. Token使用优化

### 6.1 上下文压缩

```python
def compress_memory(memory: List[Dict], max_events: int = 20) -> str:
    """压缩记忆，只保留最重要的事件"""
    
    # 优先级排序
    priority_events = []
    for event in memory:
        priority = 0
        
        # 关键事件优先级更高
        if event["type"] == "death":
            priority += 10
        elif event["type"] == "role_claim":
            priority += 8
        elif event["type"] == "investigation_result":
            priority += 9
        elif event["type"] == "vote":
            priority += 5
        elif event["type"] == "speech":
            priority += 3
        
        priority_events.append((priority, event))
    
    # 按优先级排序，取前N个
    priority_events.sort(reverse=True, key=lambda x: x[0])
    important_events = [e[1] for e in priority_events[:max_events]]
    
    # 转换为简洁文本
    return "\n".join([format_event(e) for e in important_events])
```

### 6.2 批量处理

```python
async def batch_generate(
    self,
    prompts: List[str],
    batch_size: int = 5
) -> List[Dict]:
    """批量生成，减少API调用次数"""
    
    results = []
    for i in range(0, len(prompts), batch_size):
        batch = prompts[i:i+batch_size]
        
        # 并发处理一批
        tasks = [self.client.generate(p) for p in batch]
        batch_results = await asyncio.gather(*tasks)
        results.extend(batch_results)
    
    return results
```

---

## 7. 成本追踪

### 7.1 数据库记录

```sql
CREATE TABLE llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT,
    player_id TEXT,
    round INTEGER,
    action_type TEXT,
    model_provider TEXT,
    model_id TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost REAL,
    timestamp DATETIME,
    FOREIGN KEY (game_id) REFERENCES games(id)
);
```

### 7.2 成本聚合

```python
def get_game_cost(game_id: str) -> Dict:
    """计算一局游戏的总成本"""
    query = """
    SELECT 
        model_provider,
        model_id,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(estimated_cost) as total_cost
    FROM llm_usage
    WHERE game_id = ?
    GROUP BY model_provider, model_id
    """
    
    results = db.execute(query, (game_id,))
    
    return {
        "breakdown": results,
        "total_cost": sum(r["total_cost"] for r in results),
        "total_tokens": sum(r["total_input"] + r["total_output"] for r in results)
    }
```

---

## 8. 实现检查清单

MVP实现LLM集成时需要：

- [ ] OpenAI客户端基础实现
- [ ] JSON模式支持
- [ ] Ollama客户端（复用OpenAI接口）
- [ ] 统一ModelClient接口
- [ ] ModelManager管理多个客户端
- [ ] 系统提示词模板
- [ ] 角色描述
- [ ] 动作提示词生成
- [ ] 错误处理和重试
- [ ] JSON解析容错
- [ ] Token使用记录
- [ ] 成本追踪

---

**文档结束**

这些技术将用于实现AI Arena的LLM集成层。
