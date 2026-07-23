/**
 * 顶栏：轮次、阶段大徽章、状态、实时成本。
 */
import { cn } from '../../utils/cn';
import type { GameStatusResponse } from '../../types/api';

interface Props {
  gameId: string;
  status: GameStatusResponse | null;
}

const PHASE_META: Record<string, { label: string; icon: string; cls: string }> = {
  night: { label: '夜晚', icon: '🌙', cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40' },
  day: { label: '白天', icon: '☀️', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  vote: { label: '投票', icon: '🗳️', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/40' },
  voting: { label: '投票', icon: '🗳️', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/40' },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '等待', cls: 'bg-gray-600 text-gray-200' },
  initialized: { label: '已就绪', cls: 'bg-blue-600 text-blue-100' },
  running: { label: '运行中', cls: 'bg-yellow-600 text-yellow-100 animate-pulse' },
  completed: { label: '已结束', cls: 'bg-green-600 text-green-100' },
  error: { label: '错误', cls: 'bg-red-600 text-red-100' },
};

export default function GameHeader({ gameId, status }: Props) {
  if (!status) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60 rounded-lg">
        <span className="text-sm text-gray-400">加载中...</span>
      </div>
    );
  }

  const phase = status.current_phase;
  const pm = phase ? PHASE_META[phase] || PHASE_META.pending : null;
  const sm = STATUS_META[status.status] || STATUS_META.pending;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-800/60 rounded-lg backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        {pm && (
          <span
            className={cn(
              'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium border',
              pm.cls,
            )}
          >
            {pm.icon} {pm.label}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-100">
            第 {status.current_round ?? '-'} 轮
          </div>
          <div className="text-[11px] text-gray-500 truncate">{gameId}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {status.total_cost != null && (
          <div className="text-right">
            <div className="text-[10px] text-gray-500">成本</div>
            <div className="text-sm font-mono text-emerald-300">
              ${status.total_cost.toFixed(4)}
            </div>
          </div>
        )}
        <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium', sm.cls)}>
          {sm.label}
        </span>
      </div>
    </div>
  );
}
