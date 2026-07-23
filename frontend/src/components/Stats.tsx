import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { StatsResponse } from '../types/api';

export default function Stats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const data = await apiClient.getStats();
      setStats(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return null;
  }

  return (
    <div className="flex gap-4 text-sm">
      <div className="bg-gray-700 px-3 py-2 rounded">
        <span className="text-gray-400">总计:</span>{' '}
        <span className="font-bold text-white">{stats.total_games}</span>
      </div>
      <div className="bg-green-900/30 px-3 py-2 rounded">
        <span className="text-gray-400">完成:</span>{' '}
        <span className="font-bold text-green-300">{stats.completed}</span>
      </div>
      <div className="bg-yellow-900/30 px-3 py-2 rounded">
        <span className="text-gray-400">运行:</span>{' '}
        <span className="font-bold text-yellow-300">{stats.running}</span>
      </div>
      <div className="bg-blue-900/30 px-3 py-2 rounded">
        <span className="text-gray-400">总成本:</span>{' '}
        <span className="font-bold text-blue-300">${stats.total_cost.toFixed(4)}</span>
      </div>
    </div>
  );
}
