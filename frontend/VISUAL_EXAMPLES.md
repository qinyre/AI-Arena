# 事件时间线 UI 视觉效果演示

## 🎨 配色方案速查表

### 事件类型配色矩阵

```
事件类型        图标  主色调      渐变起点         渐变终点          应用场景
─────────────────────────────────────────────────────────────────────
游戏开始        🎮   绿色系      green-500       emerald-600      积极、开始
狼人击杀        🔪   红色系      red-500         rose-600         危险、攻击  
预言家查验      🔮   紫色系      purple-500      violet-600       神秘、洞察
玩家发言        💬   蓝色系      blue-500        cyan-600         交流、信息
投票            🗳️   黄色系      yellow-500      amber-600        决策、选择
投票结果        📊   绿蓝系      green-500       teal-600         结果、统计
玩家死亡        💀   灰色系      gray-500        slate-600        严肃、结束
阶段切换        ⏰   靛蓝系      indigo-500      blue-600         时间、节奏
游戏结束        🏁   紫粉系      purple-500      pink-600         庆祝、完成
```

---

## 🖼️ 实际渲染效果示例

### 示例 1: 狼人击杀事件

```
时间线          卡片内容
────────────────────────────────────────────────────────
              
   🔪          ╔═══════════════════════════════════════╗
   ●           ║  狼人击杀                 12:34:56   ║
   │           ║                           [查看推理]  ║
   │           ║  ─────────────────────────────────   ║
   │           ║  目标: [Player3]                     ║
   │           ║                                       ║
   │           ║  ┌─ AI 推理过程 ────────────────┐   ║
   │           ║  │ ● ● ●  AI 推理过程 reason... │   ║
   │           ║  ├────────────────────────────────┤   ║
   │           ║  │ 1 │ 分析 Player3 前序行为:   │   ║
   │           ║  │ 2 │ - 第1轮投票表现保守      │   ║
   │           ║  │ 3 │ - 发言避开核心争议       │   ║
   │           ║  │ 4 │                          │   ║
   │           ║  │ 5 │ 威胁度评估: ★★★☆☆       │   ║
   │           ║  │ 6 │ 决策: 优先击杀           │   ║
   │           ║  └────────────────────────────────┘   ║
   │           ║                                       ║
   │           ║  [🔒 私密] 可见: Werewolf1, ...      ║
   │           ╚═══════════════════════════════════════╝
   │           
   ↓           (红色渐变 + 光晕效果)
```

**CSS 实现:**
```jsx
// 节点
<div className="bg-gradient-to-br from-red-500 to-rose-600 
                shadow-red-500/10 shadow-lg 
                rounded-full p-2 text-sm">
  🔪
</div>

// 卡片
<div className="border-red-500/30 
                bg-gradient-to-br from-red-950/40 to-rose-950/20
                rounded-xl p-4 shadow-md hover:shadow-xl
                transition-all duration-300">
  {/* 内容 */}
</div>

// AI 推理区域
<div className="border border-amber-500/20 
                bg-gradient-to-br from-amber-950/30 to-yellow-950/20
                backdrop-blur-sm rounded-lg overflow-hidden">
  {/* 编辑器风格内容 */}
</div>
```

---

### 示例 2: 预言家查验事件

```
   🔮          ╔═══════════════════════════════════════╗
   ●           ║  预言家查验               23:15:42   ║
   │           ║                           [查看推理]  ║
   │           ║  ─────────────────────────────────   ║
   │           ║                                       ║
   │           ║  [Player2] → [好人]                  ║
   │           ║     ↓           ↓                    ║
   │           ║  (紫色)      (绿色)                  ║
   │           ║                                       ║
   │           ║  ┌─ AI 推理过程 ────────────────┐   ║
   │           ║  │ ● ● ●  reasoning.txt         │   ║
   │           ║  ├────────────────────────────────┤   ║
   │           ║  │ 1 │ 基于已知信息:            │   ║
   │           ║  │ 2 │ - 已知狼人: 0人          │   ║
   │           ║  │ 3 │ - 可疑玩家: Player2      │   ║
   │           ║  │ 4 │                          │   ║
   │           ║  │ 5 │ 查验策略:                │   ║
   │           ║  │ 6 │ 优先验证高可疑度目标     │   ║
   │           ║  │ 7 │                          │   ║
   │           ║  │ 8 │ 结果: Player2 为好人     │   ║
   │           ║  │ 9 │ 更新信息库...            │   ║
   │           ║  └────────────────────────────────┘   ║
   │           ╚═══════════════════════════════════════╝
   ↓           
              (紫色渐变 + 神秘光晕)
```

**特殊元素:**
```jsx
// 查验结果标签
<span className="px-3 py-1 rounded-lg 
                 bg-purple-500/10 text-purple-300 
                 font-medium border border-purple-500/20">
  Player2
</span>

<span className="text-gray-500">→</span>

<span className="px-3 py-1 rounded-lg 
                 bg-green-500/10 text-green-300 
                 font-medium border border-green-500/20">
  好人
</span>
```

---

### 示例 3: 玩家发言事件

```
   💬          ╔═══════════════════════════════════════╗
   ●           ║  Player1 发言             10:23:15   ║
   │           ║  ─────────────────────────────────   ║
   │           ║                                       ║
   │           ║  │ 我认为 Player3 的投票很可疑，    ║
   │           ║  │ 他一直在避开核心讨论，而且        ║
   │           ║  │ 发言模式与狼人特征高度吻合。      ║
   │           ║  │ 建议大家重点关注。                ║
   │           ║    (蓝色左侧竖线强调)                ║
   │           ║                                       ║
   │           ║  [🎭 跳身份: 预言家]                 ║
   │           ╚═══════════════════════════════════════╝
   ↓           
              (蓝色渐变 + 对话氛围)
```

**气泡样式实现:**
```jsx
// 发言内容容器
<div className="relative pl-4 border-l-2 border-blue-500/30">
  <div className="text-sm text-gray-200 leading-relaxed">
    {data.content}
  </div>
</div>

// 身份跳认标签
<div className="inline-flex items-center gap-1.5 
                px-2.5 py-1 rounded-full 
                bg-purple-500/10 text-purple-300 
                text-xs font-medium border border-purple-500/20">
  <span>🎭</span>
  <span>跳身份: {data.claim_role}</span>
</div>
```

---

## 🎭 交互状态演示

### 卡片悬停效果动画

```
静止状态:
┌─────────────────────────────┐
│   正常大小 (scale: 1)        │  shadow-md
│   边框透明度 30%             │  border-opacity: 30%
└─────────────────────────────┘

     ↓ hover (300ms 过渡)

悬停状态:
┌────────────────────────────────┐
│   放大 1% (scale: 1.01)        │  shadow-xl
│   边框透明度 50%                │  border-opacity: 50%
│   + 顶部白色光效 (5% 不透明度)  │  光晕增强
└────────────────────────────────┘
```

**CSS 代码:**
```jsx
<div className={`
  transition-all duration-300
  ${isHovered 
    ? 'shadow-xl scale-[1.01] border-opacity-50' 
    : 'shadow-md'
  }
`}>
  {/* 内容 */}
  
  {/* 悬停光效 */}
  {isHovered && (
    <div className="pointer-events-none absolute inset-0 
                    bg-gradient-to-br from-white/5 to-transparent" />
  )}
</div>
```

---

### AI 推理展开/收起动画

```
收起状态:
┌─────────────────────────────┐
│  事件内容                    │
│                              │
│           [查看推理 ▼]       │
└─────────────────────────────┘

     ↓ 点击 (200ms 动画)

展开状态:
┌─────────────────────────────┐
│  事件内容                    │
│                              │
│  ╔═══════════════════════╗  │  ← 从高度 0 展开
│  ║ AI 推理过程            ║  │     不透明度 0→1
│  ║ 1 │ ...               ║  │
│  ╚═══════════════════════╝  │
│                              │
│           [收起推理 ▲]       │  ← 图标旋转 180°
└─────────────────────────────┘
```

**动画实现:**
```jsx
// 按钮图标旋转
<svg className={`
  w-3 h-3 transition-transform duration-200
  ${isExpanded ? 'rotate-180' : ''}
`}>
  <path d="M19 9l-7 7-7-7" />  {/* 下箭头 */}
</svg>

// 内容区展开 (使用 max-height 技巧)
<div className={`
  overflow-hidden transition-all duration-200
  ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
`}>
  <AIReasoningBlock />
</div>
```

---

## 📐 尺寸与间距规范

### 时间线布局尺寸

```
├─ 节点图标: 32x32px (p-2 + text-sm)
├─ 节点左边距: 0 (absolute left-0)
├─ 卡片左边距: 32px (pl-8)
├─ 连接线宽度: 1px
├─ 连接线位置: left-[15px] (节点中心)
├─ 卡片间距: 16px (space-y-4)
└─ 容器右内边距: 8px (pr-2, 为滚动条留空间)
```

### 卡片内部间距

```
卡片容器 (p-4):
├─ 顶部: 16px
├─ 右侧: 16px
├─ 底部: 16px
└─ 左侧: 16px

内容区域:
├─ 事件头部与内容间距: 12px (mb-3)
├─ 标签间距: 8px (gap-2)
├─ 推理区域上边距: 16px (mt-4)
└─ 可见性标签上边距: 12px (mt-3)
```

### AI 推理区域尺寸

```
编辑器容器:
├─ 标题栏高度: 36px (py-2)
├─ 行号列宽度: 48px (w-12)
├─ 内容左内边距: 56px (pl-14, 留出行号空间)
├─ 字体大小: 14px (text-sm)
├─ 行高: 24px (leading-6)
└─ 圆点尺寸: 12px (h-3 w-3)
```

---

## 🌈 完整配色代码表

### Tailwind CSS 类名速查

```javascript
// 节点图标背景
const iconBgClasses = {
  green: 'bg-gradient-to-br from-green-500 to-emerald-600',
  red: 'bg-gradient-to-br from-red-500 to-rose-600',
  purple: 'bg-gradient-to-br from-purple-500 to-violet-600',
  blue: 'bg-gradient-to-br from-blue-500 to-cyan-600',
  yellow: 'bg-gradient-to-br from-yellow-500 to-amber-600',
  teal: 'bg-gradient-to-br from-green-500 to-teal-600',
  gray: 'bg-gradient-to-br from-gray-500 to-slate-600',
  indigo: 'bg-gradient-to-br from-indigo-500 to-blue-600',
  pink: 'bg-gradient-to-br from-purple-500 to-pink-600',
}

// 卡片边框
const borderClasses = {
  green: 'border-green-500/30',
  red: 'border-red-500/30',
  purple: 'border-purple-500/30',
  blue: 'border-blue-500/30',
  yellow: 'border-yellow-500/30',
  // ...
}

// 卡片背景渐变
const bgGradientClasses = {
  green: 'bg-gradient-to-br from-green-950/40 to-emerald-950/20',
  red: 'bg-gradient-to-br from-red-950/40 to-rose-950/20',
  purple: 'bg-gradient-to-br from-purple-950/40 to-violet-950/20',
  // ...
}

// 阴影光晕
const glowClasses = {
  green: 'shadow-green-500/10',
  red: 'shadow-red-500/10',
  purple: 'shadow-purple-500/10',
  // ...
}
```

---

## 🎬 动画时间曲线

### 标准过渡

```css
/* 通用平滑过渡 */
transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);

/* Tailwind 类名 */
transition-all duration-300
```

### 快速响应

```css
/* 按钮交互 */
transition: all 200ms ease-in-out;

/* Tailwind 类名 */
transition-all duration-200
```

### 加载动画

```css
/* 旋转动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

animation: spin 1s linear infinite;

/* Tailwind 类名 */
animate-spin
```

---

## 🔍 细节优化点

### 1. 文字渐变效果（未使用，但可选）

```jsx
<h3 className="text-xl font-bold bg-gradient-to-r 
               from-blue-400 to-purple-400 
               bg-clip-text text-transparent">
  事件时间线
</h3>
```

### 2. 毛玻璃效果

```jsx
<div className="backdrop-blur-sm bg-white/5">
  {/* 内容 */}
</div>
```

### 3. 脉冲动画（游戏运行中）

```jsx
<span className="animate-pulse">
  运行中...
</span>
```

### 4. 渐变边框技巧

```jsx
// 使用伪元素实现渐变边框
<div className="relative p-[1px] rounded-xl 
                bg-gradient-to-br from-blue-500 to-purple-500">
  <div className="bg-gray-900 rounded-xl p-4">
    {/* 内容 */}
  </div>
</div>
```

---

## 📱 响应式断点示例

### 桌面端 (> 1024px)

```jsx
<div className="pl-8">                  {/* 完整左边距 */}
  <div className="p-4">                 {/* 标准内边距 */}
    <span className="text-base">       {/* 标准字体 */}
```

### 平板端 (640px - 1024px)

```jsx
<div className="pl-8 md:pl-6">         {/* 减小左边距 */}
  <div className="p-4 md:p-3">         {/* 减小内边距 */}
    <span className="text-base md:text-sm"> {/* 缩小字体 */}
```

### 移动端 (< 640px)

```jsx
<div className="pl-8 sm:pl-0">         {/* 移除时间线 */}
  <div className="p-4 sm:p-3">         {/* 最小内边距 */}
    <span className="text-base sm:text-sm"> {/* 小字体 */}
```

---

## ✨ 特殊效果库

### 推荐的增强效果（可选）

1. **Framer Motion** - 高级动画
```bash
npm install framer-motion
```

```jsx
import { motion } from 'framer-motion'

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  {/* 事件卡片 */}
</motion.div>
```

2. **React Spring** - 物理动画
```bash
npm install @react-spring/web
```

```jsx
import { useSpring, animated } from '@react-spring/web'

const springs = useSpring({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

<animated.div style={springs}>
  {/* 内容 */}
</animated.div>
```

---

## 🎯 设计验收标准

### 视觉检查清单

- [ ] **节点图标**: 圆形、渐变背景、彩色光晕
- [ ] **连接线**: 1px 宽、灰色、渐变透明
- [ ] **卡片边框**: 彩色、30% 透明度、圆角 12px
- [ ] **卡片背景**: 双色渐变、暗色调、微妙
- [ ] **阴影**: 分层、彩色光晕、动态增强
- [ ] **AI 推理**: 编辑器风格、行号、等宽字体、琥珀色
- [ ] **标签**: 圆角胶囊、半透明背景、彩色边框
- [ ] **字体**: 标题 semibold、内容 normal、代码 mono
- [ ] **间距**: 一致的 4px 倍数系统
- [ ] **动画**: 300ms 过渡、自然缓动曲线

### 交互检查清单

- [ ] **hover 卡片**: 放大 1%、阴影增强、光效显现
- [ ] **hover 节点**: 同步放大 10%
- [ ] **hover 按钮**: 颜色变化、边框高亮
- [ ] **点击展开**: 图标旋转、内容展开、平滑动画
- [ ] **滚动**: 自定义滚动条、平滑滚动
- [ ] **加载**: 双环旋转动画

---

## 📐 打印样式（可选）

如果需要支持打印:

```css
@media print {
  .custom-scrollbar {
    max-height: none;
    overflow: visible;
  }
  
  .event-card {
    break-inside: avoid;
    box-shadow: none !important;
    border: 1px solid #ccc !important;
  }
  
  .ai-reasoning-block {
    border: 1px solid #999;
    background: #f5f5f5 !important;
  }
}
```

---

**视觉演示完成!** 🎨

参考这些示例来理解和验证 UI 效果。
