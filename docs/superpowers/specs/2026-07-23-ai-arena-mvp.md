# AI Arena - MVP设计文档

**项目名称**: AI Arena (AI竞技场)  
**文档类型**: MVP (Minimum Viable Product)  
**创建日期**: 2026-07-23  
**文档版本**: v1.0  
**目标**: 可复现、可观战的极简狼人杀

---

## 1. MVP定义

### 1.1 核心目标

**Minimum Viable Werewolf** - 先把一个游戏做对、做透

让5个AI完整玩完一局极简狼人杀，结果可复现，过程可观战。

**不是**"通用AI游戏竞技平台"，而是聚焦于验证核心概念：
- 确定性游戏内核能否与LLM推理良好结合
- AI能否理解社交推理（撒谎、信任、投票）
- 系统架构是否可扩展

### 1.2 MVP范围

**包含**:
- ✅ 5人极简狼人杀（1狼人 + 1预言家 + 3村民）
- ✅ OpenAI兼容接口（覆盖OpenAI + Ollama）
- ✅ 结构化动作协议（防止模型越权）
- ✅ 完整事件日志和可复现性
- ✅ 朴素Web观战界面

**不包含**（延后到v1.0）:
- ❌ 女巫、猎人、守卫等复杂角色
- ❌ 多模型供应商（Claude、Gemini）
- ❌ 性格系统
- ❌ Canvas渲染、录制、数据分析仪表盘
- ❌ 推理深度配置
- ❌ 多游戏框架

### 1.3 成功标准

**MVP完成的标志**:
1. 能稳定跑完一局5人狼人杀（无崩溃）
2. 游戏规则严格执行（无越权、无幻觉技能）
3. 完整记录可复现（模型版本、种子、提示词）
4. Web界面可实时观战
5. 代码结构清晰，易于扩展

---

## 2. 游戏规则

### 2.1 极简狼人杀规则

**玩家配置**: 5人
- 1个狼人
- 1个预言家
- 3个村民

**游戏流程**:

#### 初始化
1. 随机分配角色（记录随机种子）
2. 狼人知道自己身份
3. 预言家知道自己身份
4. 村民不知道任何人身份

#### 夜晚阶段
1. **狼人行动**: 选择一个玩家杀死
2. **预言家行动**: 选择一个玩家查验身份（得知好人/狼人）

#### 白天阶段
1. **公布死者**: 宣布昨晚被杀的玩家
2. **依次发言**: 存活玩家依次发言（可选择跳身份、指控、分析）
3. **投票**: 所有存活玩家投票选择放逐一人
4. **处决**: 票数最多的玩家出局（平票则无人出局）

#### 胜利条件
- **狼人胜利**: 好人数量 ≤ 狼人数量（1人）
- **好人胜利**: 狼人被投票出局

#### 简化规则
- 预言家死亡不能传递警徽
- 没有遗言环节
- 投票平票时无人出局，继续下一轮
- 第一晚不杀人（从第1天开始发言）

---

## 3. 系统架构

### 3.1 技术栈

```yaml
后端:
  语言: Python 3.11+
  框架: FastAPI
  数据库: SQLite
  LLM集成: OpenAI SDK (兼容接口)

前端:
  框架: React 18 + TypeScript
  UI库: Tailwind CSS
  构建工具: Vite
  通信: WebSocket

部署:
  容器化: Docker + Docker Compose
```

### 3.2 系统分层

```
┌─────────────────────────────────────┐
│     Frontend (React + WebSocket)    │
│     - 实时对话流                     │
│     - 游戏阶段显示                   │
│     - 投票结果展示                   │
└────────────────┬────────────────────┘
                 │ WebSocket
┌────────────────▼────────────────────┐
│     Backend (FastAPI)               │
│                                      │
│  ┌────────────────────────────┐    │
│  │  GameOrchestrator          │    │
│  │  - 对局生命周期管理         │    │
│  │  - 事件广播                 │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  WerewolfGame              │    │
│  │  - 游戏规则引擎             │    │
│  │  - 动作验证                 │    │
│  │  - 信息过滤                 │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  AIAgent                   │    │
│  │  - 感知游戏状态             │    │
│  │  - 调用LLM推理              │    │
│  │  - 提交结构化动作           │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  ModelClient               │    │
│  │  - OpenAI兼容接口           │    │
│  │  - Token使用记录            │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  SQLite                    │    │
│  │  - 事件日志                 │    │
│  │  - 对局元数据               │    │
│  └────────────────────────────┘    │
└──────────────────────────────────────┘
```

---

## 4. 核心设计

### 4.1 动作协议（信任边界）

**核心原则**: 模型不能自由文本操作游戏，只能从合法动作列表中选择

#### 4.1.1 动作Schema

游戏每轮向AI提供JSON Schema定义的可选动作：

```json
{
  "available_actions": [
    {
      "action_type": "kill",
      "description": "选择一个玩家杀死（仅狼人可用）",
      "target_required": true,
      "valid_targets": ["player_2", "player_3", "player_4", "player_5"]
    },
    {
      "action_type": "investigate",
      "description": "查验一个玩家身份（仅预言家可用）",
      "target_required": true,
      "valid_targets": ["player_1", "player_2", "player_4", "player_5"]
    },
    {
      "action_type": "speak",
      "description": "发言",
      "target_required": false,
      "parameters": {
        "content": "string (发言内容)"
      }
    },
    {
      "action_type": "vote",
      "description": "投票放逐一个玩家",
      "target_required": true,
      "valid_targets": ["player_1", "player_2", "player_4", "player_5"]
    }
  ]
}
```

#### 4.1.2 动作提交

AI返回结构化动作：

```json
{
  "action_type": "vote",
  "target": "player_2",
  "reasoning": "AI-2在第一轮发言时声称是预言家，但其逻辑与已知信息矛盾"
}
```

#### 4.1.3 后端验证

```python
def validate_action(action: Action, player: Player, game_state: GameState) -> bool:
    """严格验证动作合法性"""
    # 1. 检查动作类型是否在当前阶段允许
    if action.type not in game_state.allowed_actions:
        return False
    
    # 2. 检查玩家是否有权限执行此动作
    if not player.can_perform(action.type):
        return False
    
    # 3. 检查目标是否合法
    if action.target and action.target not in get_valid_targets(player, game_state):
        return False
    
    return True
```

**防止问题**:
- ❌ 村民幻觉自己是预言家
- ❌ 狼人投票两次
- ❌ 预言家查验已死玩家
- ❌ 模型自由文本解析导致的歧义

### 4.2 信息过滤

每个AI只能看到其角色允许的信息：

```python
def get_visible_state(player_id: str, game_state: GameState) -> Dict:
    """根据角色过滤可见信息"""
    player = game_state.get_player(player_id)
    
    visible = {
        "phase": game_state.phase,  # 所有人可见
        "round": game_state.round,
        "alive_players": game_state.alive_players,
        "dead_players": game_state.dead_players,
        "public_speeches": game_state.speeches,  # 所有发言
        "vote_results": game_state.vote_results
    }
    
    # 角色特定信息
    if player.role == "werewolf":
        visible["team"] = game_state.get_werewolves()  # 看到狼队友
        visible["kill_history"] = game_state.kills
    
    elif player.role == "seer":
        visible["investigations"] = player.investigation_results  # 查验历史
    
    # 村民只能看到公开信息，无额外内容
    
    return visible
```

### 4.3 可复现性设计

每局游戏记录完整元数据：

```python
{
  "game_id": "uuid",
  "timestamp": "2026-07-23T10:30:00Z",
  "seed": 42,  # 随机种子
  "model_snapshot": {
    "provider": "openai",
    "model_id": "gpt-4o-2024-05-13",  # 具体版本，不是"gpt-4"
    "api_version": "v1"
  },
  "prompt_version": "v1.0",  # 提示词模板版本
  "role_assignment": {
    "player_1": "werewolf",
    "player_2": "seer",
    "player_3": "villager",
    "player_4": "villager",
    "player_5": "villager"
  },
  "events": [
    {"round": 1, "phase": "night", "action": "kill", "actor": "player_1", "target": "player_3"},
    {"round": 1, "phase": "day", "action": "speak", "actor": "player_2", "content": "..."},
    # ... 完整事件流
  ],
  "token_usage": {
    "total_input_tokens": 12450,
    "total_output_tokens": 3820,
    "estimated_cost": 0.24
  },
  "result": {
    "winner": "good",
    "final_round": 3,
    "reason": "werewolf_eliminated"
  }
}
```

### 4.4 AI推理设计

#### Prompt结构

```python
SYSTEM_PROMPT = """你是一个狼人杀游戏中的AI玩家。

你的角色：{role}
当前局势：{visible_state}
历史记忆：{memory}

你需要根据当前情况做出决策。请先简要分析局势（2-3句话），然后选择一个动作。

可选动作：
{available_actions_json}

请返回JSON格式：
{
  "reasoning": "你的简短推理（不要泄露角色信息）",
  "action_type": "...",
  "target": "...",  // 如果需要目标
  "speech_content": "..."  // 如果是发言动作
}
"""
```

**关键点**:
- reasoning字段是给用户看的"表面推理"，不包含角色秘密
- AI内部推理发生在模型内部，我们不展示完整思考链
- 如果AI是狼人，reasoning不能说"我是狼人，所以..."

#### 记忆系统

MVP阶段只实现短期记忆：

```python
class ShortTermMemory:
    """当局记忆"""
    def __init__(self):
        self.events = []  # 按时间序列
        self.speeches = {}  # 按玩家组织
        self.votes = []
    
    def get_context(self, limit: int = 20) -> str:
        """获取最近N条事件的文字描述"""
        recent = self.events[-limit:]
        return "\n".join([event.to_text() for event in recent])
```

---

## 5. 数据库设计

### 5.1 表结构

```sql
-- 对局元数据
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    timestamp DATETIME,
    seed INTEGER,
    model_provider TEXT,
    model_id TEXT,  -- 完整模型ID，如 "gpt-4o-2024-05-13"
    prompt_version TEXT,
    role_assignment JSON,
    result JSON,
    token_usage JSON,
    duration_seconds INTEGER
);

-- 事件流
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT,
    round INTEGER,
    phase TEXT,  -- "night" | "day" | "vote"
    action_type TEXT,
    actor TEXT,
    target TEXT,
    content TEXT,  -- 发言内容或其他数据
    timestamp DATETIME,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- 玩家状态快照（每轮保存）
CREATE TABLE player_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT,
    round INTEGER,
    player_id TEXT,
    is_alive BOOLEAN,
    role TEXT,
    visible_state JSON,  -- 该玩家看到的信息
    FOREIGN KEY (game_id) REFERENCES games(id)
);
```

---

## 6. Web界面设计

### 6.1 朴素观战页面

**布局**:
```
┌─────────────────────────────────────────┐
│  AI Arena - 对局观战                    │
├─────────────────────────────────────────┤
│  游戏状态:                               │
│  第2轮 - 白天阶段 - 发言中               │
│  存活: player_1, player_2, player_4, p5  │
│  死亡: player_3                          │
├─────────────────────────────────────────┤
│  事件流:                                 │
│  [Night-1] player_1 杀死了 player_3     │
│  [Day-1] 系统：player_3 昨晚被杀         │
│  [Day-1] player_2: "我昨晚查验了..."    │
│  [Day-1] player_4: "我认为..."          │
│  [Vote-1] player_2 → player_1           │
│  [Vote-1] player_4 → player_1           │
│  [Vote-1] player_1 → player_2           │
│  [Result] player_1 被投票出局            │
│  [Game] 好人阵营获胜！                   │
└─────────────────────────────────────────┘
```

**功能**:
- 实时滚动显示事件
- 不同事件类型用颜色区分
- 显示当前阶段和存活玩家
- 游戏结束显示结果

**不包含**（v1.0再做）:
- ❌ Canvas角色渲染
- ❌ 录制回放
- ❌ 统计图表
- ❌ AI思考过程可视化

---

## 7. 开发计划

### 7.1 时间规划（4周MVP）

#### Week 1: 游戏核心
- [ ] 项目初始化（目录结构、依赖）
- [ ] WerewolfGame游戏引擎
- [ ] 角色系统（狼人、预言家、村民）
- [ ] 动作协议实现
- [ ] 信息过滤机制
- [ ] 单元测试
- **里程碑**: 游戏规则引擎能正确运行（不含AI）

#### Week 2: AI智能体
- [ ] AIAgent核心类
- [ ] OpenAI客户端适配
- [ ] Prompt工程（系统提示词、动作提示）
- [ ] 短期记忆实现
- [ ] GameOrchestrator（对局编排）
- **里程碑**: 5个AI能完成一局游戏（CLI观战）

#### Week 3: 数据和Web
- [ ] SQLite数据库设计
- [ ] 事件日志持久化
- [ ] FastAPI WebSocket服务
- [ ] React前端基础框架
- [ ] 实时事件推送
- **里程碑**: Web界面能实时观战

#### Week 4: 完善和测试
- [ ] 可复现性验证（种子、元数据）
- [ ] 边界情况测试
- [ ] 错误处理和重试
- [ ] 文档完善（README、API文档）
- [ ] Docker部署配置
- **里程碑**: MVP完成，可以演示

### 7.2 验收标准

**MVP成功的标志**:
1. ✅ 稳定性：连续跑10局不崩溃
2. ✅ 正确性：游戏规则严格执行，无越权操作
3. ✅ 可复现：给定种子，结果一致（模型温度=0时）
4. ✅ 可观战：Web界面流畅显示对局过程
5. ✅ 可扩展：代码结构清晰，易于添加新角色

---

## 8. 技术风险和缓解

### 8.1 主要风险

**风险1: LLM不遵守JSON格式**
- 缓解：Prompt明确要求JSON，使用OpenAI的JSON mode
- 备选：重试机制，失败3次则随机选择动作

**风险2: AI推理质量差（乱投票、逻辑混乱）**
- 缓解：MVP阶段接受"AI不聪明"，先保证能玩完
- 改进：v1.0阶段优化Prompt和记忆系统

**风险3: 成本过高**
- 缓解：优先使用Ollama本地模型测试
- 监控：记录每局token用量，设置预算上限

**风险4: WebSocket连接不稳定**
- 缓解：心跳机制，断线重连
- 备选：事件轮询作为降级方案

---

## 9. 下一步：v1.0规划

MVP完成后，根据实际效果决定v1.0的重点方向：

**候选功能**（按优先级排序）:
1. 完整6角色狼人杀（女巫、猎人、守卫）
2. Claude和Gemini适配器
3. 性格系统（让AI有不同风格）
4. Canvas游戏场景渲染
5. 数据分析仪表盘
6. 对局录制和回放
7. 多模型对比

**决策依据**:
- 用户反馈：哪些功能最受关注
- 技术验证：MVP暴露的架构问题
- 开发成本：哪些功能投入产出比高

---

## 附录

### A. 目录结构

```
ai-arena/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── game.py           # WerewolfGame
│   │   │   ├── agent.py          # AIAgent
│   │   │   ├── orchestrator.py   # GameOrchestrator
│   │   │   └── models.py         # 数据模型
│   │   ├── llm/
│   │   │   └── openai_client.py  # OpenAI适配器
│   │   ├── db/
│   │   │   └── database.py       # SQLite操作
│   │   ├── api/
│   │   │   └── websocket.py      # WebSocket端点
│   │   └── main.py               # FastAPI入口
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── GameViewer.tsx    # 观战组件
│   │   │   └── EventStream.tsx   # 事件流
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts   # WebSocket hook
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── docs/
│   └── superpowers/specs/
│       ├── 2026-07-23-ai-arena-mvp.md      # 本文档
│       ├── 2026-07-23-ai-arena-v1.0.md     # v1.0规划
│       └── 2026-07-23-ai-arena-vision.md   # 长期愿景
│
├── docker-compose.yml
├── README.md
└── .gitignore
```

### B. 依赖清单

**后端**:
```txt
fastapi==0.104.1
uvicorn==0.24.0
websockets==12.0
openai==1.3.0
sqlalchemy==2.0.23
pydantic==2.5.0
python-dotenv==1.0.0
```

**前端**:
```json
{
  "react": "^18.2.0",
  "typescript": "^5.2.2",
  "vite": "^5.0.0",
  "tailwindcss": "^3.3.5"
}
```

---

**MVP文档结束**

下一步：创建 `2026-07-23-ai-arena-v1.0.md` 和 `2026-07-23-ai-arena-vision.md`
