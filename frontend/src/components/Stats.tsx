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

  const entries = [
    ['总局数', stats.total_games],
    ['已落幕', stats.completed],
    ['进行中', stats.running],
    ['累计成本', `$${stats.total_cost.toFixed(4)}`],
    ...(stats.custom_tokens > 0
      ? [['自定义用量', `${stats.custom_tokens.toLocaleString()} tokens`]]
      : []),
  ];

  return (
    <dl className="hidden divide-x divide-white/10 border-y border-white/[0.07] text-right md:flex">
      {entries.map(([label, value]) => (
        <div key={label} className="px-3 py-1.5">
          <dt className="font-label text-[8px] tracking-[0.12em] text-ink-muted">{label}</dt>
          <dd className="mt-0.5 font-label text-xs text-paper/80">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
