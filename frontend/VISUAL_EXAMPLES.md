# 观战界面视觉参考

本文档用**真实代码片段**说明观战界面各元素的视觉实现，所有片段均取自 `frontend/src/components/game/` 与 `src/index.css` 的当前代码。设计令牌释义见 [DESIGN_SPEC.md](./DESIGN_SPEC.md)。

---

## 1. 时间线：圆点 + 事件卡片

每个事件由 `TimelineEvent.tsx` 渲染为「左侧彩色圆点 + 右侧卡片」。圆点配色与卡片变体由 `getEventStyle()` 决定。

**配色定义**（`game/TimelineEvent.tsx`，节选）：

```ts
if (isWerewolfKill(e)) {
  return {
    dotBorder: 'border-[#eb2445]',
    dotCore: 'bg-[#eb2445] shadow-[0_0_5px_rgba(235,36,69,0.9)]',
    cardClass: 'wolf-action',
    headColor: 'text-[#ffb3b3]',
    symbol: 'swords',
    label: '狼人行动',
  };
}
if (isSeerInvestigate(e)) {
  return {
    dotBorder: 'border-[#e9c400]',
    dotCore: 'bg-[#e9c400] shadow-[0_0_5px_rgba(233,196,0,0.9)]',
    cardClass: 'seer-action',
    headColor: 'text-[#ffe16d]',
    symbol: 'visibility',
    label: '预言家行动',
  };
}
```

**渲染结构**（`game/TimelineEvent.tsx`）：

```tsx
<div className={cn(
  'relative pl-9 animate-fade-in-up',
  tier === 'climax' && 'director-climax',
  tier === 'notable' && 'director-notable',
)} data-director-tier={tier}>
  {/* 左侧圆点 */}
  <div className={cn(
    'absolute left-[11px] top-3.5 w-3 h-3 rounded-full bg-[#102034] border z-10 flex items-center justify-center',
    style.dotBorder,
  )}>
    <div className={cn('w-1 h-1 rounded-full', style.dotCore)} />
  </div>

  {/* 关键事件用强调卡，常规动作用紧凑行 */}
  <div className={cn(
    'flex flex-col gap-1.5',
    prominent
      ? 'event-card rounded-lg px-3 py-2.5 my-2'
      : 'py-2 pr-2 border-b border-[#47464b]/20',
    prominent && style.cardClass,
  )}>
    {/* 头部：图标 + label + 时间 */}
    {/* ... EventBody ... */}
  </div>
</div>
```

**卡片变体样式**（`src/index.css`）：

```css
.event-card { background: rgba(18, 24, 28, 0.88); border: 1px solid rgba(230,223,210,0.1); }
.event-card.wolf-action  { border-color: rgba(184,70,61,0.42); }
.event-card.seer-action  { border-color: rgba(185,151,88,0.42); }
.event-card.death-action { border-color: rgba(184,70,61,0.34); background: rgba(42,18,18,0.68); }

/* 导演分级强调 */
.director-notable .event-card { box-shadow: inset 2px 0 0 rgba(185,151,88,0.28); }
.director-climax  .event-card { box-shadow: inset 3px 0 0 rgba(184,70,61,0.54), 0 12px 30px rgba(0,0,0,0.18); }
```

---

## 2. AI 推理面板（决策手记）

动作下方的「决策手记」由 `AIReasoningPanel.tsx` 渲染，金色左侧描边 + 深底。

```tsx
<div className="ai-reasoning-panel mt-1.5 px-2.5 py-1.5">
  <div className="mb-0.5 flex items-center gap-1.5 font-label text-[10px] tracking-[0.12em] text-ink-muted">
    <span className="text-antique-gold/80">决策手记</span>
    <span>· {playerId}</span>
    {kind && <span>{KIND_TAG[kind]}</span>}
  </div>
  <p className="font-body text-[12px] leading-[1.6] text-paper/75">{reasoning}</p>
</div>
```

```css
.ai-reasoning-panel { border-left: 1px solid rgba(185,151,88,0.5); background: rgba(9,13,16,0.56); }
```

`kind` 取值 `'speech' | 'kill' | 'investigate' | 'vote'`，对应标签 `发言判断 / 袭击判断 / 查验判断 / 投票判断`。

> 注：示例里的 `antique-gold` / `ink-muted` / `paper` 在当前 Tailwind 配置中未定义（无效类），样式实际由 `.ai-reasoning-panel` 的金色描边与深底承载。新写样式请用 `nocturne.gold` / `nocturne.on-surface-variant` 等已定义令牌。

---

## 3. 发言气泡（公开立场）

玩家发言由 `SpeechBubble.tsx` 渲染：头像 + 身份徽章 + 跳身份标签（伪装高亮）+ 发言正文 + 公开立场 chip。

```tsx
{/* 跳身份：与真实身份不符时标「伪装」 */}
{claim && (
  <span className={cn(
    'border px-1.5 py-0.5 font-label text-[10px]',
    isLying
      ? 'border-crimson/35 bg-crimson/10 text-[#d9877f]'
      : 'border-white/10 bg-white/[0.03] text-ink-muted',
  )}>
    {isLying ? `伪装 · ${claim}` : claim}
  </span>
)}

{/* 发言正文：金色左边竖条 */}
<div className="border-l-2 border-antique-gold/35 bg-white/[0.035] px-3 py-2 font-body text-[13px] leading-[1.6] text-paper/90">
  {content}
</div>

{/* 公开立场 chip：怀疑=绯红 / 信任=翠绿 / 计划票=金 / 身份读取=天蓝 */}
<span className="border border-crimson/25 bg-crimson/[0.06] px-1.5 py-0.5 text-red-200/80">怀疑 · {player}</span>
<span className="border border-emerald-400/20 bg-emerald-400/[0.05] px-1.5 py-0.5 text-emerald-200/75">信任 · {player}</span>
```

`isLying` 判定：`claim_role !== 'none' && claim_role !== realRole && realRole !== 'villager'`（村民跳神不算伪装）。

---

## 4. 投票结果（票数条 + 谁投谁）

`VoteResult.tsx`：竖向票数条形（出局者绯红）+ 「谁投谁」chip 明细 + 平票/白痴翻牌结果。

```tsx
{/* 票数条 */}
<div className={cn(
  'h-full rounded transition-all flex items-center justify-end pr-2',
  isOut
    ? 'bg-gradient-to-r from-[#eb2445]/60 to-[#eb2445]/80'
    : 'bg-gradient-to-r from-[#64748b]/50 to-[#64748b]/70',
)} style={{ width: `${(n / maxVotes) * 100}%` }}>
  <span className="font-label text-label-sm text-white font-bold">{n}</span>
</div>

{/* 谁投谁 chip：弃票灰，正常投票带金色箭头 */}
<span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-label border bg-[#1b2b3f]/60 border-[#47464b]/30">
  <LobeAvatar playerId={voter} className="h-3.5 w-3.5 rounded-full text-[8px] font-bold text-white" />
  <span className="text-[#d3e4fe]">{voter}</span>
  <span className="material-symbols-outlined text-[12px] text-[#e9c400]/70">arrow_forward</span>
  <span className="text-[#d3e4fe]">{target}</span>
</span>
```

票数明细优先取 `vote_result.vote_detail`（含弃票），回退到 `player_vote` 事件数组。

---

## 5. 玩家卡状态（注意力高亮）

`gameDirector.ts` 的 `playerAttention()` 返回每位玩家的状态，`PlayerTable.tsx` 据此加修饰类。CSS（`src/index.css`）：

```css
.player-card { border-left: 2px solid rgba(111,124,131,0.5); background: rgba(18,24,28,0.82); }
.player-card.active-wolf { border-left-color: rgba(184,70,61,0.9); }   /* 狼人阵营 */
.player-card.active-seer { border-left-color: rgba(185,151,88,0.9); }   /* 预言家 */

.player-card.is-speaking {                       /* 正在发言：金边 + 内金条 */
  border-color: rgba(185,151,88,0.62);
  box-shadow: inset 3px 0 0 rgba(185,151,88,0.82);
}
.player-card.is-targeted {                       /* 被刀：绯红径向光 */
  background: radial-gradient(circle at 86% 50%, rgba(184,70,61,0.18), transparent 42%), rgba(18,24,28,0.92);
  box-shadow: inset -2px 0 0 rgba(184,70,61,0.8);
}
.player-card.dead { filter: grayscale(0.9); opacity: 0.48; }            /* 已死亡 */
.player-card.is-fallen { animation: player-fall 650ms cubic-bezier(0.22,1,0.36,1) both; } /* 倒下 */

@keyframes player-fall {
  0%   { opacity: 1; transform: scale(1); filter: grayscale(0); }
  35%  { transform: scale(1.025); }
  100% { opacity: 0.48; transform: scale(0.97); filter: grayscale(0.9); }
}
```

发言/守护状态额外套一层脉冲环：`.player-card.is-speaking::after { animation: player-attention-pulse 1.35s ... }`。

---

## 6. 时间线竖线与卷宗底纹

中栏 `EventFeed` 容器用 `.chronicle-panel`（卷宗纸纹），竖线 `.timeline-line` 为金→绯红渐变。

```css
.chronicle-panel {
  background:
    linear-gradient(rgba(13,18,22,0.95), rgba(13,18,22,0.95)),
    repeating-linear-gradient(0deg, transparent 0 23px, rgba(230,223,210,0.03) 24px);
}

.timeline-line {
  position: absolute; top: 0; bottom: 0; left: 24px; width: 1px;
  background: linear-gradient(to bottom,
    rgba(230,223,210,0.04), rgba(185,151,88,0.42), rgba(184,70,61,0.34), rgba(230,223,210,0.04));
}
```

`phase_change` 事件不渲染为时间线条目，而是由 `EventFeed` 渲染为竖线上的阶段分隔条（夜晚 / 白天 / 投票 / 警长竞选 等，见 `EventFeed.tsx` `phaseMeta()`）。

---

## 7. 投票连线（VoteFlowOverlay）

投票阶段，`VoteFlowOverlay.tsx` 在三栏舞台上方叠加一层 SVG，按「谁投谁」画贝塞尔连线，定位锚点取自玩家卡的真实 DOM 位置。

```css
.vote-flow-overlay { filter: drop-shadow(0 0 5px rgba(185,151,88,0.24)); }
.vote-flow-path   { fill: none; stroke: rgba(201,166,91,0.74); stroke-width: 1.35; vector-effect: non-scaling-stroke; }
.vote-flow-target { fill: rgba(184,70,61,0.2); stroke: rgba(201,166,91,0.82); stroke-width: 1.4; }
```

---

## 8. 职业行动过场（ActionCinematics）

关键夜晚行动触发全屏过场（`ActionCinematics.tsx` + `cinematics.ts`）：角色插画为主体，UI 只承担字幕与节奏。容器用一组 `cinematic-*` 类搭建「审判庭」氛围（径向光晕、网格、巨型角色字、刻痕 tally、纸纹、暗角）。

```css
.cinematic-tribunal-field {
  background:
    radial-gradient(circle at 72% 50%, var(--cinematic-wash), transparent 28rem),
    linear-gradient(115deg, #090b0d 0%, #0d1114 45%, #080a0c 100%);
}
.cinematic-tribunal-glyph {                       /* 巨型角色字水印 */
  color: var(--cinematic-color); font-size: min(40vw, 37rem); opacity: 0.1;
  text-shadow: 0 0 5rem color-mix(in srgb, var(--cinematic-color) 22%, transparent);
}
.cinematic-vignette { box-shadow: inset 0 0 16vw 4vw rgba(0,0,0,0.82); }
```

`--cinematic-color` / `--cinematic-wash` 由 JS 按 `CinematicKind`（`wolf` / `seer` / `guard` / `witch-heal` / `hunter-shot` / `sheriff` / `victory-good` 等，见 `cinematics.ts`）注入。过场可跳过，受导演开关与 `prefers-reduced-motion` 控制。

---

## 9. 无障碍细节

```css
/* 统一金色聚焦框 */
:where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid #d7bd8b; outline-offset: 2px;
}

/* 尊重减少动效偏好：关闭所有装饰动画 */
@media (prefers-reduced-motion: reduce) {
  .cursor-blink, .animate-fade-in-up,
  .player-card.is-speaking::after, .player-card.is-protected::after,
  .player-card.is-fallen, .timeline-quality-focus { animation: none; }
}
```

实时恢复提示条带 `role="status" aria-live="polite"`，错误提示带 `role="alert"`（见 `GameView.tsx`）。
