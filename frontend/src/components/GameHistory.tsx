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
      pending: { label: '等待', className: 'bg-gray-600 text-gray-200' },
      initialized: { label: '已就绪', className: 'bg-blue-600 text-blue-200' },
      running: { label: '进行中', className: 'bg-yellow-600 text-yellow-100' },
      completed: { label: '已落幕', className: 'bg-green-700 text-green-100' },
      error: { label: '异常', className: 'bg-red-700 text-red-100' },
    };
    return badges[status as keyof typeof badges] || badges.pending;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const qualityBadge = (game: GameListItem) => {
    if (!game.quality_status) return null;
    const meta = game.quality_status === 'passed'
      ? { label: '质检通过', className: 'border-emerald-300/25 text-emerald-200' }
      : game.quality_status === 'failed'
        ? { label: `${game.quality_issue_count ?? 0} 项漏洞`, className: 'border-red-300/30 text-red-200' }
        : { label: `${game.quality_issue_count ?? 0} 项风险`, className: 'border-amber-300/30 text-amber-200' };
    return (
      <span className={`border px-2 py-0.5 font-label text-[10px] ${meta.className}`}>
        {meta.label} · {game.quality_score ?? '—'}
      </span>
    );
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
      <div className="card border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-label text-[10px] tracking-[0.2em] text-antique-gold/60">ARCHIVE</p>
            <h2 className="font-display text-2xl text-paper">对局档案</h2>
          </div>
          <button onClick={fetchGames} className="btn-secondary inline-flex min-h-11 items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            刷新
          </button>
        </div>

        {games.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">暂无游戏记录</p>
            <p className="text-gray-500 text-sm mt-2">创建第一个游戏开始对战！</p>
          </div>
        ) : (<>
          <div className="space-y-3 md:hidden">
            {games.map((game) => {
              const status = getStatusBadge(game.status);
              return (
                <article key={game.game_id} className="border border-white/10 bg-stage-deep/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-paper">{game.game_id}</p>
                      <p className="mt-1 text-xs text-ink-muted">创建于 {formatDate(game.created_at)}</p>
                      {(game.automated_series || game.series_game_number > 1) && (
                        <p className="mt-1 font-label text-[10px] text-[#c4b5fd]/60">
                          {game.prompt_experiment ? '提示词实验' : game.automated_series ? 'AI 赛事' : '系列赛'} · 第 {game.series_game_number} 局
                        </p>
                      )}
                      <div className="mt-2">{qualityBadge(game)}</div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onViewGame(game.game_id)}
                      className="btn-primary min-h-11"
                    >
                      查看对局
                    </button>
                    {game.automated_series ? (
                      <span className="grid min-h-11 place-items-center border border-white/10 text-xs text-ink-muted">赛事成员</span>
                    ) : (
                      <button
                        onClick={() => handleDelete(game.game_id)}
                        className="min-h-11 border border-crimson/35 text-sm text-crimson transition-colors hover:bg-crimson/10"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">游戏ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">状态</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">系列</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">自动质检</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">创建时间</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">开始时间</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">完成时间</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const status = getStatusBadge(game.status);
                  return <tr key={game.game_id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-4 font-mono text-sm">{game.game_id}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-300">
                      {game.prompt_experiment
                        ? `提示词实验 · 第 ${game.series_game_number} 局`
                        : game.automated_series
                        ? `AI 赛事 · 第 ${game.series_game_number} 局`
                        : game.series_game_number > 1 ? `第 ${game.series_game_number} 局` : '首局'}
                    </td>
                    <td className="py-3 px-4">{qualityBadge(game) ?? <span className="text-xs text-ink-muted">待生成</span>}</td>
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
                      {game.automated_series ? (
                        <span className="text-xs text-ink-muted">不可单独删除</span>
                      ) : (
                        <button
                          onClick={() => handleDelete(game.game_id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          删除
                        </button>
                      )}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </div>
  );
}
