# 观战界面设计规范 · Nocturne Stage

本文档定义 AI Arena 观战界面（`frontend/src/components/game/`）的设计语言与视觉令牌。所有令牌均来自实际代码：色彩与字体见 `tailwind.config.js`，全局类与 CSS 变量见 `src/index.css`，角色配置见 `game/roleConfig.ts`，事件配色见 `game/TimelineEvent.tsx`。

> 配套文档：[VISUAL_EXAMPLES.md](./VISUAL_EXAMPLES.md)（真实代码片段）、[QUICKSTART.md](./QUICKSTART.md)（快速上手）、[UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md)（组件结构与扩展）。

---

## 1. 设计语言

**Nocturne Stage（夜幕舞台）**——借鉴稿 `借鉴/DESIGN.md` 的剧场隐喻：

- 深海军蓝舞台为底，容器按层级递浅做「深度感」
- 金 = 预言家 / 真相；绯红 = 狼人 / 危险；蓝灰 = 村民 / 中性
- 玩家环绕中央舞台，竖线时间线为「剧情轴」，事件以彩色圆点点亮
- 上帝视角：观战者开局即见全部身份，与玩家视角严格区分

圆角刻意比默认小（`0.125rem`），追求建筑感而非柔美感。

---

## 2. 色彩系统

### 2.1 主色板（`tailwind.config.js` → `nocturne` / `index.css` → `:root`）

| 令牌 | 值 | 用途 |
|---|---|---|
| `nocturne.stage` / `--stage` | `#090d10` | 舞台底色 |
| `nocturne.stage-bright` | `#222a2f` | 舞台高光层 |
| `nocturne.container-lowest` | `#070a0c` | 最深容器 |
| `nocturne.container-low` | `#0d1216` | 低层容器 |
| `nocturne.container` | `#12181c` | 标准容器 |
| `nocturne.container-high` | `#182126` | 高层容器 |
| `nocturne.container-highest` | `#202b31` | 最高容器 |
| `nocturne.on-surface` / `--on-surface` | `#e6dfd2` | 主文字（暖白） |
| `nocturne.on-surface-variant` | `#aaa79f` | 次文字 |
| `nocturne.outline` | `#6f7472` | 主描边 |
| `nocturne.outline-variant` / `--outline-variant` | `#343b3d` | 次描边 |

### 2.2 角色语义色

| 令牌 | 值 | 语义 |
|---|---|---|
| `nocturne.gold` / `--truth-gold` | `#b99758` | 预言家 / 真相 / 警徽 |
| `nocturne.gold-bright` | `#d7bd8b` | 金色高光（hover / 激活） |
| `nocturne.crimson` / `--lie-crimson` | `#b8463d` | 狼人 / 危险 / 出局 |
| `nocturne.crimson-soft` | `#d28c85` | 绯红文字 |
| `nocturne.neutral` / `--neutral` | `#6f7c83` | 村民 / 中性 |

### 2.3 兼容别名（旧 key，对齐新值）

`truth:#e9c400`、`lie:#eb2445`、`werewolf:#eb2445`、`seer:#e9c400`、`villager:#64748b`、`stage.deep:#031427`、`stage.spot:#0b1c30`、`mask.white:#d3e4fe`、`mask.shadow:#47464b`、`gray.750:#1b2b3f`。新代码请优先用 `nocturne.*` 主色板。

> ⚠️ 代码中另有 `antique-gold` / `ink-muted` / `paper` / `crimson` 等 Tailwind 类名被部分组件引用，但它们**未在 `tailwind.config.js` 或 `index.css` 中定义**，属无效类。新增样式请勿依赖这些名字，统一使用上表令牌或直接写十六进制值。

---

## 3. 字体与字号

三套字体系统（`tailwind.config.js` → `fontFamily`，字体在 `index.css` 顶部 `@import`）：

| 类 | 字栈 | 用途 |
|---|---|---|
| `font-display` | `Noto Serif SC` / `EB Garamond` / serif | 标题、玩家名、戏剧化叙述 |
| `font-body` | `Noto Sans SC` / sans-serif | 正文、说明 |
| `font-label` | `Noto Sans SC`（wght 500） | 标签、元信息 |

字号刻度（`fontSize`）：

| 令牌 | size / line-height | 字重 / 字距 |
|---|---|---|
| `display-lg` | 48 / 56 | 600 / -0.02em |
| `headline-lg` | 32 / 40 | 500 |
| `title-md` | 24 / 32 | 500 |
| `body-lg` | 18 / 28 | 400 |
| `body-md` | 16 / 24 | 400 |
| `label-md` | 14 / 20 | 600 / 0.05em |
| `label-sm` | 12 / 16 | 700 / 0.08em |

图标使用 **Material Symbols Outlined**（`index.css` `@import`，基类 `.material-symbols-outlined`）。

---

## 4. 圆角与深度

```js
borderRadius: { DEFAULT: '0.125rem', sm: '0.125rem', md: '0.25rem', lg: '0.5rem', xl: '0.75rem' }
```

容器深度由「容器层级」（深→浅）+ 阴影叠加实现：

- `boxShadow.stage`：`0 8px 32px rgba(0,0,0,0.6)`（舞台级投影）
- 面板内高光：`inset 0 1px 0 rgba(255,255,255,0.025)`
- 角色 glow：`shadow-truth`（金）/ `shadow-lie`（绯红）/ `shadow-wolf-glow` / `shadow-gold-glow`

---

## 5. 布局：剧场环绕

观战页由 `GameView.tsx` 编排（详见 [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md)）：

```
┌──────────────────── GameHeader（阶段 / 轮次 / 暂停 / 剧场控制）────────────────────┐
├──────────┬──────────────────────────────────────────────┬──────────────────────────┤
│ 左玩家栏  │            中栏：事件时间线（主舞台）          │     双玩家栏              │
│ PlayerTable│              EventFeed                        │  PlayerTable             │
│ (前一半)  │   竖线 + 彩色圆点 + 事件卡片 + 推理面板        │   (后一半)               │
│          │                                              │                          │
│          │   VoteFlowOverlay：投票时在舞台上方画连线      │                          │
├──────────┴──────────────────────────────────────────────┴──────────────────────────┤
│                  ResultPanel + QualityReportPanel（对局结束后的页面级复盘区块）         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- 桌面（`xl`）：`grid-cols-[220px_minmax(0,1fr)_220px]`，`2xl` 加宽到 `240px`
- 三栏固定高度、各自内部滚动（`.custom-scrollbar`），复盘自然出现在页面下方，不挤压三栏
- 移动端（`<xl`）：左右栏隐藏，改为顶部单一 `PlayerTable`（`compact`）

---

## 6. 关键面板类（`index.css`）

| 类 | 说明 |
|---|---|
| `.glass-panel` / `.arena-rail` / `.chronicle-panel` | 共享基底：`rgba(13,18,22,0.93)` 半透明 + 细描边 + 顶部金色渐变细线（`::before`） |
| `.chronicle-panel` | 中栏主舞台，叠加横向纸纹（`repeating-linear-gradient`）做「卷宗」质感 |
| `.player-card` | 玩家卡基底；左侧 2px 阶色边随身份/状态变化（见 §7） |
| `.event-card` | 事件卡片基底；按事件类型加变体（见 §8） |
| `.timeline-line` | 时间线竖线，金→绯红渐变，定位 `left:24px` |
| `.ai-reasoning-panel` | AI 推理面板，左侧金色描边 + 深底 |
| `.custom-scrollbar` | 5px 细滚动条，蓝灰拇指 |
| `.theatre-toggle` / `.theatre-volume` | 剧场控制（导演开关 / 音量） |
| `.vote-flow-overlay` / `.vote-flow-path` / `.vote-flow-target` | 投票连线 SVG 样式 |

组件类（`@layer components`）：`.btn-primary`（金底）/ `.btn-secondary` / `.btn-danger`（绯红）/ `.card` / `.input` / `.select`。

---

## 7. 玩家卡状态机（`PlayerAttention`）

`gameDirector.ts` 的 `playerAttention()` 为每位玩家计算注意力状态，映射到 `.player-card` 修饰类：

| 状态类 | 视觉 | 含义 |
|---|---|---|
| `.active-wolf` | 左边绯红 | 狼人阵营（含白狼王/狼王/狼美人） |
| `.active-seer` | 左边金 | 预言家 |
| `.is-speaking` | 金边 + 内金条 + 脉冲环 | 正在发言 |
| `.is-watching` | 守卫青边 | 被守护/关注 |
| `.is-voting` | 金边 + 右移 | 正在投票 |
| `.is-targeted` | 绯红径向光 + 右内条 | 被刀/被指认 |
| `.is-protected` | 青边 + 脉冲环 | 守卫守护中 |
| `.is-fallen` | `player-fall` 动画 → 灰阶 0.48 | 刚淘汰 |
| `.dead` | 灰阶 0.9 + 透明度 0.48 | 已死亡 |
| `.is-selected` | 高亮描边 | 观战者选中查看 |

---

## 8. 事件时间线视觉

每个事件由 `TimelineEvent.tsx` 的 `getEventStyle()` 返回 `{ dotBorder, dotCore, cardClass, headColor, symbol, label }`：

- **圆点**：`w-3 h-3 rounded-full` 外环（`dotBorder`）+ `w-1 h-1` 内核（`dotCore`，带 glow 阴影）
- **卡片**：关键事件用 `event-card rounded-lg` 强调卡 + `cardClass` 变体；常规动作用紧凑行（下边框分隔）
- **头部**：Material Symbol 图标 + 大写 label + 右侧 `HH:MM:SS`

事件类型配色（摘录，完整映射见 `TimelineEvent.tsx` `getEventStyle`）：

| 事件 | 圆点色 | 卡片变体 | 图标 |
|---|---|---|---|
| 狼人击杀 / 狼队密聊 / 自爆 | `#eb2445`（绯红 glow） | `wolf-action` | `swords` / `forum` / `bomb` |
| 预言家查验 / 警徽 / 竞选结果 | `#e9c400`（金 glow） | `seer-action` | `visibility` / `military_tech` |
| 守卫 / 女巫 | `violet-400` | — | `shield` / `experiment` |
| 玩家发言 | `#64748b` | `speech-action` | `forum` |
| 投票 / 弃票 / 投票结果 | `#929095` / `#64748b` | — | `how_to_vote` / `ballot` |
| 死亡公告 | `#eb2445/70` | `death-action`（暗红底） | `skull` |
| 模型降级 | `amber-400` | `amber` 描边 | `warning` |
| 对局结束 | 好人金 / 狼人绯红 / 平局蓝灰 | `end-action good` / `evil` | `emoji_events` / `balance` |

夜晚行动（刀/查）在上帝视角下可见，正文带【私密】标签。

---

## 9. 导演分级（Director Tiers）

`gameDirector.ts` 给每个事件定级，控制视觉强调（`TimelineEvent.tsx` 在条目上加 `director-climax` / `director-notable` 类）：

| 分级 | 触发（节选） | 视觉 |
|---|---|---|
| `climax` | 自爆、死亡、对局结束、魅惑殉情、骑士决斗 | 绯红内条 + 强投影（`.director-climax .event-card`） |
| `notable` | 查验、守护、救/毒、警长结果、警徽、降级、魅惑 | 金色内条（`.director-notable .event-card`） |
| `routine` | 其余 | 无额外强调 |

复盘模式（`ReplayControls`）可按 `EventFilter`（`all/speech/vote/night/death/system`）筛选事件。

---

## 10. 动效

`tailwind.config.js` → `animation` / `keyframes`：

- `animate-fade-in-up` / `animate-fade-in`：事件条目、面板进场
- `animate-slide-in-right`：侧栏内容
- `animate-glow-pulse`：金色呼吸光
- `animate-curtain-rise` / `animate-spotlight`：舞台氛围
- `animate-scanline`：推理面板扫描线
- `animate-mask-split`：身份揭露

`index.css` 关键帧：`player-attention-pulse`（发言/守护脉冲环）、`player-fall`（淘汰倒下）、`cursor-blink`（打字光标）、`quality-focus-pulse`（质检定位高亮）。

**无障碍**：`@media (prefers-reduced-motion: reduce)` 关闭所有装饰动画（脉冲、进场、倒下、扫描）；`:focus-visible` 统一金色 `outline: 2px solid #d7bd8b`。

---

## 11. 令牌来源速查

| 内容 | 文件 |
|---|---|
| 色板 / 字体 / 字号 / 圆角 / 动画 / 阴影 | `tailwind.config.js` |
| CSS 变量 / 全局面板类 / 状态类 / 关键帧 / reduced-motion | `src/index.css` |
| 角色（图标 / symbol / label / color / team） | `game/roleConfig.ts` |
| 事件配色（圆点 / 卡片 / 图标 / label） | `game/TimelineEvent.tsx` → `getEventStyle` |
| 导演分级 / 注意力 / 事件筛选 / 音效 | `game/gameDirector.ts` |
| 过场动画 kinds | `game/cinematics.ts` |
