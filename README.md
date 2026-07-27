# AI Arena · 面具剧场

**观看 AI 思考、博弈与面具之下的多智能体狼人杀对战平台**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev/)

---

## 🎭 这是什么

AI Arena 是一个开源的多智能体 LLM 博弈实验平台。让多个大语言模型在狼人杀中互相对抗——狼人伪装、预言家查验、村民推理,你作为上帝视角围观它们如何**思考、欺骗、结盟、识破**。

每一步决策(夜晚刀谁、白天跳不跳身份、投票投谁)都由真实 LLM 独立完成,并附**内心独白**(推理过程)。你可以揭开任一 AI 的面具,看到它面具之下的真实想法。

**为什么有意思**
- 🎭 **看 AI 撒谎**:狼人 AI 的内心独白写着「我作为独狼需要隐藏身份」,但公开发言却伪装成无辜村民
- 🧠 **看 AI 推理**:预言家如何判断查验优先级?村民如何从发言矛盾里找出狼?
- ⚔️ **跨模型对战**:让 DeepSeek、GPT-5、Claude、Gemini 同场博弈,谁的策略更强?
- 💰 **成本透明**:实时统计每局的 token 消耗和费用

---

## ✨ 核心特性

- **7 家 LLM 接入**:DeepSeek / OpenAI / Anthropic / Gemini / 通义千问 / 硅基流动 / Ollama(本地),也可填任意自定义端点
- **确定性规则引擎**:AI 只能从合法动作中选择,后端严格校验,杜绝「村民幻觉自己是预言家」「狼人投两次票」等越权行为
- **信息严格隔离**:狼人看不到预言家的查验结果,村民看不到夜晚行动;投票阶段的内心独白不会泄露给对手
- **剧场环绕式观战界面**:玩家分左右两列环绕中央舞台,竖线时间线 + 彩色事件圆点,内联展开任意 AI 的推理面板
- **盲投机制**:投票并发进行,投票期间互不可见;投票结束才统一公布「谁投谁」明细
- **完整可复现**:每局记录角色分配、事件流、模型版本、随机种子、token 成本,JSON 持久化
- **稳定性内建**:LLM 调用带指数退避重试(网络抖动/限流自动重试),语义校验失败自动修正,降级率趋近于零

---

## 🎮 游戏规则

**5 人极简狼人杀**(1 狼人 + 1 预言家 + 3 村民)

```
夜晚  狼人选择击杀目标 · 预言家查验一名玩家身份
  ↓
白天  存活玩家依次发言(可跳身份、分享查验、怀疑/辩护)
  ↓
投票  盲投 → 公布结果 → 票数最高者放逐
  ↓ (若平票)
加赛  平票候选人再发言一轮 → 仅在候选人间重投 → 仍平则无人出局
  ↓
循环至胜负判定:
  · 狼人数 ≥ 好人数 → 狼人胜
  · 狼人全灭 → 好人胜
```

---

## 🚀 快速开始

### 前置要求

- Python 3.11+
- Node.js 18+
- 至少一家 LLM 的 API Key(推荐 DeepSeek,国内直连、便宜)

### 1. 克隆与安装

```bash
git clone https://github.com/qinyre/NewIdea.git
cd NewIdea

# 后端
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # macOS/Linux
pip install -r requirements.txt

# 前端
cd ../frontend
npm install
```

### 2. 配置 API Key

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`,填入你实际使用的那几家即可(其余留空不会被调用):

```env
DEEPSEEK_API_KEY=sk-...        # 推荐,默认 provider
OPENAI_API_KEY=sk-...          # 可选
ANTHROPIC_API_KEY=sk-ant-...   # 可选
# GEMINI_API_KEY / DASHSCOPE_API_KEY / SILICONFLOW_API_KEY ...
```

模型清单与定价在 `backend/config/models.yaml`(单一数据源),新增 provider 只需在此文件添加,无需改代码。也可在前端创建游戏时直接填 `base_url + api_format + model` 用任意兼容端点。

### 3. 启动

```bash
# 终端 1:后端
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 终端 2:前端
cd frontend
npm run dev
```

打开 http://localhost:5173 ,创建一局 多人 人对战,围观 AI 博弈。

---

## 🏗️ 架构

```
┌──────────────────────────────────────────────────┐
│  Frontend  React 18 + TS + Vite + Tailwind       │
│  剧场环绕式 UI · 2s 轮询同步事件流               │
│  玻璃拟态 + 三字体(EB Garamond/Source Sans/DM)  │
└─────────────────────┬────────────────────────────┘
                      │  REST API
┌─────────────────────▼────────────────────────────┐
│  Backend  Python 3.11 + FastAPI                  │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ Game Engine │  │  AI Agent   │  │ Registry │ │
│  │ 狼人杀规则  │  │  LLM 决策   │  │ 多provider│ │
│  │ 动作校验    │←→│  重试退避   │←→│ 成本追踪 │ │
│  │ 信息隔离    │  │  语义校验   │  │          │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│                      │                            │
│              ┌───────▼────────┐                   │
│              │ ModelClient    │  OpenAI 兼容 +    │
│              │ (DeepSeek/GPT/ │  Anthropic 双协议 │
│              │  Claude/Gemini)│                   │
│              └────────────────┘                   │
└───────────────────────────────────────────────────┘
        数据持久化: backend/data/*.json (事件流 + 索引)
```

### 关键设计

- **结构化动作协议**:AI 不能自由文本操作游戏,每一步从 `available_actions` 里选择。后端 `is_valid_action` 严格校验 action_type / target / 阶段合法性,非法动作会被拦截并重试
- **信息过滤**:`get_visible_state` 按角色返回不同视野;`_filter_public_events` 在喂给玩家 LLM 前剥离他人内心独白(防止狼人「我作为狼人」这类自爆思维链被对手看到)
- **上帝视角**:观战界面可见全部真相(角色分配、夜晚行动、所有推理),与玩家视角严格区分
- **盲投**:投票并发执行,投票中的 `player_vote` 事件不喂给同阶段其他玩家;投票结束才广播 `vote_result`(含 `vote_detail`:谁投谁)

### 项目结构

```
backend/
├── app/
│   ├── api/          # FastAPI 路由 + Pydantic schemas + game_manager
│   ├── core/         # 游戏引擎: werewolf(规则) / orchestrator(编排) / agent(AI) / models
│   └── llm/          # ModelClient 抽象 + OpenAI/Claude 实现 + registry
├── config/models.yaml   # provider & 模型清单(单一数据源)
└── data/             # 运行时对局数据(.gitignore 忽略)

frontend/
├── src/
│   ├── components/   # CreateGame / GameView / GameHistory / Stats
│   │   └── game/     # 剧场环绕观战组件(PlayerTable/EventFeed/Timeline/...)
│   ├── hooks/useGameStream.ts   # 单数据源:轮询合并 status + events
│   └── types/api.ts  # 前后端数据契约(严格一一对应)
└── tailwind.config.js  # Nocturne Stage 配色 token
```

---

## 📡 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/games` | 创建并启动一局(后台异步运行) |
| `GET` | `/api/games` | 列出所有对局 |
| `GET` | `/api/games/stats` | 全局统计(局数/成本) |
| `GET` | `/api/games/{id}/status` | 对局状态(阶段/轮次/存活/角色/事件) |
| `GET` | `/api/games/{id}/events` | 完整事件流 |
| `GET` | `/api/games/{id}/result` | 对局结果(胜方/原因/复盘) |
| `POST` | `/api/games/{id}/review` | 提交对局点评 |
| `DELETE` | `/api/games/{id}` | 删除对局 |
| `GET` | `/api/providers` | 可用 provider 列表(从 models.yaml) |
| `POST` | `/api/test-connection` | 测试模型连通性 |

---

## 🤝 贡献

欢迎提 Issue 和 PR。可贡献的方向:
- 🎭 新增性格模板(`frontend/src/utils/personalityPresets.ts`)
- 🤖 适配更多 LLM provider
- 🎮 扩展游戏模式
- 🎨 观战界面打磨

---

## 📄 许可证

[MIT License](LICENSE)

---

**揭开 AI 的面具,围观它们的社交推理之旅。** 🎭
