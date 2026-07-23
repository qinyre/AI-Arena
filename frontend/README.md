# AI Arena Frontend

AI Arena的前端界面 - React + TypeScript + Vite + Tailwind CSS

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问: http://localhost:5173

### 3. 构建生产版本

```bash
npm run build
```

---

## 📦 技术栈

- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Tailwind CSS** - 样式框架
- **React Hooks** - 状态管理

---

## 🎮 功能特性

### ✅ 创建游戏
- 配置5个AI玩家
- 选择模型提供商（OpenAI / Anthropic / Ollama）
- 选择具体模型
- 可选随机种子

### ✅ 实时观战
- 游戏状态实时更新（每3秒）
- 显示当前轮次和阶段
- 存活/死亡玩家列表
- 自动刷新直到游戏完成

### ✅ 游戏结果
- 胜利方和原因
- 游戏时长
- 总成本和玩家成本
- 详细统计信息

### ✅ 历史记录
- 所有游戏列表
- 状态筛选
- 查看详情
- 删除游戏

### ✅ 统计仪表盘
- 总游戏数
- 完成/运行中/错误数量
- 总成本追踪

---

## 📂 项目结构

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts          # API客户端
│   ├── components/
│   │   ├── CreateGame.tsx     # 创建游戏组件
│   │   ├── GameView.tsx       # 游戏视图组件
│   │   ├── GameHistory.tsx    # 历史记录组件
│   │   └── Stats.tsx          # 统计组件
│   ├── hooks/
│   │   └── useGame.ts         # 游戏Hook
│   ├── types/
│   │   └── api.ts             # API类型定义
│   ├── App.tsx                # 主应用
│   ├── main.tsx               # 入口文件
│   └── index.css              # 全局样式
├── index.html                 # HTML模板
├── package.json               # 依赖配置
├── tsconfig.json              # TypeScript配置
├── vite.config.ts             # Vite配置
└── tailwind.config.js         # Tailwind配置
```

---

## 🔧 配置

### API端点

默认连接到 `http://localhost:8000`

修改方式：
1. 创建 `.env` 文件
2. 设置 `VITE_API_BASE=http://your-api-url`

### 代理配置

开发模式下自动代理 `/api` 到后端服务器（见 `vite.config.ts`）

---

## 🎨 UI设计

### 色彩方案
- 背景：深色主题（gray-900）
- 卡片：gray-800
- 强调色：blue-500（主按钮）
- 成功：green-500
- 警告：yellow-500
- 错误：red-500

### 组件风格
- 圆角卡片
- 柔和阴影
- 平滑过渡
- 响应式设计

---

## 📝 API集成

### 使用示例

```typescript
import { apiClient } from './api/client';

// 创建游戏
const response = await apiClient.createGame({
  player_configs: [
    { player_id: 'AI-1', provider: 'openai', model: 'gpt-4o-mini' },
    // ... 4 more players
  ],
  seed: 42
});

// 查询状态
const status = await apiClient.getGameStatus(gameId);

// 获取结果
const result = await apiClient.getGameResult(gameId);
```

### 自定义Hook

```typescript
import { useGame } from './hooks/useGame';

function MyComponent() {
  const { status, result, loading, error } = useGame(gameId);
  
  // 自动轮询，游戏完成后停止
}
```

---

## 🧪 开发

### 运行开发服务器

```bash
npm run dev
```

### 类型检查

```bash
npm run build
```

### Lint检查

```bash
npm run lint
```

---

## 🚀 部署

### 构建

```bash
npm run build
```

输出目录: `dist/`

### 预览

```bash
npm run preview
```

### 部署到静态托管

构建后的 `dist/` 目录可以部署到：
- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages
- 任何静态文件服务器

---

## 🎯 功能路线图

### MVP (已完成)
- ✅ 创建游戏界面
- ✅ 实时游戏监控
- ✅ 结果展示
- ✅ 历史记录
- ✅ 统计仪表盘

### v1.0 (计划中)
- [ ] WebSocket实时推送
- [ ] 游戏回放
- [ ] 用户登录
- [ ] 房间管理
- [ ] 多语言支持

---

## 🐛 故障排除

### 问题：无法连接到API

**解决方案**:
1. 确认后端服务器正在运行（http://localhost:8000）
2. 检查 `.env` 配置
3. 查看浏览器控制台错误

### 问题：样式不显示

**解决方案**:
1. 确认 Tailwind CSS 已安装
2. 运行 `npm install`
3. 重启开发服务器

### 问题：TypeScript错误

**解决方案**:
1. 运行 `npm install`
2. 删除 `node_modules` 重新安装
3. 检查 `tsconfig.json` 配置

---

## 📚 相关文档

- [后端API文档](../backend/API.md)
- [项目README](../README.md)
- [MVP完成报告](../docs/MVP_COMPLETION_REPORT.md)

---

## 💡 提示

1. **开发时先启动后端**: 确保 `http://localhost:8000` 可访问
2. **使用本地模型测试**: Ollama模型免费且快速
3. **浏览器开发工具**: 打开Network标签查看API请求

---

**准备就绪！启动前端开始对战！** 🚀
