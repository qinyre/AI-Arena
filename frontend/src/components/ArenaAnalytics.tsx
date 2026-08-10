import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { PerformanceStat, StatsResponse } from '../types/api';

export default function ArenaAnalytics() {
  const [stats, setStats] = useState<StatsResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await apiClient.getStats());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '统计加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="card relative overflow-hidden border border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(196,181,253,0.12),transparent_38%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-[9px] uppercase tracking-[0.26em] text-[#c4b5fd]/60">Arena intelligence</p>
            <h2 className="mt-1 font-display text-2xl text-paper">模型与性格战绩</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
              胜率、调用量与降级率全部由已结束对局聚合；同一模型在不同席位会分别计入一次出场。
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="btn-secondary inline-flex min-h-11 items-center justify-center gap-1.5">
            <span className={`material-symbols-outlined text-[17px] ${loading ? 'animate-spin' : ''}`}>
              {loading ? 'progress_activity' : 'refresh'}
            </span>
            刷新战报
          </button>
        </div>

        {stats && (
          <div className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
            {[
              ['已落幕', stats.completed.toLocaleString()],
              ['模型样本', stats.model_stats.length.toLocaleString()],
              ['性格样本', stats.personality_stats.length.toLocaleString()],
              ['自定义用量', `${stats.custom_tokens.toLocaleString()} tokens`],
            ].map(([label, value]) => (
              <div key={label} className="bg-stage-deep/90 px-4 py-3">
                <p className="font-label text-[9px] uppercase tracking-[0.14em] text-ink-muted">{label}</p>
                <p className="mt-1 font-display text-lg text-paper">{value}</p>
              </div>
            ))}
          </div>
        )}
      </header>

      {error && (
        <div role="alert" className="border border-crimson/35 bg-crimson/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-80 animate-pulse border border-white/10 bg-white/[0.025]" />
          <div className="h-80 animate-pulse border border-white/10 bg-white/[0.025]" />
        </div>
      ) : stats && (
        <div className="grid gap-4 xl:grid-cols-2">
          <PerformanceTable
            eyebrow="MODEL LEDGER"
            title="模型表现"
            empty="新对局结束后，模型战绩会出现在这里。旧存档因未保存脱敏模型配置，不会被猜测补录。"
            rows={stats.model_stats}
            detail={(row) => row.provider || 'custom'}
          />
          <PerformanceTable
            eyebrow="PERSONA LEDGER"
            title="性格表现"
            empty="尚无携带性格配置的已结束对局。"
            rows={stats.personality_stats}
            detail={(row) => [toneLabel(row.tone), reasoningLabel(row.reasoning_style)].filter(Boolean).join(' · ')}
          />
        </div>
      )}
    </div>
  );
}

function PerformanceTable({
  eyebrow,
  title,
  empty,
  rows,
  detail,
}: {
  eyebrow: string;
  title: string;
  empty: string;
  rows: PerformanceStat[];
  detail: (row: PerformanceStat) => string;
}) {
  return (
    <section className="card min-w-0 border border-white/10">
      <div className="mb-4">
        <p className="font-label text-[9px] tracking-[0.22em] text-antique-gold/55">{eyebrow}</p>
        <h3 className="mt-1 font-display text-xl text-paper">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="grid min-h-52 place-items-center border border-dashed border-white/10 p-7 text-center text-sm leading-relaxed text-ink-muted">
          {empty}
        </div>
      ) : (
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-[610px] border-collapse">
            <thead className="border-b border-white/10 font-label text-[9px] uppercase tracking-[0.13em] text-ink-muted">
              <tr>
                <th className="pb-2 text-left font-normal">排名 / 样本</th>
                <th className="pb-2 text-center font-normal">胜率</th>
                <th className="pb-2 text-right font-normal">调用</th>
                <th className="pb-2 text-right font-normal">Tokens</th>
                <th className="pb-2 text-right font-normal">降级率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((row, index) => (
                <tr key={row.id} className="group">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center border border-antique-gold/20 font-display text-xs text-antique-gold/70">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate font-display text-sm text-paper/90">{row.label}</strong>
                        <span className="mt-0.5 block truncate text-[10px] text-ink-muted">
                          {detail(row)} · {row.appearances} 次出场 / {row.games} 局
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="w-28 px-2 py-3 text-center">
                    <strong className="font-display text-base text-[#ffe16d]">{row.win_rate.toFixed(1)}%</strong>
                    <span className="mt-1 block h-1 overflow-hidden bg-white/[0.06]">
                      <span className="block h-full bg-antique-gold" style={{ width: `${row.win_rate}%` }} />
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right font-label text-xs text-paper/65">{row.calls.toLocaleString()}</td>
                  <td className="px-2 py-3 text-right font-label text-xs text-paper/65">{row.tokens.toLocaleString()}</td>
                  <td className="py-3 text-right font-label text-xs text-paper/65">{row.fallback_rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function toneLabel(tone?: PerformanceStat['tone']) {
  return ({ calm: '冷静', direct: '直接', diplomatic: '圆融', playful: '活泼', dramatic: '戏剧化' } as Record<string, string>)[tone || ''] || '';
}

function reasoningLabel(style?: PerformanceStat['reasoning_style']) {
  return ({ evidence: '证据推理', intuition: '直觉推理', pressure: '施压推理', consensus: '共识推理' } as Record<string, string>)[style || ''] || '';
}
