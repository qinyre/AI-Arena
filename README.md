# AI Arena

多智能体狼人杀对战平台——多个 LLM 在一局狼人杀里互相对抗，你可以围观每个玩家的推理与决策。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev/)

---

## 这是什么

AI Arena 是一个开源的多智能体 LLM 博弈实验平台。多个大语言模型在一局狼人杀里互相对抗——狼人伪装、预言家查验、村民推理，所有决策（夜晚刀谁、白天跳不跳身份、投票投谁）都由各自独立的 LLM 完成，并附带内心独白（推理过程）。你以全局视角观战，可以对照任一玩家的公开发言和内心想法。

几个观察角度：
- **AI 是否会撒谎**：狼人的内心独白可能写着「需要隐藏身份」，公开发言却伪装成村民
- **AI 如何推理**：预言家怎么安排查验优先级，村民怎么从发言矛盾里找狼
- **跨模型对战**：DeepSeek、GPT、Claude、Gemini 等同场博弈，比较不同模型的策略
- **成本透明**：实时统计每局的 token 消耗和费用

---

## 核心特性

- **10 家 LLM 接入**:DeepSeek / OpenAI / Anthropic / Gemini / 通义千问 / Kimi / 小米 MiMo / MiniMax / 智谱 GLM / 硅基流动,也可填任意自定义端点
- **确定性规则引擎**:AI 只能从合法动作中选择,后端严格校验,杜绝「村民幻觉自己是预言家」「狼人投两次票」等越权行为
- **信息严格隔离**:狼人看不到预言家的查验结果,村民看不到夜晚行动;投票阶段的内心独白不会泄露给对手
- **剧场环绕式观战界面**:玩家分左右两列环绕中央舞台,竖线时间线 + 彩色事件圆点,内联展开任意 AI 的推理面板;支持暂停/恢复、局末逐步回放、按事件类型筛选、转折点跳转
- **盲投机制**:投票并发进行,投票期间互不可见;投票结束才统一公布「谁投谁」明细
- **系列赛 & 提示词实验**:多局公平轮换的系列赛(同阵容连打多盘);提示词 A/B 镜像交叉实验,同一局面用不同 prompt 跑,横向对比 AI 表现
- **AI 复盘 & 对局质检**:局末可生成 AI 终局复盘(转折点/关键决策);确定性质检(不调用模型)覆盖规则合法性、信息隔离、流程终局、行为连贯、性格表达、模型可靠性 6 类,问题可一键定位到时间线事件
- **性格机制**:6 套内置性格预设,影响 AI 的发言口吻与决策倾向,创建对局时为各座位配置
- **预算 & 成本控制**:economy / standard / premium 三档预算,按局与玩家设 token 上限和熔断,超限自动停止
- **完整可复现**:每局记录角色分配、事件流、模型版本、随机种子、token 成本,JSON 持久化
- **稳定性内建**:LLM 调用带指数退避重试(网络抖动/限流自动重试),语义校验失败自动修正,降级率趋近于零

---

## 游戏规则

支持多种板型(创建对局时选择),按板型自动确定人数与角色配置:

| 板型 | 角色配置 |
|---|---|
| 5 人极简场 | 1 狼人 · 1 预言家 · 3 村民 |
| 9 人标准场 | 3 狼人 · 预言家/女巫/猎人 · 3 村民 |
| 12 人预女猎白 | 4 狼人 · 预言家/女巫/猎人/白痴 · 4 村民 |
| 12 人白狼王守卫 | 3 狼人 + 白狼王 · 预言家/女巫/猎人/守卫 · 4 村民 |
| 12 人狼王守卫 | 3 狼人 + 狼王 · 预言家/女巫/猎人/守卫 · 4 村民 |
| 12 人狼美骑士 | 3 狼人 + 狼美人 · 预言家/女巫/守卫/骑士 · 4 村民 |
| 自定义板型 | 使用现有角色自由组合 5—18 人，并选择屠边或人数胜利规则 |

所有板型均可选启用**警长**玩法(警长选举 + 死后警徽流转移)。

```
夜晚  守卫守护 · 狼人选择击杀目标 · 女巫使用解药/毒药 · 预言家查验身份(按板型含有的角色执行)
  ↓
白天  存活玩家依次发言(可跳身份、分享查验、怀疑/辩护)
  ↓
投票  盲投 → 公布结果 → 票数最高者放逐
  ↓ (若平票)
加赛  平票候选人再发言一轮 → 仅在候选人间重投 → 仍平则无人出局
  ↓
循环至胜负判定:
  · 人数规则: 狼人数 ≥ 好人数 → 狼人胜
  · 屠边规则: 狼人屠尽村民 或 屠尽神职 → 狼人胜
  · 狼人全灭 → 好人胜
```

---

## 快速开始

### 前置要求

- Python 3.11+
- Node.js 18+
- 至少一家 LLM 的 API Key(推荐 DeepSeek,国内直连、便宜)

### 1. 克隆与安装

```bash
git clone https://github.com/qinyre/AI-Arena.git
cd AI-Arena

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
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 终端 2:前端
cd frontend
npm run dev
```

打开 http://localhost:5173 ,创建一局多人对战,围观 AI 博弈。

---

## 架构

```
前端    React 18 + TS + Vite + Tailwind
        剧场环绕式观战 UI，首屏快照 + SSE 增量同步事件流
                    │  REST API (JSON) + SSE
                    ▼
后端    Python 3.11 + FastAPI
        ├─ 游戏引擎   狼人杀规则 · 动作校验 · 信息隔离
        ├─ AI Agent   LLM 决策 · 重试退避 · 语义校验
        └─ Registry   多 provider · 成本追踪
                    │
                    ▼
        ModelClient  OpenAI 兼容 + Anthropic 双协议

数据持久化   backend/data/*.json（事件流 + 索引）
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
│   ├── core/         # 游戏引擎: werewolf(规则) / orchestrator(编排) / agent(AI) / quality(质检) / models
│   └── llm/          # ModelClient 抽象 + OpenAI/Claude 实现 + registry
├── config/models.yaml   # provider & 模型清单(单一数据源)
├── scripts/          # 批量模拟 / 冒烟 / 行为评测(simulate_boards / smoke_boards / evaluate_ai_scenarios)
└── data/             # 运行时对局数据(.gitignore 忽略)

frontend/
├── src/
│   ├── components/   # CreateGame / GameView / GameHistory / Stats / SeriesArena / PromptExperimentLab / ArenaAnalytics
│   │   └── game/     # 剧场环绕观战组件(PlayerTable/EventFeed/Timeline/...)
│   ├── hooks/useGameStream.ts   # 单数据源:首屏快照 + SSE 增量事件
│   └── types/api.ts  # 前后端数据契约(严格一一对应)
└── tailwind.config.js  # Nocturne Stage 配色 token
```

---

## 贡献

欢迎提 Issue 和 PR。可贡献的方向：
- 新增性格模板（`frontend/src/utils/personalityPresets.ts`）
- 适配更多 LLM provider
- 扩展游戏模式
- 观战界面打磨

---

## 许可证

[MIT License](LICENSE)
