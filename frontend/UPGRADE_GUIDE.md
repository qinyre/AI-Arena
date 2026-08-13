# 观战界面：组件结构与扩展指南

本文档说明 `frontend/src/components/game/` 的组件职责、数据流，以及如何新增事件类型 / 角色 / 组件。视觉令牌见 [DESIGN_SPEC.md](./DESIGN_SPEC.md)，代码片段见 [VISUAL_EXAMPLES.md](./VISUAL_EXAMPLES.md)。

---

## 1. 组件树

观战页以 `GameView.tsx` 为根，编排下列 `game/` 子组件：

```
GameView.tsx                      观战主页面：剧场环绕布局 + 状态编排
├── GameHeader.tsx                顶栏：阶段 / 轮次 / 状态徽章 / 暂停 / 剧场控制槽
├── TheatreControls.tsx           剧场控制：导演开关 / 音效开关 / 音量
├── ActionCinematics.tsx          全屏职业行动过场（狼刀/查验/守护/开枪/警长…）
├── ReplayControls.tsx            复盘控件：游标 / 倍速 / 事件筛选 / 转折点跳转
├── VoteFlowOverlay.tsx           投票「谁投谁」连线（SVG，锚点取自玩家卡 DOM）
├── PlayerTable.tsx               玩家栏（左/右/移动端各一份）：身份徽章 + 注意力状态
│   └── PersonalityDetails        展开的性格详情
├── EventFeed.tsx                 中央时间线主舞台：竖线 + 阶段分隔 + 事件流
│   └── TimelineEvent.tsx         单个事件：圆点 + 卡片 + EventBody + 推理面板
│       ├── SpeechBubble.tsx       发言气泡（含跳身份/伪装/公开立场）
│       ├── VoteResult.tsx         投票结果（票数条 + 谁投谁）
│       └── AIReasoningPanel.tsx   「决策手记」推理面板
├── ResultPanel.tsx               局末复盘：胜方/原因/成本/转折点 + AI 复盘
│   └── GameReviewPanel.tsx        AI 复盘生成与展示
└── QualityReportPanel.tsx        质检报告：可定位到时间线对应事件

数据 / 逻辑（非组件）：
├── hooks/useGameStream.ts        单一数据源：首屏快照 + SSE 增量 + derived 聚合
├── game/gameDirector.ts          导演模型：事件分级 / 注意力 / 事件筛选 / 音效映射
├── game/cinematics.ts            过场动作构建（CinematicKind → CinematicAction）
├── game/roleConfig.ts            角色配置（图标/符号/label/色/阵营）+ 死因/自称 label
├── game/useArenaAudio.ts         音效 hook
└── types/api.ts                  前后端数据契约：GameEvent 联合 + 类型守卫
```

---

## 2. 数据流

```
useGameStream(gameId)
   │  首屏：GET /status + GET /events  → 快照
   │  实时：EventSource /events/stream → 增量事件（断线指数退避重连 + REST 补齐）
   ▼
{ status, result, events, players, rounds, currentSpeaker, loading, error, connectionState, refetch }
   │
   ▼
GameView：按 replayCursor 切出 displayEvents，派生 displayPlayers / displayRounds /
         displaySpeaker / displayStatus / attention / voteDetail
   │
   ├── PlayerTable    ← displayPlayers + attention + displaySpeaker
   ├── EventFeed      ← displayEvents + displayRounds + displayStatus + eventFilter
   │     └── 每个 event → gameDirector.directorTier(event) → 视觉分级
   ├── ActionCinematics ← displayEvents（构建过场）+ roleAssignment
   └── ResultPanel    ← result + status（局末）
```

关键约定：

- **单一数据源**：所有组件不自己发请求，统一从 `useGameStream` 取数据。
- **上帝视角**：`status.role_assignment` 开局即下发全部身份，前端直接展示。
- **复盘与实况同源**：`GameView` 用 `replayCursor` 把同一份 `events` 切片，实况与回放共用一套渲染管线。

---

## 3. 导演模型（gameDirector.ts）

为事件计算三件事，驱动视觉与音效：

- **分级** `directorTier(event): 'routine' | 'notable' | 'climax'` — 由 `CLIMAX_EVENTS` / `NOTABLE_EVENTS` 集合判定，映射到时间线条目的强调样式（见 [DESIGN_SPEC.md §9](./DESIGN_SPEC.md)）。
- **注意力** `playerAttention(events): Record<player, PlayerAttention>` — 推断每位玩家当前状态（`speaking` / `watching` / `voting` / `targeted` / `protected` / `fallen`），驱动玩家卡修饰类。
- **音效** `ArenaSound` 与过场语音路径 `VOICE_BY_CINEMATIC`，由 `useArenaAudio` 播放，受导演开关控制。

事件筛选 `EventFilter = 'all' | 'speech' | 'vote' | 'night' | 'death' | 'system'`，由 `eventMatchesFilter()` 实现，供 `ReplayControls` 使用。

---

## 4. 扩展：新增一个事件类型

事件由后端 `app/core/werewolf.py` 产生并写入事件流；前端只需让它「能被看见」。以新增 `my_new_action` 为例：

1. **类型契约**（`types/api.ts`）：在 `GameEvent` 联合（约 727 行起）加对应类型；如需窄化，仿照现有守卫加一个：
   ```ts
   export function isMyNewAction(e: GameEvent): e is MyNewActionEvent {
     return e.event_type === 'my_new_action';
   }
   ```
2. **时间线配色**（`game/TimelineEvent.tsx` → `getEventStyle`）：加一个分支返回 `{ dotBorder, dotCore, cardClass, headColor, symbol, label }`。未命中的事件会落到 `FALLBACK_EVENT_STYLE`（中性灰，label「系统事件」）。
3. **事件正文**（`game/TimelineEvent.tsx` → `EventBody`）：如需自定义渲染，加一个分支；否则默认显示 label + 时间。
4. **视觉分级**（`game/gameDirector.ts`）：若该事件需要强调，把 `event_type` 加入 `NOTABLE_EVENTS` 或 `CLIMAX_EVENTS`。
5. **（可选）复盘筛选**：若希望它被某个 `EventFilter` 命中，更新 `eventMatchesFilter()`。
6. **（可选）过场 / 音效**：在 `cinematics.ts` `buildCinematics` 加映射、在 `gameDirector.ts` `VOICE_BY_CINEMATIC` 加语音路径。

> 前端不校验动作合法性——那是后端 `werewolf.py` 的职责。前端只负责呈现已发生的事件。

---

## 5. 扩展：新增一个角色

角色配置是前端单一数据源 `game/roleConfig.ts` 的 `ROLE_MAP`。新增角色：

1. **前端配置**（`game/roleConfig.ts` → `ROLE_MAP`）加一项，对齐字段：
   ```ts
   my_role: {
     icon: '某',                 // 玩家卡单字
     symbol: 'material_symbol',  // Material Symbols 图标名
     label: '某角色',
     color: '#RRGGBB',
     badgeClass: 'bg-[#RRGGBB]/12 text-[#RRGGBB] border border-[#RRGGBB]/30',
     cardClass: '',              // 狼人阵营填 'active-wolf'，其余留空
     ringClass: 'ring-[#RRGGBB]/55',
     team: 'werewolf' | 'good',
   },
   ```
   未在表中的角色会回退到 `villager` 配置（`getRoleConfig` 默认值）。
2. **后端角色枚举**（`app/core/werewolf.py` → `Role`）：新增角色需先在后端定义并加入板型，前端 `roleConfig` 只是镜像后端的角色字符串。
3. **（可选）死因 / 过场**：若引入新死因，在 `roleConfig.ts` `deathCauseLabel()` 加文案；若需要专属过场，在 `cinematics.ts` 加 `CinematicKind` 与映射。

---

## 6. 扩展：新增一个观战组件

1. 在 `game/` 下新建组件，**只接收 props、不发请求**（数据来自 `useGameStream` 经 `GameView` 下发）。
2. 在 `GameView.tsx` 顶部 import，按布局位置插入：
   - 顶栏控件 → 作为 `GameHeader` 的 `controls` 槽或紧随其下
   - 舞台内 → 三栏 `grid` 之内
   - 页面级区块 → 三栏 `grid` 之外（如复盘区，自然出现在页面下方）
3. 样式优先复用 [DESIGN_SPEC.md](./DESIGN_SPEC.md) 的令牌与面板类（`.glass-panel` / `.arena-rail` / `.chronicle-panel` / `.event-card` / `.custom-scrollbar`），圆角用 Tailwind `rounded-sm/lg`。

---

## 7. 约定速记

- **不要直接发请求**：数据走 `useGameStream`；写操作走 `apiClient`（`api/client.ts`）。
- **不要新增未定义的 Tailwind 颜色类**：`antique-gold` / `ink-muted` / `paper` / `crimson` 等未在配置中定义，属无效类。用 `nocturne.*` 令牌或十六进制值。
- **动作合法性由后端校验**：前端只呈现，不判规则。
- **动效要尊重 `prefers-reduced-motion`**：新动画在 `src/index.css` 的 reduce 媒体查询里关闭。
