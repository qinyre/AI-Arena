import { cn } from '../../utils/cn';
import type { GameStatusResponse } from '../../types/api';

interface Props {
  gameId: string;
  status: GameStatusResponse | null;
}

const PHASE_LABEL: Record<string, string> = {
  sheriff_campaign: '警长竞选',
  sheriff_voting: '警长投票',
  sheriff_tiebreak_speech: '警长平票发言',
  sheriff_tiebreak_voting: '警长加赛投票',
  badge_transfer: '警徽移交',
  speech_order: '决定发言顺序',
  sheriff_summary: '警长归票',
  night: '夜晚',
  day: '白昼',
  vote: '放逐投票',
  voting: '放逐投票',
  tiebreak_speech: '平票发言',
  tiebreak_voting: '加赛投票',
  death_skill: '死亡技能',
  ended: '终局',
};

const STATUS_META: Record<GameStatusResponse['status'], { label: string; className: string }> = {
  pending: { label: '等待', className: 'text-ink-muted' },
  initialized: { label: '已就绪', className: 'text-paper/75' },
  running: { label: '进行中', className: 'text-antique-gold' },
  completed: { label: '已落幕', className: 'text-paper/75' },
  error: { label: '异常', className: 'text-crimson' },
};

export default function GameHeader({ gameId, status }: Props) {
  if (!status) {
    return <div className="glass-panel px-4 py-3 text-sm text-ink-muted">正在翻开本局记录…</div>;
  }

  const phaseLabel = PHASE_LABEL[status.current_phase || ''] || status.current_phase || '准备中';
  const statusMeta = STATUS_META[status.status];

  return (
    <header className="glass-panel flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="border-r border-white/10 pr-3 text-center">
          <div className="font-display text-xl leading-none text-paper">{status.current_round ?? '—'}</div>
          <div className="mt-1 font-label text-[9px] tracking-[0.18em] text-ink-muted">轮次</div>
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg leading-tight text-paper">{phaseLabel}</div>
          <div className="truncate font-label text-[9px] tracking-[0.12em] text-ink-muted">{gameId}</div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {status.sheriff_enabled && (
          <div className="hidden border-l border-white/10 pl-3 text-right sm:block">
            <div className="font-label text-[9px] tracking-[0.12em] text-ink-muted">警徽</div>
            <div className="text-xs text-antique-gold">{status.sheriff_id || '竞选中'}</div>
          </div>
        )}

        {status.total_cost != null && (
          <div className="border-l border-white/10 pl-3 text-right">
            <div className="font-label text-[9px] tracking-[0.12em] text-ink-muted">成本</div>
            <div className="font-label text-xs text-paper/80">${status.total_cost.toFixed(4)}</div>
          </div>
        )}

        <span className={cn('border-l border-white/10 pl-3 font-label text-[10px]', statusMeta.className)}>
          {statusMeta.label}
        </span>
      </div>
    </header>
  );
}
