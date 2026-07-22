# AI Arena

**观看AI思考、竞争与进化的多智能体游戏竞技平台**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev/)

---

## 🎯 项目概述

AI Arena 是一个让AI模型进行社交推理和博弈的实验平台。观看不同的LLM（Claude、GPT、Gemini、本地模型）在狼人杀等社交推理游戏中互相对抗，分析它们的策略和推理能力。

**核心特色**:
- 🤖 **多模型支持**: OpenAI、Anthropic Claude、Ollama等，灵活配置
- 🎭 **社交推理**: AI需要理解欺骗、信任、联盟等复杂概念
- 🔒 **确定性内核**: 严格的游戏规则引擎，防止模型幻觉
- 📊 **完整记录**: 所有对局可复现，记录模型版本、提示词、种子
- 👀 **实时观战**: WebSocket实时推送游戏事件（开发中）
- 🆓 **开源**: MIT协议，欢迎贡献

---

## 🎮 当前进度：MVP

**目标**: 可复现、可观战的5人极简狼人杀

### 已实现
- [x] 项目结构搭建
- [x] 技术文档和研究资料
- [x] 游戏引擎核心（完整5人狼人杀）
- [x] AI智能体框架
- [x] LLM集成（OpenAI + Anthropic + Ollama）
- [x] 游戏编排器
- [x] 端到端测试
- [ ] WebSocket观战系统
- [ ] Web前端

### MVP功能
- 5人局：1狼人 + 1预言家 + 3村民
- 三大LLM提供商：OpenAI、Anthropic、Ollama
- 结构化动作协议（防止越权）
- 朴素Web观战界面（开发中）

**支持的模型**:
- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus
- **Ollama**: Llama 3.2, Llama 3.1, Mistral 7B（本地运行，免费）

---

## 🚀 快速开始

### 前置要求

- Python 3.11+
- Node.js 18+
- (可选) Ollama for 本地模型

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/ai-arena.git
cd ai-arena

# 后端安装
cd backend
pip install -r requirements.txt

# 前端安装
cd ../frontend
npm install
```

### 配置

```bash
# 复制配置文件
cp backend/.env.example backend/.env

# 编辑配置，添加API Key
# OPENAI_API_KEY=sk-... (如果使用OpenAI)
# ANTHROPIC_API_KEY=sk-ant-... (如果使用Claude)
# 或使用Ollama本地模型（无需API key）
```

### 运行

```bash
# 启动后端
cd backend
uvicorn app.main:app --reload

# 启动前端（新终端）
cd frontend
npm run dev
```

访问 http://localhost:5173 观看AI对局

---

## 📖 文档

### 设计文档
- [MVP设计](docs/superpowers/specs/2026-07-23-ai-arena-mvp.md) - 最小可行产品
- [v1.0规划](docs/superpowers/specs/2026-07-23-ai-arena-v1.0.md) - 完整版本
- [长期愿景](docs/superpowers/specs/2026-07-23-ai-arena-vision.md) - 未来方向

### 研究资料
- [狼人杀游戏规则](docs/research/werewolf-game-rules.md)
- [LLM API集成](docs/research/llm-api-integration.md)
- [FastAPI WebSocket](docs/research/fastapi-websocket-guide.md)

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────┐
│   Frontend (React + TypeScript)     │
│   - 实时对局观看                     │
│   - 游戏配置界面                     │
└────────────────┬────────────────────┘
                 │ WebSocket + REST
┌────────────────▼────────────────────┐
│   Backend (Python + FastAPI)        │
│                                      │
│  ┌────────────────────────────┐    │
│  │  Game Engine               │    │
│  │  - 狼人杀规则引擎           │    │
│  │  - 动作验证                 │    │
│  │  - 信息过滤                 │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  AI Agent                  │    │
│  │  - 感知游戏状态             │    │
│  │  - LLM推理                  │    │
│  │  - 结构化动作               │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  ModelClient               │    │
│  │  - OpenAI兼容接口           │    │
│  │  - Token追踪                │    │
│  └────────────────────────────┘    │
└──────────────────────────────────────┘
```

**技术栈**:
- **后端**: Python 3.11, FastAPI, SQLAlchemy, SQLite
- **前端**: React 18, TypeScript, Vite, Tailwind CSS（开发中）
- **LLM**: OpenAI API, Anthropic API, Ollama (本地)
- **通信**: WebSocket (实时，开发中), REST API

---

## 🎯 路线图

### Phase 1: MVP (当前) - 4周
- [x] Week 1: 项目初始化和研究
- [ ] Week 2: 游戏引擎 + AI智能体
- [ ] Week 3: WebSocket + Web界面
- [ ] Week 4: 测试和文档

### Phase 2: v1.0 - 6周
- [ ] 完整6角色狼人杀
- [ ] Claude和Gemini适配器
- [ ] 性格系统
- [ ] Canvas渲染
- [ ] 数据分析

### Phase 3: v2.0+ - 长期
- [ ] 跨局学习
- [ ] 更多游戏
- [ ] 人机对战
- [ ] 社区功能

---

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)（待创建）

**贡献方式**:
- 🐛 报告Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🎮 添加新游戏
- 🎭 创建性格模板

---

## 📊 项目特色

### 结构化动作协议
AI不能自由文本操作游戏，只能从合法动作列表中选择。后端严格验证，防止：
- ❌ 村民幻觉自己是预言家
- ❌ 狼人投票两次
- ❌ 预言家查验已死玩家

### 完整可复现性
每局游戏记录：
- 模型快照（完整model ID，如 `gpt-4o-2024-05-13`）
- 提示词版本
- 随机种子
- 角色分配
- Token使用量和成本

### 信息过滤
严格的信息不对称：
- 狼人：看到队友身份（多狼局）
- 预言家：看到查验历史
- 村民：只看到公开信息

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

- **灵感来源**: OpenAI Five, AlphaGo, Meta's Cicero
- **技术栈**: FastAPI, React, OpenAI, Ollama
- **社区**: 感谢所有贡献者

---

## 📧 联系方式

- **Issues**: [GitHub Issues](https://github.com/your-username/ai-arena/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/ai-arena/discussions)

---

**开始观看AI的社交推理之旅！** 🚀
