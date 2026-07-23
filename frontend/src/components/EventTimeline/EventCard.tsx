import { useState } from 'react';
import type { GameEvent } from '../../types/api';
import ReasoningPanel from './ReasoningPanel';

interface Props {
  event: GameEvent;
  index: number;
  isNew?: boolean;
}

export default function EventCard({ event, index, isNew = false }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { event_type, data, visibility, visible_to, timestamp } = event;
  const hasReasoning = data.reasoning && data.reasoning.trim().length > 0;

  // 格式化时间
  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 获取事件图标和颜色
  const getEventStyle = (type: string) => {
    const styles: Record<string, { icon: string; color: string; bgColor: string; borderColor: string }> = {
      werewolf_kill: {
        icon: '🗡️',
        color: 'text-red-400',
        bgColor: 'bg-red-900/20',
        borderColor: 'border-red-500/50',
      },
      seer_investigate: {
        icon: '🔮',
        color: 'text-purple-400',
        bgColor: 'bg-purple-900/20',
        borderColor: 'border-purple-500/50',
      },
      player_speech: {
        icon: '💬',
        color: 'text-blue-400',
        bgColor: 'bg-blue-900/20',
        borderColor: 'border-blue-500/50',
      },
      player_vote: {
        icon: '🗳️',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-900/20',
        borderColor: 'border-yellow-500/50',
      },
      vote_result: {
        icon: '📊',
        color: 'text-green-400',
        bgColor: 'bg-green-900/20',
        borderColor: 'border-green-500/50',
      },
      player_death: {
        icon: '💀',
        color: 'text-red-500',
        bgColor: 'bg-red-900/30',
        borderColor: 'border-red-600/60',
      },
      phase_change: {
        icon: '⏰',
        color: 'text-gray-400',
        bgColor: 'bg-gray-800/30',
        borderColor: 'border-gray-600/50',
      },
      game_start: {
        icon: '🎮',
        color: 'text-green-400',
        bgColor: 'bg-green-900/20',
        borderColor: 'border-green-500/50',
      },
      game_end: {
        icon: '🏁',
        color: 'text-purple-400',
        bgColor: 'bg-purple-900/20',
        borderColor: 'border-purple-500/50',
      },
    };
    return styles[type] || styles.phase_change;
  };

  const style = getEventStyle(event_type);

  // 渲染事件标题
  const renderTitle = () => {
    switch (event_type) {
      case 'werewolf_kill':
        return <span>狼人选择击杀 <strong className="text-white">{data.target}</strong></span>;
      case 'seer_investigate':
        return <span>预言家查验 <strong className="text-white">{data.target}</strong> → {data.result}</span>;
      case 'player_speech':
        return <span><strong className="text-white">{data.speaker}</strong> 发言</span>;
      case 'player_vote':
        return <span><strong className="text-white">{data.voter}</strong> 投票给 <strong className="text-white">{data.target}</strong></span>;
      case 'vote_result':
        return data.result === 'eliminated'
          ? <span><strong className="text-white">{data.eliminated}</strong> 被放逐</span>
          : <span>平票，无人出局</span>;
      case 'player_death':
        return <span><strong className="text-white">{data.player}</strong> 死亡</span>;
      case 'phase_change':
        return <span>阶段变更：{data.from} → {data.to}</span>;
      case 'game_start':
        return <span>游戏开始</span>;
      case 'game_end':
        return <span>游戏结束 - {data.winner} 阵营胜利</span>;
      default:
        return <span>{event_type}</span>;
    }
  };

  // 渲染事件内容
  const renderContent = () => {
    if (event_type === 'player_speech' && data.content) {
      return (
        <div className="mt-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
          <p className="text-gray-300 text-sm leading-relaxed">{data.content}</p>
          {data.claim_role && data.claim_role !== 'none' && (
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-500/30 rounded text-xs text-purple-300">
              <span>💼</span>
              <span>跳身份：{data.claim_role}</span>
            </div>
          )}
        </div>
      );
    }

    if (event_type === 'player_vote' && data.reasoning) {
      return (
        <div className="mt-2 text-sm text-gray-400">
          <span className="text-gray-500">理由：</span>{data.reasoning}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`group relative animate-fade-in-up ${isNew ? 'animate-pulse-once' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* 主卡片容器 */}
      <div
        className={`
          relative bg-gray-800/60 backdrop-blur-sm rounded-xl border ${style.borderColor}
          transition-all duration-200 ease-out
          hover:bg-gray-800 hover:shadow-lg hover:translate-x-1
          ${isNew ? style.bgColor : ''}
        `}
      >
        {/* 内容区域 */}
        <div className="p-4">
          {/* 头部：图标 + 标题 + 时间 + 按钮 */}
          <div className="flex items-start gap-3">
            {/* 图标 */}
            <div className={`
              flex-shrink-0 w-10 h-10 rounded-lg ${style.bgColor} ${style.borderColor}
              flex items-center justify-center text-xl border
              transition-transform duration-200 group-hover:scale-110
            `}>
              {style.icon}
            </div>

            {/* 主要内容 */}
            <div className="flex-1 min-w-0">
              {/* 标题行 */}
              <div className="flex items-start justify-between gap-2">
                <div className={`text-sm font-medium ${style.color}`}>
                  {renderTitle()}
                </div>

                {/* 时间戳 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500 font-mono">
                    {formatTime(timestamp)}
                  </span>

                  {/* 展开按钮 */}
                  {hasReasoning && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className={`
                        px-2 py-1 rounded text-xs font-medium
                        transition-all duration-200
                        ${isExpanded
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }
                      `}
                    >
                      {isExpanded ? '收起' : '💭 查看推理'}
                    </button>
                  )}
                </div>
              </div>

              {/* 事件内容 */}
              {renderContent()}

              {/* AI 推理面板 */}
              {hasReasoning && (
                <ReasoningPanel
                  reasoning={data.reasoning}
                  isExpanded={isExpanded}
                  playerName={data.killer || data.seer || data.voter}
                />
              )}

              {/* 可见性标签 */}
              {visibility === 'private' && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-red-900/30 border border-red-500/30 rounded text-xs text-red-300">
                  <span>🔒</span>
                  <span>私密信息</span>
                  {visible_to.length > 0 && (
                    <span className="text-red-400/60">· 可见：{visible_to.join(', ')}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hover 发光效果 */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
      </div>
    </div>
  );
}
