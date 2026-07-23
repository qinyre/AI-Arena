/**
 * 结果面板：游戏结束后展示完整复盘。
 * 胜方、总成本、各玩家成本明细。
 */
import { cn } from '../../utils/cn';
import { getRoleConfig, avatarColor } from './roleConfig';
import type { GameResultResponse, GameStatusResponse } from '../../types/api';

interface Props {
  result: GameResultResponse | null;
  status: GameStatusResponse | null;
}

export default function ResultPanel({ result, status }: Props) {
  if (!result) return null;

  const winnerGood = result.winner === 'good';
  const roleAssignment = status?.role_assignment || {};

  return (
    <div className="card mt-4 animate-fade-in">
      <h3 className="text-lg font-bold mb-4 text-gray-100">🏁 对局复盘</h3>

      <div className="space-y-4">
        {/* 胜方 */}
        <div
          className={cn(
            'p-4 rounded-lg border',
            winnerGood
              ? 'bg-emerald-900/20 border-emerald-700/40'
              : 'bg-red-900/20 border-red-700/40',
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-400">胜利方</span>
            <span
              className={cn(
                'px-3 py-1 rounded-full text-sm font-medium',
                winnerGood ? 'bg-emerald-600 text-emerald-50' : 'bg-red-600 text-red-50',
              )}
            >
              {winnerGood ? '👥 好人阵营' : '🐺 狼人阵营'}
            </span>
          </div>
          <p className="text-xs text-gray-400">{result.reason}</p>
        </div>

        {/* 数据 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-700/40 p-3 rounded-lg text-center">
            <div className="text-[11px] text-gray-500 mb-1">总轮次</div>
            <div className="text-lg font-bold text-gray-100">{result.final_round}</div>
          </div>
          <div className="bg-gray-700/40 p-3 rounded-lg text-center">
            <div className="text-[11px] text-gray-500 mb-1">时长</div>
            <div className="text-lg font-bold text-gray-100">
              {result.duration_seconds.toFixed(1)}s
            </div>
          </div>
          <div className="bg-gray-700/40 p-3 rounded-lg text-center">
            <div className="text-[11px] text-gray-500 mb-1">总成本</div>
            <div className="text-lg font-bold text-emerald-300">
              ${result.total_cost.toFixed(4)}
            </div>
          </div>
        </div>

        {/* 各玩家成本 + 身份 */}
        <div>
          <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wide">玩家成本与身份</h4>
          <div className="space-y-1.5">
            {Object.entries(result.player_costs)
              .sort((a, b) => b[1] - a[1])
              .map(([player, cost]) => {
                const role = roleAssignment[player];
                const rc = role ? getRoleConfig(role) : null;
                return (
                  <div
                    key={player}
                    className="flex items-center gap-2 bg-gray-700/30 px-3 py-1.5 rounded"
                  >
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold',
                        avatarColor(player),
                      )}
                    >
                      {player.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || player.slice(0, 2)}
                    </div>
                    <span className="text-sm text-gray-200 flex-1">{player}</span>
                    {rc && (
                      <span className={cn('text-[10px] px-1 py-0.5 rounded', rc.badgeClass)}>
                        {rc.icon} {rc.label}
                      </span>
                    )}
                    <span className="text-sm font-mono text-emerald-300 w-16 text-right">
                      ${cost.toFixed(4)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
