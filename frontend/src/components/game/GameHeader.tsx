/**
 * 顶栏:轮次、阶段大徽章、状态、实时成本。
 * Nocturne Stage 风格:玻璃拟态 + Material Symbols + 金/绯红阶段色。
 */
import { cn } from '../../utils/cn';
import type { GameStatusResponse } from '../../types/api';

interface Props {
  gameId: string;
  status: GameStatusResponse | null;
}

const PHASE_META: Record<string, { label: string; symbol: string; cls: string }> = {
  night: { label: '夜晚', symbol: 'dark_mode', cls: 'bg-[#c8c5cb]/10 text-[#c8c5cb] border-[#c8c5cb]/40' },
  day: { label: '白天', symbol: 'light_mode', cls: 'bg-[#e9c400]/15 text-[#ffe16d] border-[#e9c400]/40' },
  vote: { label: '投票', symbol: 'how_to_vote', cls: 'bg-[#64748b]/20 text-[#d3e4fe] border-[#64748b]/40' },
  voting: { label: '投票', symbol: 'how_to_vote', cls: 'bg-[#64748b]/20 text-[#d3e4fe] border-[#64748b]/40' },
  tiebreak_speech: { label: '平票辩护', symbol: 'record_voice_over', cls: 'bg-[#7c3aed]/15 text-[#c4b5fd] border-[#7c3aed]/40' },
  tiebreak_voting: { label: '加赛投票', symbol: 'how_to_vote', cls: 'bg-[#64748b]/20 text-[#d3e4fe] border-[#64748b]/40' },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '等待', cls: 'bg-[#1b2b3f] text-[#c8c5cb]' },
  initialized: { label: '已就绪', cls: 'bg-[#0b1c30] text-[#d3e4fe]' },
  running: { label: '运行中', cls: 'bg-[#e9c400]/20 text-[#ffe16d] animate-pulse' },
  completed: { label: '已结束', cls: 'bg-[#e9c400]/15 text-[#ffe16d]' },
  error: { label: '错误', cls: 'bg-[#eb2445]/20 text-[#ffb3b3]' },
};

export default function GameHeader({ gameId, status }: Props) {
  if (!status) {
    return (
      <div className="glass-panel rounded-md px-4 py-3 flex items-center justify-between">
        <span className="font-body text-body-md text-[#c8c5cb]">加载中...</span>
      </div>
    );
  }

  const phase = status.current_phase;
  const pm = phase ? PHASE_META[phase] : null;
  const sm = STATUS_META[status.status] || STATUS_META.pending;

  return (
    <div className="glass-panel rounded-md px-4 py-2.5 flex items-center justify-between gap-3">
      {/* 左:阶段徽章 + 轮次 */}
      <div className="flex items-center gap-3 min-w-0">
        {pm && (
          <span
            className={cn(
              'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-label text-label-md uppercase tracking-wider border',
              pm.cls,
            )}
          >
            <span className="material-symbols-outlined text-[16px]">{pm.symbol}</span>
            {pm.label}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-display text-[18px] leading-tight text-[#d3e4fe]">
            第 {status.current_round ?? '-'} 轮
          </div>
          <div className="font-label text-label-sm text-[#c8c5cb]/50 truncate uppercase tracking-wider">
            {gameId}
          </div>
        </div>
      </div>

      {/* 右:成本 + 状态 */}
      <div className="flex items-center gap-3 shrink-0">
        {status.total_cost != null && (
          <div className="text-right">
            <div className="font-label text-label-sm text-[#c8c5cb]/50 uppercase tracking-wider">成本</div>
            <div className="font-label text-body-md text-[#ffe16d]">
              ${status.total_cost.toFixed(4)}
            </div>
          </div>
        )}
        <span
          className={cn(
            'px-2.5 py-1 rounded-md font-label text-label-sm uppercase tracking-wider',
            sm.cls,
          )}
        >
          {sm.label}
        </span>
      </div>
    </div>
  );
}
