# 观战界面快速上手

本指南帮你跑起前端、进入一局对局，并知道观战界面上每个区域在看什么。设计与代码细节见 [DESIGN_SPEC.md](./DESIGN_SPEC.md) 与 [VISUAL_EXAMPLES.md](./VISUAL_EXAMPLES.md)；组件结构与二次开发见 [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md)。

---

## 1. 前置条件

- **后端先起**：`backend/` 已配置 `.env`（至少一家 LLM key）并运行在 `http://localhost:8000`。后端启动见根目录 [README.md](../README.md)「快速开始」。
- **Node.js 18+**

## 2. 启动前端

```bash
cd frontend
npm install      # 首次
npm run dev      # 开发服务器
```

打开 http://localhost:5173 。开发模式下 `/api` 自动代理到后端（见 `vite.config.ts`），无需额外配置。

> 若要把前端指向别的后端地址，设环境变量 `VITE_API_BASE=http://your-host:8000` 后重启。

## 3. 创建一局并观战

1. 在「创建对局」页选板型、为每个座位选 provider/model（推荐 DeepSeek，国内直连便宜），可选随机种子与警长玩法。
2. 创建后会跳到观战页（`GameView`），对局在后台异步运行。
3. 数据流：首屏读一次快照，之后通过 **SSE** 增量接收事件；连接中断会指数退避重连并用 REST 游标补齐（见 `hooks/useGameStream.ts`）。

## 4. 观战界面分区

```
GameHeader        阶段（夜/昼/投票/警长…）、轮次、暂停/继续、剧场控制（导演开关、音量）
左 / 右玩家栏     玩家环绕舞台分两列；身份徽章 + 存活状态 + 注意力高亮（发言/被刀/守护…）
中央时间线        竖线 + 彩色圆点事件流；点击事件内联展开 AI「决策手记」
                  上帝视角：夜晚刀/查可见，标【私密】
投票连线          投票阶段在舞台上方按「谁投谁」画连线（VoteFlowOverlay）
复盘区（局末）    ResultPanel（胜方/原因/成本）+ QualityReportPanel（质检），位于页面底部
```

要点：

- **上帝视角**：开局即可在玩家卡看到所有人身份，与玩家视角严格区分。
- **盲投**：投票并发进行，投票期间互不可见，投票结束才公布「谁投谁」明细。
- **导演分级**：关键事件（自爆/死亡/查验/警徽…）在时间线上有更强视觉强调。
- **复盘**：对局结束后可用 `ReplayControls` 逐步回放、按类型筛选事件，并可生成 AI 复盘与质检报告。

## 5. 常见问题

| 现象 | 排查 |
|---|---|
| 进入观战页一直「正在接入旁观席」 | 确认后端 `:8000` 在运行；看浏览器 Network 是否能拿到 `/api/games/{id}/status` |
| 实时事件不更新 | SSE 中断后会自动重连；点右上「立即重试」可手动触发 REST 补齐 |
| 样式错乱 | 确认 Tailwind 已装：`npm install` 后重启 `npm run dev` |
| TypeScript 报错 | 删除 `node_modules` 重装；检查 `tsconfig.json` |

## 6. 下一步

- 改配色 / 字号 / 令牌 → [DESIGN_SPEC.md](./DESIGN_SPEC.md)（令牌源在 `tailwind.config.js` 与 `src/index.css`）
- 看真实组件代码片段 → [VISUAL_EXAMPLES.md](./VISUAL_EXAMPLES.md)
- 新增事件类型 / 角色 / 组件 → [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md)
