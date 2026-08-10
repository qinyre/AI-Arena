# 测试核心游戏引擎

## 当前进度

✅ **已完成**:
- 游戏引擎核心（WerewolfGame）
- AI智能体系统（AIAgent）
- 多家 LLM 接入（OpenAI、Anthropic、DeepSeek、Gemini、Qwen、Kimi、MiMo、MiniMax、GLM、SiliconFlow）
- 游戏编排器（GameOrchestrator）
- 完整的多板型狼人杀游戏流程（5/9/12人）

⏳ **待完成**:
- WebSocket实时观战系统
- 数据库持久化

## 快速测试

### 1. 激活虚拟环境

项目已配置Python虚拟环境，所有依赖已安装。

**Windows (Git Bash)**:
```bash
cd backend
source venv/Scripts/activate
```

**Windows (命令提示符)**:
```cmd
cd backend
venv\Scripts\activate.bat
```

**Windows (PowerShell)**:
```powershell
cd backend
venv\Scripts\Activate.ps1
```

**Linux/Mac**:
```bash
cd backend
source venv/bin/activate
```

激活成功后，命令提示符前会显示 `(venv)`。

**退出虚拟环境**:
```bash
deactivate
```

### 2. 配置环境变量

```bash
# 复制配置文件
cp .env.example .env

# 编辑.env文件，添加OpenAI API Key
# OPENAI_API_KEY=your-key-here
```

### 3. 运行测试游戏

```bash
# 确保虚拟环境已激活（命令提示符前显示(venv)）
python tests/test_game.py
```

**注意**: 如果虚拟环境未激活，请先执行步骤1。

### 预期输出

```
🎮 AI Arena - 狼人杀游戏测试
==================================================

📝 初始化游戏...

🚀 开始游戏...

=== 第1轮 - 夜晚 ===
  AI-1: kill -> AI-3
  AI-2: investigate -> AI-1

=== 第1轮 - 白天 ===
  AI-1: speak -> None
  AI-2: speak -> None
  AI-4: speak -> None
  AI-5: speak -> None

=== 第1轮 - 投票 ===
  AI-1: vote -> AI-2
  AI-2: vote -> AI-1
  AI-4: vote -> AI-1
  AI-5: vote -> AI-1

... (游戏继续)

==================================================
🏆 游戏结束！
获胜方: good
结束轮次: 2
原因: all_werewolves_eliminated
耗时: 15.34秒

💰 总成本: $0.0245

📊 Token使用情况:
  AI-1: 1243 tokens ($0.0049)
  AI-2: 1189 tokens ($0.0047)
  AI-3: 856 tokens ($0.0034)
  AI-4: 1102 tokens ($0.0044)
  AI-5: 1095 tokens ($0.0043)
```

## 验证功能

当前实现已验证：

✅ **游戏规则**:
- 角色随机分配（可用seed复现）
- 夜晚：狼人杀人、预言家查验
- 白天：所有人发言
- 投票：放逐玩家
- 胜利条件判定

✅ **信息过滤**:
- 狼人不知道预言家查验结果
- 预言家不知道狼人杀人目标
- 村民只看到公开信息

✅ **动作验证**:
- 村民不能执行查验动作
- 死亡玩家不能行动
- 只能对存活玩家投票

✅ **AI推理**:
- 理解角色身份
- 根据游戏状态做决策
- 生成合理的发言内容
- 投票选择有逻辑依据

## 调试技巧

### 查看详细日志

在 `tests/test_game.py` 中添加：

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### 固定角色分配（调试）

修改 `app/core/werewolf.py` 的 `initialize` 方法，注释掉 `random.shuffle(roles)`

### 查看AI的内部推理

在 `app/core/orchestrator.py` 的 `_agent_act` 方法中添加：

```python
print(f"    推理: {action.parameters.get('reasoning', '')}")
```

## 已知问题

- ⚠️ 如果AI生成的JSON格式错误，会降级为随机选择动作
- ⚠️ 目前没有实现超时机制，AI响应慢时会阻塞
- ⚠️ 内存系统较简单，只保留事件列表

## 下一步

- [ ] 实现WebSocket服务器
- [ ] 添加数据库持久化
- [ ] 优化AI推理质量

## 问题反馈

如有问题，请检查：
1. OpenAI API Key是否正确配置
2. 网络连接是否正常
3. Python版本是否 >= 3.11
4. 依赖是否完整安装
