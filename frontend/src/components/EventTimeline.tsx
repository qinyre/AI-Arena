import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { GameEvent } from '../types/api';

interface Props {
  gameId: string;
}

export default function EventTimeline({ gameId }: Props) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadEvents();
    // 轮询更新（游戏运行中）
    const interval = setInterval(loadEvents, 3000);
    return () => clearInterval(interval);
  }, [gameId]);

  const loadEvents = async () => {
    try {
      const data = await apiClient.getGameEvents(gameId);
      setEvents(data.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载事件失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEvents(newExpanded);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  };

  const getEventIcon = (eventType: string) => {
    const icons: Record<string, string> = {
      game_start: '🎮',
      werewolf_kill: '🔪',
      seer_investigate: '🔮',
      player_speech: '💬',
      player_vote: '🗳️',
      vote_result: '📊',
      player_death: '💀',
      phase_change: '⏰',
      game_end: '🏁',
    };
    return icons[eventType] || '📝';
  };

  const getEventColor = (eventType: string) => {
    const colors: Record<string, string> = {
      werewolf_kill: 'border-red-700 bg-red-900/30',
      seer_investigate: 'border-purple-700 bg-purple-900/30',
      player_speech: 'border-blue-700 bg-blue-900/30',
      player_vote: 'border-yellow-700 bg-yellow-900/30',
      vote_result: 'border-green-700 bg-green-900/30',
      player_death: 'border-red-700 bg-red-900/50',
      phase_change: 'border-gray-700 bg-gray-800',
      game_start: 'border-green-700 bg-green-900/30',
      game_end: 'border-purple-700 bg-purple-900/30',
    };
    return colors[eventType] || 'border-gray-700 bg-gray-800';
  };

  const renderEventContent = (event: GameEvent, index: number) => {
    const { event_type, data } = event;
    const isExpanded = expandedEvents.has(index);

    // 通用渲染函数
    const renderSimple = (title: string, details?: React.ReactNode) => (
      <div>
        <div className="font-medium">{title}</div>
        {details && <div className="text-sm text-gray-400 mt-1">{details}</div>}
      </div>
    );

    switch (event_type) {
      case 'game_start':
        return renderSimple('游戏开始', `玩家: ${data.players?.join(', ')}`);

      case 'werewolf_kill':
        return (
          <div>
            <div className="font-medium">狼人击杀</div>
            <div className="text-sm text-gray-400 mt-1">
              目标: {data.target}
            </div>
            {data.reasoning && isExpanded && (
              <div className="mt-2 p-2 bg-gray-900/50 rounded text-sm">
                <span className="text-yellow-400">💭 推理: </span>
                {data.reasoning}
              </div>
            )}
          </div>
        );

      case 'seer_investigate':
        return (
          <div>
            <div className="font-medium">预言家查验</div>
            <div className="text-sm text-gray-400 mt-1">
              查验: {data.target} → {data.result}
            </div>
            {data.reasoning && isExpanded && (
              <div className="mt-2 p-2 bg-gray-900/50 rounded text-sm">
                <span className="text-yellow-400">💭 推理: </span>
                {data.reasoning}
              </div>
            )}
          </div>
        );

      case 'player_speech':
        return (
          <div>
            <div className="font-medium">{data.speaker} 发言</div>
            <div className="mt-1 p-2 bg-gray-900/50 rounded text-sm">
              {data.content}
            </div>
            {data.claim_role && data.claim_role !== 'none' && (
              <div className="text-xs text-purple-400 mt-1">
                跳身份: {data.claim_role}
              </div>
            )}
          </div>
        );

      case 'player_vote':
        return (
          <div>
            <div className="font-medium">{data.voter} 投票给 {data.target}</div>
            {data.reasoning && (
              <div className="text-sm text-gray-400 mt-1">
                理由: {data.reasoning}
              </div>
            )}
          </div>
        );

      case 'vote_result':
        if (data.result === 'eliminated') {
          return renderSimple(`${data.eliminated} 被放逐`);
        } else if (data.result === 'tie') {
          return renderSimple('平票，无人出局', `得票: ${JSON.stringify(data.votes)}`);
        }
        return renderSimple('投票结果', JSON.stringify(data));

      case 'player_death':
        return renderSimple(
          `${data.player} 死亡`,
          `原因: ${data.cause || '未知'} (第${data.round}轮)`
        );

      case 'phase_change':
        return renderSimple(`阶段变更`, `${data.from} → ${data.to}`);

      case 'game_end':
        return renderSimple(`游戏结束`, `${data.winner} 阵营胜利`);

      default:
        return renderSimple(event_type, JSON.stringify(data));
    }
  };

  if (loading && events.length === 0) {
    return (
      <div className="card text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
        <p className="text-gray-400">加载事件流...</p>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="card">
        <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg">
          <strong>提示:</strong> {error}
          <p className="text-sm mt-1">游戏完成后才会生成事件流</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">事件时间线</h3>
        <span className="text-sm text-gray-400">共 {events.length} 条事件</span>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {events.map((event, index) => {
          const hasReasoning = event.data.reasoning;
          const isExpanded = expandedEvents.has(index);

          return (
            <div
              key={index}
              className={`border rounded-lg p-3 transition-all ${getEventColor(event.event_type)}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{getEventIcon(event.event_type)}</span>
                <div className="flex-1 min-w-0">
                  {renderEventContent(event, index)}

                  {/* 可见性标签 */}
                  {event.visibility === 'private' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded">
                        🔒 私密
                      </span>
                      {event.visible_to.length > 0 && (
                        <span className="text-xs text-gray-500">
                          可见: {event.visible_to.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  {hasReasoning && (
                    <button
                      onClick={() => toggleExpand(index)}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                    >
                      {isExpanded ? '收起' : '查看推理'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
