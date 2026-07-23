# AI 狼人杀事件时间线 UI 设计规范

## 🎯 设计目标

为 AI/技术爱好者打造一个高端、沉浸式的事件观察体验，让用户能够深度理解 AI 的决策过程。

---

## 📐 整体设计语言

### 设计哲学
参考现代 SaaS 产品（Linear、Vercel、Stripe）的设计原则：
- **极简主义**: 去除装饰，突出内容
- **微妙渐变**: 使用细腻的色彩过渡
- **流畅动画**: 自然的交互反馈
- **代码美学**: AI 推理采用 IDE 风格

### 色彩系统

#### 主题色调
- **背景**: `gray-900` (#111827) - 深色主题基础
- **卡片背景**: `gray-800` (#1F2937) - 内容容器
- **边框**: `gray-700/30` - 微妙分隔

#### 事件类型配色（渐变 + 光效）

| 事件类型 | 图标 | 主色 | 渐变 | 应用场景 |
|---------|------|------|------|---------|
| 游戏开始 | 🎮 | `green-500` → `emerald-600` | 绿色系 | 积极、开始 |
| 狼人击杀 | 🔪 | `red-500` → `rose-600` | 红色系 | 危险、攻击 |
| 预言家查验 | 🔮 | `purple-500` → `violet-600` | 紫色系 | 神秘、洞察 |
| 玩家发言 | 💬 | `blue-500` → `cyan-600` | 蓝色系 | 交流、信息 |
| 投票 | 🗳️ | `yellow-500` → `amber-600` | 黄色系 | 决策、选择 |
| 投票结果 | 📊 | `green-500` → `teal-600` | 绿蓝系 | 结果、统计 |
| 玩家死亡 | 💀 | `gray-500` → `slate-600` | 灰色系 | 严肃、结束 |
| 阶段切换 | ⏰ | `indigo-500` → `blue-600` | 靛蓝系 | 时间、节奏 |
| 游戏结束 | 🏁 | `purple-500` → `pink-600` | 紫粉系 | 庆祝、完成 |

---

## 🏗️ 布局结构

### 时间线整体布局

```
┌─────────────────────────────────────────────┐
│  [头部]                                      │
│  事件时间线                    [N 条事件]     │
│  实时追踪 AI 决策过程                        │
├─────────────────────────────────────────────┤
│                                              │
│  ● ─────┬─────────────────────────┬────────│
│         │  [事件卡片]              │ [时间] │
│         │  图标 + 标题 + 内容      │ [操作] │
│         │  [AI 推理区域]           │        │
│         └─────────────────────────┴────────│
│         │                                   │
│  ● ─────┬─────────────────────────┬────────│
│         │  [事件卡片]              │        │
│         └─────────────────────────┴────────│
│         │                                   │
│  ●      │                                   │
│                                              │
└─────────────────────────────────────────────┘
```

### 事件卡片解剖

```
┌─────────────────────────────────────────────┐
│ [图标节点]                                   │
│   🔮                                         │
├─[卡片主体]──────────────────────────────────┤
│  ┌─ 事件头部 ──────────────┬─ 元数据 ──┐   │
│  │ 预言家查验              │ 12:34:56  │   │
│  │                         │ [查看推理]│   │
│  ├─ 事件内容 ─────────────┴───────────┤   │
│  │ [Player1] → 好人                    │   │
│  │                                     │   │
│  ├─ AI 推理区（可展开）─────────────── │   │
│  │ ╔═══════════════════════════════╗  │   │
│  │ ║ ● ● ●  AI 推理过程             ║  │   │
│  │ ╠═══════════════════════════════╣  │   │
│  │ ║ 1 | 基于前序信息...           ║  │   │
│  │ ║ 2 | 该玩家行为可疑...         ║  │   │
│  │ ╚═══════════════════════════════╝  │   │
│  │                                     │   │
│  └─ 可见性标签 ─────────────────────── │   │
│    [🔒 私密] 可见: Player1              │   │
└─────────────────────────────────────────────┘
```

---

## 🎨 视觉设计细节

### 1. 时间线节点

```css
/* 图标容器 */
- 尺寸: 32x32px (p-2)
- 形状: 圆形 (rounded-full)
- 背景: 双色渐变 (bg-gradient-to-br)
- 阴影: 彩色光晕 (shadow-{color}-500/10)
- 动画: hover 时放大 10% (scale-110)
```

### 2. 连接线

```css
/* 垂直线 */
- 位置: 节点中心向下延伸
- 宽度: 1px
- 颜色: 渐变透明 (from-gray-700 to-transparent)
- 效果: 营造时间流逝感
```

### 3. 事件卡片

```css
/* 基础样式 */
- 圆角: rounded-xl (12px)
- 边框: 1px 主题色 30% 透明度
- 背景: 双色渐变 (from-{color}-950/40)
- 阴影: 主题色光晕 + 深度阴影
- 内边距: p-4 (16px)

/* 交互状态 */
- hover: 放大 1% + 增强阴影 + 边框不透明度 50%
- transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1)
```

### 4. AI 推理区域 - 代码编辑器风格

#### 设计灵感: VS Code / Linear 的代码块

```
╔═══════════════════════════════════════╗
║ ● ● ●  AI 推理过程      reasoning.txt ║  ← 模拟窗口标题栏
╠═══════════════════════════════════════╣
║ 1 │ 基于前序投票行为，Player3 表现   ║  ← 行号 + 内容
║ 2 │ 出明显的避票趋势，可能隐藏身份   ║
║ 3 │                                   ║
║ 4 │ 综合分析：                        ║
║ 5 │ - 语言模式: 防守性强             ║
║ 6 │ - 投票倾向: 避开核心玩家         ║
║ 7 │ - 结论: 查验价值高               ║
╚═══════════════════════════════════════╝
```

**实现细节:**

```css
/* 外层容器 */
border: border-amber-500/20
background: bg-gradient-to-br from-amber-950/30
backdrop-filter: backdrop-blur-sm

/* 标题栏 */
- 三个圆点: 红/黄/绿 macOS 风格
- 文件名: reasoning.txt (font-mono)
- 背景: bg-amber-950/20

/* 行号区 */
- 宽度: 48px
- 对齐: text-right
- 颜色: text-amber-400/30
- 字体: font-mono text-xs

/* 内容区 */
- 字体: font-mono text-sm
- 颜色: text-amber-100/90
- 行高: leading-6
- 保留换行: whitespace-pre-wrap

/* 光效 */
- 顶部渐变: from-amber-400/5 to-transparent
```

---

## 🎭 组件拆分建议

### 主组件: `EventTimeline`
**职责**: 整体布局、数据加载、状态管理

```typescript
<EventTimeline gameId={string}>
  ├─ 头部 (标题 + 统计)
  ├─ 时间线容器 (滚动区域)
  │   └─ EventCard[] (循环渲染)
  └─ 加载/错误状态
```

### 子组件 1: `EventCard`
**职责**: 单个事件的完整展示

```typescript
<EventCard event={GameEvent} index={number}>
  ├─ TimelineNode (时间线节点)
  ├─ CardContainer (卡片容器)
  │   ├─ EventHeader (事件头部)
  │   ├─ EventContent (事件内容)
  │   ├─ AIReasoningBlock? (推理区域)
  │   └─ VisibilityBadge? (可见性标签)
  └─ HoverEffect (悬停光效)
```

### 子组件 2: `AIReasoningBlock`
**职责**: AI 推理内容的特殊呈现

```typescript
<AIReasoningBlock reasoning={string} isExpanded={boolean}>
  ├─ EditorHeader (模拟编辑器标题栏)
  │   ├─ MacOSDots (三个圆点)
  │   └─ FileName (reasoning.txt)
  ├─ ContentArea
  │   ├─ LineNumbers (行号列)
  │   └─ ReasoningText (推理内容)
  └─ GlowOverlay (光效覆盖层)
```

### 子组件 3: `EventContentRenderer`
**职责**: 根据事件类型渲染不同内容

```typescript
switch (event_type) {
  case 'player_speech':
    return <SpeechBubble />
  case 'werewolf_kill':
    return <KillTarget + AIReasoningBlock />
  case 'seer_investigate':
    return <InvestigateResult + AIReasoningBlock />
  // ...
}
```

---

## 🎬 动画与交互设计

### 1. 卡片悬停效果

```javascript
// 状态变化
scale: 1 → 1.01
shadow: md → xl
border-opacity: 30% → 50%

// 时间曲线
transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1)

// 附加效果
- 节点图标同步放大 10%
- 顶部光效显现 (from-white/5)
```

### 2. 推理区域展开/收起

```javascript
// 按钮动画
<svg className={isExpanded ? 'rotate-180' : ''}>
  ↓ 图标
</svg>

// 内容动画
- 高度: 0 → auto (使用 max-height 技巧)
- 不透明度: 0 → 1
- 持续时间: 300ms
- 时间曲线: ease-in-out

// 建议使用 CSS transition
overflow: hidden
max-height: isExpanded ? '500px' : '0'
opacity: isExpanded ? 1 : 0
```

### 3. 滚动行为

```css
/* 平滑滚动 */
scroll-behavior: smooth;

/* 自定义滚动条 */
scrollbar-width: thin;
scrollbar-color: rgba(75, 85, 99, 0.5) transparent;

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-thumb {
  background: rgba(75, 85, 99, 0.5);
  border-radius: 3px;
}
```

### 4. 加载状态

```javascript
// 双环旋转效果
<div className="relative">
  {/* 静态外环 */}
  <div className="h-12 w-12 rounded-full border-2 border-gray-700" />
  
  {/* 旋转内环 */}
  <div className="absolute top-0 h-12 w-12 animate-spin 
                  rounded-full border-2 border-transparent 
                  border-t-blue-500" />
</div>
```

---

## 📱 响应式设计

### 断点策略

```css
/* 移动端 (< 640px) */
- 移除左侧时间线
- 卡片全宽显示
- 时间戳移至卡片内部
- 推理按钮改为底部展开

/* 平板 (640px - 1024px) */
- 保留时间线
- 减小卡片内边距
- 缩小字体

/* 桌面 (> 1024px) */
- 完整设计
- 最大内容宽度
```

### 移动端优化

```jsx
// 条件渲染时间线
{!isMobile && <TimelineNode />}

// 自适应布局
<div className="flex-col md:flex-row">
  <div className="md:pl-8">
    {/* 内容 */}
  </div>
</div>
```

---

## 🛠️ 技术实现要点

### 1. Tailwind CSS 配置

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      backdropBlur: {
        xs: '2px',
      }
    }
  }
}
```

### 2. CSS 自定义类

```css
/* index.css */
@layer components {
  .custom-scrollbar { /* ... */ }
  
  .event-card-glow {
    box-shadow: 
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06),
      0 0 15px 0 var(--glow-color);
  }
}
```

### 3. 性能优化

```javascript
// 虚拟化长列表
import { useVirtualizer } from '@tanstack/react-virtual'

// 防抖滚动事件
const handleScroll = debounce(() => {
  // 滚动逻辑
}, 100)

// 懒加载推理内容
{isExpanded && <AIReasoningBlock />}
```

### 4. 状态管理

```javascript
// 使用 Set 管理展开状态 (O(1) 查找)
const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())

// 悬停状态
const [hoveredEvent, setHoveredEvent] = useState<number | null>(null)
```

---

## 🎯 关键设计决策

### 为什么选择代码编辑器风格展示 AI 推理？

1. **符合目标用户心智模型**: 技术爱好者熟悉 IDE 界面
2. **提升专业感**: 类似查看源代码的体验
3. **增强可读性**: 行号、语法高亮（颜色）、等宽字体
4. **视觉差异化**: 与普通内容区分明确

### 为什么使用渐变而非纯色？

1. **视觉深度**: 渐变创造立体感
2. **现代审美**: 符合 2024-2026 设计趋势
3. **品牌差异**: 避免扁平化同质化
4. **光效协同**: 渐变 + 阴影光晕更和谐

### 为什么采用垂直时间线而非横向？

1. **自然滚动**: 符合网页垂直滚动习惯
2. **空间利用**: 水平空间留给内容
3. **时间感知**: 向下滚动 = 时间推进
4. **移动友好**: 易于响应式适配

---

## 📦 交付清单

### 已完成
- ✅ `EventTimeline.enhanced.tsx` - 完整实现的组件
- ✅ `DESIGN_SPEC.md` - 本设计规范文档
- ✅ 自定义滚动条样式

### 使用方法

```bash
# 1. 替换原组件
mv EventTimeline.enhanced.tsx EventTimeline.tsx

# 2. 确认 CSS 已更新
# index.css 中已添加 .custom-scrollbar 样式

# 3. 重启开发服务器
npm run dev
```

### 可选扩展

1. **添加动画库** (Framer Motion)
   ```bash
   npm install framer-motion
   ```

2. **虚拟化滚动** (长列表性能优化)
   ```bash
   npm install @tanstack/react-virtual
   ```

3. **代码高亮** (如果推理内容包含代码)
   ```bash
   npm install react-syntax-highlighter
   ```

---

## 🎨 设计灵感来源

- **Linear**: 时间线布局、微妙动画
- **Vercel**: 渐变配色、深色主题
- **Stripe**: 卡片设计、信息层次
- **VS Code**: 推理区域的编辑器风格
- **GitHub**: 时间线节点、连接线设计

---

## 📞 设计问题 FAQ

**Q: 为什么不使用更鲜艳的颜色？**
A: 深色主题需要降低饱和度避免视觉疲劳，使用 `{color}-500` + 低透明度实现微妙效果。

**Q: 推理区域可以支持 Markdown 吗？**
A: 可以，集成 `react-markdown` 并保持等宽字体样式即可。

**Q: 如何添加更多事件类型？**
A: 在 `getEventConfig()` 函数中添加新类型配置，遵循现有色彩系统选择合适渐变。

**Q: 能否支持深色/浅色主题切换？**
A: 可以使用 Tailwind 的 `dark:` 前缀或 CSS 变量实现，需要定义对应的浅色配色方案。

---

*设计版本: v1.0*  
*最后更新: 2026-07-23*
