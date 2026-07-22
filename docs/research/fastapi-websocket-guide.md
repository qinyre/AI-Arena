# FastAPI WebSocket实时通信技术参考

**整理日期**: 2026-07-23  
**用途**: AI Arena实时观战系统实现参考

---

## 1. FastAPI WebSocket基础

### 1.1 基本WebSocket端点

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import List
import json

app = FastAPI()

class ConnectionManager:
    """WebSocket连接管理器"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        """接受新连接"""
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """断开连接"""
        self.active_connections.remove(websocket)
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        """发送个人消息"""
        await websocket.send_text(message)
    
    async def broadcast(self, message: str):
        """广播消息给所有连接"""
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket端点"""
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"Client says: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"Client left")
```

---

## 2. 游戏观战系统设计

### 2.1 游戏房间管理

```python
from typing import Dict, Set
from dataclasses import dataclass
from enum import Enum

class SpectatorRole(Enum):
    """观众角色"""
    ADMIN = "admin"           # 管理员，看到所有信息
    SPECTATOR = "spectator"   # 普通观众，看到公开信息
    PLAYER = "player"         # 玩家视角，看到角色允许的信息

@dataclass
class SpectatorInfo:
    """观众信息"""
    websocket: WebSocket
    user_id: str
    role: SpectatorRole
    player_id: str = None  # 如果是玩家视角，对应的player_id

class GameRoom:
    """游戏房间"""
    
    def __init__(self, game_id: str):
        self.game_id = game_id
        self.spectators: Dict[str, SpectatorInfo] = {}
        self.game_state = {}
    
    async def add_spectator(
        self,
        websocket: WebSocket,
        user_id: str,
        role: SpectatorRole = SpectatorRole.SPECTATOR,
        player_id: str = None
    ):
        """添加观众"""
        await websocket.accept()
        
        spectator = SpectatorInfo(
            websocket=websocket,
            user_id=user_id,
            role=role,
            player_id=player_id
        )
        self.spectators[user_id] = spectator
        
        # 发送当前游戏状态
        await self.send_game_state(spectator)
    
    def remove_spectator(self, user_id: str):
        """移除观众"""
        if user_id in self.spectators:
            del self.spectators[user_id]
    
    async def send_game_state(self, spectator: SpectatorInfo):
        """发送游戏状态"""
        # 根据观众角色过滤信息
        visible_state = self.filter_state_by_role(
            self.game_state,
            spectator.role,
            spectator.player_id
        )
        
        await spectator.websocket.send_json({
            "type": "game_state",
            "data": visible_state
        })
    
    async def broadcast_event(self, event: Dict):
        """广播游戏事件"""
        for spectator in self.spectators.values():
            # 根据角色过滤事件内容
            filtered_event = self.filter_event_by_role(
                event,
                spectator.role,
                spectator.player_id
            )
            
            if filtered_event:  # 如果有可见内容
                try:
                    await spectator.websocket.send_json({
                        "type": "game_event",
                        "data": filtered_event
                    })
                except:
                    # 连接断开，稍后清理
                    pass
    
    def filter_state_by_role(
        self,
        state: Dict,
        role: SpectatorRole,
        player_id: str = None
    ) -> Dict:
        """根据角色过滤游戏状态"""
        
        if role == SpectatorRole.ADMIN:
            # 管理员看到所有信息
            return state
        
        elif role == SpectatorRole.PLAYER:
            # 玩家只看到自己角色允许的信息
            return get_visible_state(player_id, state)
        
        else:  # SPECTATOR
            # 普通观众只看到公开信息
            return {
                "phase": state.get("phase"),
                "round": state.get("round"),
                "alive_players": state.get("alive_players"),
                "dead_players": state.get("dead_players"),
                "public_events": state.get("public_events")
            }
    
    def filter_event_by_role(
        self,
        event: Dict,
        role: SpectatorRole,
        player_id: str = None
    ) -> Dict:
        """根据角色过滤事件"""
        
        # 公开事件所有人都能看到
        if event.get("visibility") == "public":
            return event
        
        # 私密事件只有管理员和相关玩家能看到
        if event.get("visibility") == "private":
            if role == SpectatorRole.ADMIN:
                return event
            elif role == SpectatorRole.PLAYER:
                if player_id in event.get("visible_to", []):
                    return event
            return None
        
        return event

class GameRoomManager:
    """游戏房间管理器"""
    
    def __init__(self):
        self.rooms: Dict[str, GameRoom] = {}
    
    def get_or_create_room(self, game_id: str) -> GameRoom:
        """获取或创建房间"""
        if game_id not in self.rooms:
            self.rooms[game_id] = GameRoom(game_id)
        return self.rooms[game_id]
    
    def remove_room(self, game_id: str):
        """删除房间"""
        if game_id in self.rooms:
            del self.rooms[game_id]

# 全局房间管理器
room_manager = GameRoomManager()
```

### 2.2 WebSocket路由

```python
@app.websocket("/ws/game/{game_id}")
async def game_websocket(
    websocket: WebSocket,
    game_id: str,
    user_id: str = None,
    role: str = "spectator",
    player_id: str = None
):
    """游戏观战WebSocket"""
    
    room = room_manager.get_or_create_room(game_id)
    
    try:
        await room.add_spectator(
            websocket=websocket,
            user_id=user_id or f"anon_{id(websocket)}",
            role=SpectatorRole(role),
            player_id=player_id
        )
        
        # 保持连接
        while True:
            # 接收客户端消息（心跳、控制命令等）
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "ping":
                await websocket.send_json({"type": "pong"})
            
            elif message["type"] == "request_state":
                # 请求当前游戏状态
                spectator = room.spectators.get(user_id)
                if spectator:
                    await room.send_game_state(spectator)
    
    except WebSocketDisconnect:
        room.remove_spectator(user_id)
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        room.remove_spectator(user_id)
```

---

## 3. 事件系统

### 3.1 事件总线

```python
from asyncio import Queue
from typing import Callable, List
import asyncio

class EventBus:
    """事件总线"""
    
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}
        self.event_queue = Queue()
    
    def subscribe(self, event_type: str, handler: Callable):
        """订阅事件"""
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)
    
    def unsubscribe(self, event_type: str, handler: Callable):
        """取消订阅"""
        if event_type in self.subscribers:
            self.subscribers[event_type].remove(handler)
    
    async def publish(self, event_type: str, data: Dict):
        """发布事件"""
        event = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        await self.event_queue.put(event)
    
    async def process_events(self):
        """处理事件队列"""
        while True:
            event = await self.event_queue.get()
            
            # 调用所有订阅者
            handlers = self.subscribers.get(event["type"], [])
            for handler in handlers:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(event)
                    else:
                        handler(event)
                except Exception as e:
                    print(f"Event handler error: {e}")
            
            self.event_queue.task_done()

# 全局事件总线
event_bus = EventBus()

# 启动事件处理
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(event_bus.process_events())
```

### 3.2 游戏事件订阅

```python
# 订阅游戏事件，转发到WebSocket
async def forward_to_websocket(event: Dict):
    """将游戏事件转发到WebSocket"""
    game_id = event["data"].get("game_id")
    if game_id:
        room = room_manager.rooms.get(game_id)
        if room:
            await room.broadcast_event(event)

# 订阅各种游戏事件
event_bus.subscribe("game_start", forward_to_websocket)
event_bus.subscribe("phase_change", forward_to_websocket)
event_bus.subscribe("player_action", forward_to_websocket)
event_bus.subscribe("player_death", forward_to_websocket)
event_bus.subscribe("game_end", forward_to_websocket)
```

### 3.3 游戏引擎集成

```python
class GameOrchestrator:
    """游戏编排器"""
    
    def __init__(self, game_id: str):
        self.game_id = game_id
        self.game = None
        self.event_bus = event_bus
    
    async def emit_event(self, event_type: str, data: Dict):
        """发出游戏事件"""
        data["game_id"] = self.game_id
        await self.event_bus.publish(event_type, data)
    
    async def start_game(self):
        """开始游戏"""
        await self.emit_event("game_start", {
            "players": self.game.players,
            "roles": self.game.role_assignments
        })
        
        while not self.game.is_ended():
            # 执行游戏循环
            await self.execute_round()
        
        await self.emit_event("game_end", {
            "winner": self.game.winner,
            "summary": self.game.get_summary()
        })
    
    async def execute_round(self):
        """执行一轮游戏"""
        
        # 夜晚阶段
        await self.emit_event("phase_change", {
            "phase": "night",
            "round": self.game.round
        })
        
        await self.execute_night_phase()
        
        # 白天阶段
        await self.emit_event("phase_change", {
            "phase": "day",
            "round": self.game.round
        })
        
        await self.execute_day_phase()
    
    async def execute_night_phase(self):
        """执行夜晚阶段"""
        # 狼人行动
        for player in self.game.get_werewolves():
            action = await player.agent.decide(
                self.game.get_visible_state(player.id),
                self.game.get_available_actions(player.id)
            )
            
            result = self.game.apply_action(action)
            
            # 私密事件（只有狼人看到）
            await self.emit_event("player_action", {
                "visibility": "private",
                "visible_to": [player.id],
                "actor": player.id,
                "action": action.type,
                "target": action.target
            })
        
        # 预言家行动
        # ...
    
    async def execute_day_phase(self):
        """执行白天阶段"""
        # 公布死讯
        deaths = self.game.get_last_night_deaths()
        if deaths:
            await self.emit_event("player_death", {
                "visibility": "public",
                "deaths": deaths
            })
        
        # 发言
        for player in self.game.get_alive_players():
            speech = await player.agent.speak(
                self.game.get_visible_state(player.id)
            )
            
            await self.emit_event("player_speech", {
                "visibility": "public",
                "speaker": player.id,
                "content": speech
            })
        
        # 投票
        # ...
```

---

## 4. 前端WebSocket集成

### 4.1 React Hook

```typescript
// useWebSocket.ts
import { useEffect, useRef, useState } from 'react';

interface GameEvent {
  type: string;
  data: any;
  timestamp: string;
}

export const useGameWebSocket = (gameId: string) => {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [gameState, setGameState] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  
  useEffect(() => {
    // 连接WebSocket
    const wsUrl = `ws://localhost:8000/ws/game/${gameId}`;
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // 发送心跳
      const heartbeat = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      
      return () => clearInterval(heartbeat);
    };
    
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'game_state') {
        setGameState(message.data);
      } else if (message.type === 'game_event') {
        setEvents(prev => [...prev, message.data]);
      }
    };
    
    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    // 清理
    return () => {
      ws.current?.close();
    };
  }, [gameId]);
  
  const sendMessage = (message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };
  
  return { events, gameState, isConnected, sendMessage };
};
```

### 4.2 React组件

```typescript
// GameViewer.tsx
import React from 'react';
import { useGameWebSocket } from './useWebSocket';

export const GameViewer: React.FC<{ gameId: string }> = ({ gameId }) => {
  const { events, gameState, isConnected } = useGameWebSocket(gameId);
  
  if (!isConnected) {
    return <div>连接中...</div>;
  }
  
  return (
    <div className="game-viewer">
      <div className="game-status">
        <h2>游戏状态</h2>
        <div>回合: {gameState?.round}</div>
        <div>阶段: {gameState?.phase}</div>
        <div>存活: {gameState?.alive_players?.join(', ')}</div>
      </div>
      
      <div className="event-stream">
        <h2>事件流</h2>
        {events.map((event, index) => (
          <div key={index} className="event">
            <span className="timestamp">{event.timestamp}</span>
            <span className="type">{event.type}</span>
            <span className="content">{formatEvent(event)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatEvent(event: GameEvent): string {
  switch (event.data.type) {
    case 'player_death':
      return `${event.data.deaths.join(', ')} 死亡`;
    case 'player_speech':
      return `${event.data.speaker}: ${event.data.content}`;
    case 'player_vote':
      return `${event.data.voter} 投票给 ${event.data.target}`;
    default:
      return JSON.stringify(event.data);
  }
}
```

---

## 5. 性能优化

### 5.1 事件节流

```python
from collections import deque
import time

class ThrottledEventBroadcaster:
    """节流事件广播器"""
    
    def __init__(self, max_events_per_second: int = 10):
        self.max_events_per_second = max_events_per_second
        self.event_buffer = deque()
        self.last_broadcast = time.time()
    
    async def broadcast(self, room: GameRoom, event: Dict):
        """节流广播"""
        self.event_buffer.append(event)
        
        current_time = time.time()
        time_since_last = current_time - self.last_broadcast
        
        # 如果距离上次广播已经过了足够时间
        if time_since_last >= (1.0 / self.max_events_per_second):
            # 批量发送缓冲的事件
            while self.event_buffer:
                event = self.event_buffer.popleft()
                await room.broadcast_event(event)
            
            self.last_broadcast = current_time
```

### 5.2 连接管理

```python
class RobustConnectionManager:
    """健壮的连接管理器"""
    
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.heartbeat_task = None
    
    async def start_heartbeat(self):
        """启动心跳检测"""
        while True:
            await asyncio.sleep(30)
            
            # 检查所有连接
            dead_connections = []
            for user_id, ws in self.connections.items():
                try:
                    await ws.send_json({"type": "ping"})
                except:
                    dead_connections.append(user_id)
            
            # 清理死连接
            for user_id in dead_connections:
                del self.connections[user_id]
    
    async def send_with_retry(
        self,
        ws: WebSocket,
        message: Dict,
        max_retries: int = 3
    ):
        """带重试的发送"""
        for attempt in range(max_retries):
            try:
                await ws.send_json(message)
                return True
            except:
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.1 * (attempt + 1))
                else:
                    return False
```

---

## 6. 安全考虑

### 6.1 认证和授权

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """验证JWT token"""
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.websocket("/ws/game/{game_id}")
async def authenticated_websocket(
    websocket: WebSocket,
    game_id: str,
    token: str = None
):
    """需要认证的WebSocket"""
    
    # 验证token
    try:
        user_id = await verify_token_ws(token)
    except:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # 正常处理
    # ...
```

### 6.2 速率限制

```python
from collections import defaultdict
import time

class RateLimiter:
    """速率限制器"""
    
    def __init__(self, max_requests: int = 10, window: int = 60):
        self.max_requests = max_requests
        self.window = window
        self.requests = defaultdict(deque)
    
    def is_allowed(self, user_id: str) -> bool:
        """检查是否允许请求"""
        now = time.time()
        
        # 清理过期请求
        user_requests = self.requests[user_id]
        while user_requests and user_requests[0] < now - self.window:
            user_requests.popleft()
        
        # 检查是否超过限制
        if len(user_requests) >= self.max_requests:
            return False
        
        # 记录新请求
        user_requests.append(now)
        return True

rate_limiter = RateLimiter()
```

---

## 7. 实现检查清单

MVP实现WebSocket观战系统时需要：

- [ ] 基础WebSocket端点
- [ ] 连接管理器
- [ ] 游戏房间系统
- [ ] 按角色过滤信息
- [ ] 事件总线
- [ ] 游戏引擎集成
- [ ] 心跳检测
- [ ] 断线重连处理
- [ ] 错误处理
- [ ] 前端WebSocket Hook
- [ ] 事件显示组件

---

**文档结束**

这些技术将用于实现AI Arena的实时观战系统。
