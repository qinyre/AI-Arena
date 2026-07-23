import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { GameListItem } from '../types/api';

interface Props {
  onViewGame: (gameId: string) => void;
}

export default function GameHistory({ onViewGame }: Props) {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.listGames();
      setGames(response.games);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch games');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (gameId: string) => {
    if (!confirm(`确定删除游戏 ${gameId}？`)) return;

    try {
      await apiClient.deleteGame(gameId);
      await fetchGames();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-gray-600 text-gray-200',
      initialized: 'bg-blue-600 text-blue-200',
      running: 'bg-yellow-600 text-yellow-200',
      completed: 'bg-green-600 text-green-200',
      error: 'bg-red-600 text-red-200'
    };
    return badges[status as keyof typeof badges] || badges.pending;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">加载游戏历史...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            <strong>错误:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">游戏历史</h2>
          <button onClick={fetchGames} className="btn-secondary">
            🔄 刷新
          </button>
        </div>

        {games.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">暂无游戏记录</p>
            <p className="text-gray-500 text-sm mt-2">创建第一个游戏开始对战！</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">游戏ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">状态</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">创建时间</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">开始时间</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">完成时间</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.game_id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-4 font-mono text-sm">{game.game_id}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(game.status)}`}>
                        {game.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-300">{formatDate(game.created_at)}</td>
                    <td className="py-3 px-4 text-sm text-gray-300">{formatDate(game.started_at)}</td>
                    <td className="py-3 px-4 text-sm text-gray-300">{formatDate(game.completed_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onViewGame(game.game_id)}
                        className="text-blue-400 hover:text-blue-300 mr-3 text-sm"
                      >
                        查看
                      </button>
                      <button
                        onClick={() => handleDelete(game.game_id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
