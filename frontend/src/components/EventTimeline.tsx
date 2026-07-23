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
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

  useEffect(() => {
    loadEvents();
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
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // 事件类型配置 - 现代化风格
  const getEventConfig = (eventType: string) => {
    const configs: Record<string, {
      icon: string;
      iconBg: string;
      borderColor: string;
      bgGradient: string;
      glowColor: string;
      label: string;
    }> = {
      game_start: {
        icon: '🎮',
        iconBg: 'bg-gradient-to-br from-green-500 to-emerald-600',
        borderColor: 'border-green-500/30',
        bgGradient: 'bg-gradient-to-br from-green-950/40 to-emerald-950/20',
        glowColor: 'shadow-green-500/10',
        label: '游戏开始'
      },
      werewolf_kill: {
        icon: '🔪',
        iconBg: 'bg-gradient-to-br from-red-500 to-rose-600',
        borderColor: 'border-red-500/30',
        bgGradient: 'bg-gradient-to-br from-red-950/40 to-rose-950/20',
        glowColor: 'shadow-red-500/10',
        label: '狼人击杀'
      },
      seer_investigate: {
        icon: '🔮',
        iconBg: 'bg-gradient-to-br from-purple-500 to-violet-600',
        borderColor: 'border-purple-500/30',
        bgGradient: 'bg-gradient-to-br from-purple-950/40 to-violet-950/20',
        glowColor: 'shadow-purple-500/10',
        label: '预言家查验'
      },
      player_speech: {
        icon: '💬',
        iconBg: 'bg-gradient-to-br from-blue-500 to-cyan-600',
        borderColor: 'border-blue-500/30',
        bgGradient: 'bg-gradient-to-br from-blue-950/40 to-cyan-950/20',
        glowColor: 'shadow-blue-500/10',
        label: '玩家发言'
      },
      player_vote: {
        icon: '🗳️',
        iconBg: 'bg-gradient-to-br from-yellow-500 to-amber-600',
        borderColor: 'border-yellow-500/30',
        bgGradient: 'bg-gradient-to-br from-yellow-950/40 to-amber-950/20',
        glowColor: 'shadow-yellow-500/10',
        label: '投票'
      },
      vote_result: {
        icon: '📊',
        iconBg: 'bg-gradient-to-br from-green-500 to-teal-600',
        borderColor: 'border-green-500/30',
        bgGradient: 'bg-gradient-to-br from-green-950/40 to-teal-950/20',
        glowColor: 'shadow-green-500/10',
        label: '投票结果'
      },
      player_death: {
        icon: '💀',
        iconBg: 'bg-gradient-to-br from-gray-500 to-slate-600',
        borderColor: 'border-gray-500/30',
        bgGradient: 'bg-gradient-to-br from-gray-950/60 to-slate-950/30',
        glowColor: 'shadow-gray-500/10',
        label: '玩家死亡'
      },
      phase_change: {
        icon: '⏰',
        iconBg: 'bg-gradient-to-br from-indigo-500 to-blue-600',
        borderColor: 'border-indigo-500/30',
        bgGradient: 'bg-gradient-to-br from-indigo-950/40 to-blue-950/20',
        glowColor: 'shadow-indigo-500/10',
        label: '阶段切换'
      },
      game_end: {
        icon: '🏁',
        iconBg: 'bg-gradient-to-br from-purple-500 to-pink-600',
        borderColor: 'border-purple-500/30',
        bgGradient: 'bg-gradient-to-br from-purple-950/40 to-pink-950/20',
        glowColor: 'shadow-purple-500/10',
        label: '游戏结束'
      }
    };
    return configs[eventType] || {
      icon: '📝',
      iconBg: 'bg-gradient-to-br from-gray-500 to-slate-600',
      borderColor: 'border-gray-500/30',
      bgGradient: 'bg-gradient-to-br from-gray-950/40 to-slate-950/20',
      glowColor: 'shadow-gray-500/10',
      label: '事件'
    };
  };

  // AI 推理展示组件 - 代码编辑器风格
  const AIReasoningBlock = ({ reasoning, isExpanded }: { reasoning: string; isExpanded: boolean }) => {
    if (!isExpanded) return null;

    return (
      <div className="mt-4 overflow-hidden rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-yellow-950/20 backdrop-blur-sm">
        {/* 头部 - 类似 VS Code */}
        <div className="flex items-center gap-2 border-b border-amber-500/10 bg-amber-950/20 px-4 py-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/60"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500/60"></div>
            <div className="h-3 w-3 rounded-full bg-green-500/60"></div>
          </div>
          <span className="text-xs font-mono text-amber-300/70">AI 推理过程</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-amber-400/50">reasoning.txt</span>
          </div>
        </div>

        {/* 内容区 - 代码风格 */}
        <div className="relative">
          {/* 行号 */}
          <div className="absolute left-0 top-0 bottom-0 w-12 border-r border-amber-500/10 bg-amber-950/30 px-2 py-3 text-right">
            {reasoning.split('\n').map((_, i) => (
              <div key={i} className="font-mono text-xs leading-6 text-amber-400/30">
                {i + 1}
              </div>
            ))}
          </div>

          {/* 推理内容 */}
          <div className="pl-14 pr-4 py-3">
            <pre className="font-mono text-sm leading-6 text-amber-100/90 whitespace-pre-wrap">
              {reasoning}
            </pre>
          </div>

          {/* 光效 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-400/5 to-transparent"></div>
        </div>
      </div>
    );
  };

  // 渲染事件内容
  const renderEventContent = (event: GameEvent, index: number) => {
    const { event_type, data } = event;
    const isExpanded = expandedEvents.has(index);

    switch (event_type) {
      case 'game_start':
        return (
          <div className="space-y-2">
            <div className="text-base font-semibold text-gray-100">游戏开始</div>
            {data.players && (
              <div className="flex flex-wrap gap-2">
                {data.players.map((player: string) => (
                  <span key={player} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-300 border border-green-500/20">
                    {player}
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      case 'werewolf_kill':
        return (
          <div className="space-y-3">
            <div className="text-base font-semibold text-gray-100">狼人击杀</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">目标:</span>
              <span className="px-3 py-1 rounded-lg bg-red-500/10 text-red-300 font-medium border border-red-500/20">
                {data.target}
              </span>
            </div>
            {data.reasoning && <AIReasoningBlock reasoning={data.reasoning} isExpanded={isExpanded} />}
          </div>
        );

      case 'seer_investigate':
        return (
          <div className="space-y-3">
            <div className="text-base font-semibold text-gray-100">预言家查验</div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-lg bg-purple-500/10 text-purple-300 font-medium border border-purple-500/20">
                {data.target}
              </span>
              <span className="text-gray-500">→</span>
              <span className={`px-3 py-1 rounded-lg font-medium border ${
                data.result === '好人'
                  ? 'bg-green-500/10 text-green-300 border-green-500/20'
                  : 'bg-red-500/10 text-red-300 border-red-500/20'
              }`}>
                {data.result}
              </span>
            </div>
            {data.reasoning && <AIReasoningBlock reasoning={data.reasoning} isExpanded={isExpanded} />}
          </div>
        );

      case 'player_speech':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-100">{data.speaker}</span>
              <span className="text-sm text-gray-500">发言</span>
            </div>

            {/* 发言内容 - 气泡样式 */}
            <div className="relative pl-4 border-l-2 border-blue-500/30">
              <div className="text-sm text-gray-200 leading-relaxed">
                {data.content}
              </div>
            </div>

            {data.claim_role && data.claim_role !== 'none' && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 text-xs font-medium border border-purple-500/20">
                <span>🎭</span>
                <span>跳身份: {data.claim_role}</span>
              </div>
            )}
          </div>
        );

      case 'player_vote':
        return (
          <div className="space-y-2">
            <div className="text-base text-gray-100">
              <span className="font-semibold">{data.voter}</span>
              <span className="text-gray-500 mx-2">投票给</span>
              <span className="font-semibold">{data.target}</span>
            </div>
            {data.reasoning && (
              <div className="text-sm text-gray-400 italic">
                💭 {data.reasoning}
              </div>
            )}
          </div>
        );

      case 'vote_result':
        if (data.result === 'eliminated') {
          return (
            <div className="space-y-2">
              <div className="text-base font-semibold text-gray-100">投票结果</div>
              <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-300 font-medium">{data.eliminated}</span>
                <span className="text-gray-400 ml-2">被放逐</span>
              </div>
            </div>
          );
        } else if (data.result === 'tie') {
          return (
            <div className="space-y-2">
              <div className="text-base font-semibold text-gray-100">平票</div>
              <div className="text-sm text-gray-400">无人出局</div>
            </div>
          );
        }
        return <div className="text-sm text-gray-300">{JSON.stringify(data)}</div>;

      case 'player_death':
        return (
          <div className="space-y-2">
            <div className="text-base text-gray-100">
              <span className="font-semibold">{data.player}</span>
              <span className="text-gray-500 ml-2">死亡</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">原因: {data.cause || '未知'}</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-500">第 {data.round} 轮</span>
            </div>
          </div>
        );

      case 'phase_change':
        return (
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 text-sm font-medium border border-indigo-500/20">
              {data.from}
            </span>
            <span className="text-gray-500">→</span>
            <span className="px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 text-sm font-medium border border-indigo-500/20">
              {data.to}
            </span>
          </div>
        );

      case 'game_end':
        return (
          <div className="space-y-2">
            <div className="text-base font-semibold text-gray-100">游戏结束</div>
            <div className="px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <span className={`font-medium ${
                data.winner === 'good' ? 'text-green-300' : 'text-red-300'
              }`}>
                {data.winner === 'good' ? '好人阵营' : '狼人阵营'}
              </span>
              <span className="text-gray-400 ml-2">获胜</span>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-gray-400">
            {event_type}: {JSON.stringify(data)}
          </div>
        );
    }
  };

  if (loading && events.length === 0) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-gray-700"></div>
            <div className="absolute top-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-blue-500"></div>
          </div>
          <p className="mt-4 text-sm text-gray-400">加载事件流...</p>
        </div>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="card">
        <div className="rounded-lg border border-yellow-500/30 bg-gradient-to-br from-yellow-950/30 to-amber-950/20 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-medium text-yellow-200">提示</p>
              <p className="text-sm text-yellow-300/80 mt-1">{error}</p>
              <p className="text-xs text-yellow-400/60 mt-2">游戏完成后才会生成事件流</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-100">事件时间线</h3>
          <p className="text-sm text-gray-500 mt-0.5">实时追踪 AI 决策过程</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 text-xs font-medium border border-blue-500/20">
            {events.length} 条事件
          </span>
        </div>
      </div>

      {/* 时间线容器 */}
      <div className="relative max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
        <div className="space-y-4">
          {events.map((event, index) => {
            const config = getEventConfig(event.event_type);
            const isExpanded = expandedEvents.has(index);
            const isHovered = hoveredEvent === index;
            const hasReasoning = event.data.reasoning;

            return (
              <div key={index} className="relative pl-8">
                {/* 垂直时间线 */}
                {index !== events.length - 1 && (
                  <div className="absolute left-[15px] top-12 bottom-0 w-px bg-gradient-to-b from-gray-700 to-transparent"></div>
                )}

                {/* 时间线节点 */}
                <div className={`absolute left-0 top-3 ${config.iconBg} ${config.glowColor} shadow-lg rounded-full p-2 text-sm transition-transform ${
                  isHovered ? 'scale-110' : 'scale-100'
                }`}>
                  {config.icon}
                </div>

                {/* 事件卡片 */}
                <div
                  onMouseEnter={() => setHoveredEvent(index)}
                  onMouseLeave={() => setHoveredEvent(null)}
                  className={`
                    relative overflow-hidden rounded-xl border transition-all duration-300
                    ${config.borderColor} ${config.bgGradient} ${config.glowColor}
                    ${isHovered ? 'shadow-xl scale-[1.01] border-opacity-50' : 'shadow-md'}
                  `}
                >
                  {/* 卡片内容 */}
                  <div className="p-4">
                    {/* 事件头部 */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        {renderEventContent(event, index)}
                      </div>

                      {/* 右侧操作区 */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="font-mono text-xs text-gray-500 whitespace-nowrap">
                          {formatTimestamp(event.timestamp)}
                        </span>
                        {hasReasoning && (
                          <button
                            onClick={() => toggleExpand(index)}
                            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 hover:border-amber-500/30 transition-all duration-200"
                          >
                            <span className="text-xs text-gray-400 group-hover:text-amber-300">
                              {isExpanded ? '收起推理' : '查看推理'}
                            </span>
                            <svg
                              className={`w-3 h-3 text-gray-400 group-hover:text-amber-300 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 可见性标签 */}
                    {event.visibility === 'private' && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/30">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 text-xs font-medium border border-red-500/20">
                          <span>🔒</span>
                          <span>私密</span>
                        </span>
                        {event.visible_to.length > 0 && (
                          <span className="text-xs text-gray-600">
                            可见: {event.visible_to.join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 悬停光效 */}
                  {isHovered && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
