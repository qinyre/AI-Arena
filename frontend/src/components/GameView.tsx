import { useGame } from '../hooks/useGame';
import EventTimeline from './EventTimeline';

interface Props {
  gameId: string;
}

export default function GameView({ gameId }: Props) {
  const { status, result, loading, error } = useGame(gameId);

  if (loading && !status) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">加载游戏信息...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            <strong>错误:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-gray-600 text-gray-200',
      initialized: 'bg-blue-600 text-blue-200',
      running: 'bg-yellow-600 text-yellow-200 animate-pulse',
      completed: 'bg-green-600 text-green-200',
      error: 'bg-red-600 text-red-200'
    };
    return badges[status as keyof typeof badges] || badges.pending;
  };

  const getWinnerBadge = (winner: string) => {
    return winner === 'good'
      ? 'bg-green-600 text-green-200'
      : 'bg-red-600 text-red-200';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Game Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">游戏状态</h2>
            <p className="text-gray-400 text-sm mt-1">Game ID: {gameId}</p>
          </div>
          <span className={`px-4 py-2 rounded-full font-medium ${getStatusBadge(status.status)}`}>
            {status.status === 'pending' && '等待中'}
            {status.status === 'initialized' && '已初始化'}
            {status.status === 'running' && '运行中'}
            {status.status === 'completed' && '已完成'}
            {status.status === 'error' && '错误'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-400 text-sm mb-1">当前轮次</p>
            <p className="text-2xl font-bold">{status.current_round || '-'}</p>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-400 text-sm mb-1">当前阶段</p>
            <p className="text-2xl font-bold">
              {status.current_phase === 'night' && '🌙 夜晚'}
              {status.current_phase === 'day' && '☀️ 白天'}
              {status.current_phase === 'vote' && '🗳️ 投票'}
              {!status.current_phase && '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Players Card */}
      <div className="card">
        <h3 className="text-xl font-bold mb-4">玩家状态</h3>

        <div className="space-y-4">
          {/* Alive Players */}
          {status.alive_players.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">存活玩家 ({status.alive_players.length})</h4>
              <div className="flex flex-wrap gap-2">
                {status.alive_players.map(player => (
                  <span key={player} className="bg-green-900/50 text-green-200 px-3 py-1 rounded-full text-sm">
                    ✅ {player}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dead Players */}
          {status.dead_players.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">已淘汰玩家 ({status.dead_players.length})</h4>
              <div className="flex flex-wrap gap-2">
                {status.dead_players.map(player => (
                  <span key={player} className="bg-red-900/50 text-red-200 px-3 py-1 rounded-full text-sm">
                    ❌ {player}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Result Card (if completed) */}
      {status.status === 'completed' && result && (
        <div className="card">
          <h3 className="text-xl font-bold mb-4">游戏结果</h3>

          <div className="space-y-4">
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">胜利方</span>
                <span className={`px-3 py-1 rounded-full font-medium ${getWinnerBadge(result.winner)}`}>
                  {result.winner === 'good' ? '👥 好人阵营' : '🐺 狼人阵营'}
                </span>
              </div>
              <p className="text-sm text-gray-300">{result.reason}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="text-gray-400 text-sm mb-1">最终轮次</p>
                <p className="text-xl font-bold">{result.final_round}</p>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="text-gray-400 text-sm mb-1">游戏时长</p>
                <p className="text-xl font-bold">{result.duration_seconds.toFixed(1)}s</p>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="text-gray-400 text-sm mb-1">总成本</p>
                <p className="text-xl font-bold">${result.total_cost.toFixed(4)}</p>
              </div>
            </div>

            {/* Player Costs */}
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">玩家成本</h4>
              <div className="space-y-2">
                {Object.entries(result.player_costs).map(([player, cost]) => (
                  <div key={player} className="flex justify-between items-center bg-gray-700 px-4 py-2 rounded">
                    <span className="text-sm">{player}</span>
                    <span className="font-mono text-sm">${cost.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Running Indicator */}
      {status.status === 'running' && (
        <div className="card bg-blue-900/20 border border-blue-700">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <div>
              <p className="font-medium text-blue-200">游戏进行中...</p>
              <p className="text-sm text-blue-300">页面每3秒自动刷新</p>
            </div>
          </div>
        </div>
      )}

      {/* Event Timeline - 核心观战功能 */}
      <EventTimeline gameId={gameId} />
    </div>
  );
}
