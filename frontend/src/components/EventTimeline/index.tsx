import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../api/client';
import type { GameEvent } from '../../types/api';
import EventCard from './EventCard';
import TimelineConnector from './TimelineConnector';

interface Props {
  gameId: string;
}

export default function EventTimeline({ gameId }: Props) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEventIndices, setNewEventIndices] = useState<Set<number>>(new Set());
  const previousCountRef = useRef(0);

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 3000);
    return () => clearInterval(interval);
  }, [gameId]);

  const loadEvents = async () => {
    try {
      const data = await apiClient.getGameEvents(gameId);

      // 检测新事件
      if (data.events.length > previousCountRef.current) {
        const newIndices = new Set<number>();
        for (let i = previousCountRef.current; i < data.events.length; i++) {
          newIndices.add(i);
        }
        setNewEventIndices(newIndices);

        // 3秒后移除"新"标记
        setTimeout(() => {
          setNewEventIndices(new Set());
        }, 3000);
      }

      previousCountRef.current = data.events.length;
      setEvents(data.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载事件失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载骨架屏
  if (loading && events.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-32 bg-gray-700 rounded animate-pulse"></div>
          <div className="h-5 w-24 bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-800/50 rounded-xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gray-700 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 错误状态
  if (error && events.length === 0) {
    return (
      <div className="card">
        <div className="bg-yellow-900/30 border border-yellow-500/50 text-yellow-200 px-4 py-4 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <strong className="font-semibold">提示</strong>
              <p className="text-sm mt-1">{error}</p>
              <p className="text-sm text-yellow-300/60 mt-1">游戏完成后才会生成事件流</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card relative">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            事件时间线
          </h3>
          <p className="text-sm text-gray-400 mt-1">观看 AI 思考、决策和博弈的全过程</p>
        </div>

        {/* 事件计数器 */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <span className="text-sm font-medium text-blue-400">
              {events.length} 条事件
            </span>
          </div>

          {/* 实时更新指示器 */}
          {loading && events.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-500/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-xs text-green-400">实时更新中</span>
            </div>
          )}
        </div>
      </div>

      {/* 时间线内容 */}
      {events.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 border border-gray-700 mb-4">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-400">游戏尚未开始，暂无事件</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[700px] overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {events.map((event, index) => (
            <div key={index} className="relative group">
              {/* 时间线连接器 */}
              <TimelineConnector
                isFirst={index === 0}
                isLast={index === events.length - 1}
              />

              {/* 事件卡片 */}
              <EventCard
                event={event}
                index={index}
                isNew={newEventIndices.has(index)}
              />
            </div>
          ))}
        </div>
      )}

      {/* 滚动提示 */}
      {events.length > 10 && (
        <div className="absolute bottom-4 right-4 pointer-events-none">
          <div className="px-3 py-1.5 bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg">
            <span className="text-xs text-gray-400">滚动查看更多</span>
          </div>
        </div>
      )}
    </div>
  );
}
