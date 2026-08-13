import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { PerformanceStat, RoleId, StatsFilters, StatsResponse } from '../types/api';

const BOARD_FILTERS = [
  ['5p', '5人极简场'],
  ['9p', '9人标准场'],
  ['12p_idiot', '12人预女猎白'],
  ['12p_white_wolf_guard', '12人白狼王守卫'],
  ['12p_wolf_king_guard', '12人狼王守卫'],
  ['12p_wolf_beauty_knight', '12人狼美骑士'],
  ['custom', '自定义板型'],
] as const;

const ROLE_FILTERS: Array<[RoleId, string]> = [
  ['werewolf', '狼人'], ['white_wolf_king', '白狼王'], ['wolf_king', '狼王'], ['wolf_beauty', '狼美人'],
  ['seer', '预言家'], ['witch', '女巫'], ['hunter', '猎人'], ['idiot', '白痴'], ['guard', '守卫'],
  ['knight', '骑士'], ['villager', '平民'],
];

export default function ArenaAnalytics() {
  const [stats, setStats] = useState<StatsResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<StatsFilters>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await apiClient.getStats(filters));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '统计加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="card relative overflow-hidden border border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(196,181,253,0.12),transparent_38%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-[9px] uppercase tracking-[0.26em] text-[#c4b5fd]/60">Arena intelligence</p>
            <h2 className="mt-1 font-display text-2xl text-paper">模型与性格战绩</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
              胜率、行为分、调用量与降级率全部由已结束对局聚合；同一模型在不同席位会分别计入一次出场。
              排名优先使用板型、阵营与角色细分样本等权后的分层胜率；历史结果不代表模型的绝对实力。
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

        <div className="relative mt-4 grid gap-3 border border-white/[0.08] bg-black/10 p-3 sm:grid-cols-3">
          <FilterSelect
            id="stats-board-filter"
            label="板型"
            value={filters.board_id || ''}
            onChange={(value) => setFilters((current) => ({ ...current, board_id: value || undefined }))}
            options={BOARD_FILTERS}
          />
          <FilterSelect
            id="stats-faction-filter"
            label="阵营"
            value={filters.faction || ''}
            onChange={(value) => setFilters((current) => ({
              ...current,
              faction: (value || undefined) as StatsFilters['faction'],
            }))}
            options={[['good', '好人阵营'], ['werewolf', '狼人阵营']]}
          />
          <FilterSelect
            id="stats-role-filter"
            label="角色"
            value={filters.role || ''}
            onChange={(value) => setFilters((current) => ({
              ...current,
              role: (value || undefined) as RoleId | undefined,
            }))}
            options={ROLE_FILTERS}
          />
        </div>
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
  const rankedRows = [...rows].sort((left, right) => (
    (right.balanced_win_rate ?? right.win_rate) - (left.balanced_win_rate ?? left.win_rate)
    || right.appearances - left.appearances
  ));

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
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-white/10 font-label text-[9px] uppercase tracking-[0.13em] text-ink-muted">
              <tr>
                <th className="pb-2 text-left font-normal">排名 / 样本</th>
                <th className="pb-2 text-center font-normal">分层胜率</th>
                <th className="pb-2 text-right font-normal">行为分</th>
                <th className="pb-2 text-right font-normal">Token / 有效</th>
                <th className="pb-2 text-right font-normal">调用</th>
                <th className="pb-2 text-right font-normal">Tokens</th>
                <th className="pb-2 text-right font-normal">降级率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rankedRows.map((row, index) => {
                const rankedWinRate = row.balanced_win_rate ?? row.win_rate;
                return (
                  <tr key={row.id} className="group">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center border border-antique-gold/20 font-display text-xs text-antique-gold/70">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate font-display text-sm text-paper/90">{row.label}</strong>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-muted">
                            <span>{detail(row)} · {row.appearances} 次出场 / {row.games} 局</span>
                            {row.games < 12 && (
                              <span className="border border-amber-300/20 bg-amber-300/[0.05] px-1 py-0.5 text-amber-200/70">样本不足</span>
                            )}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="w-28 px-2 py-3 text-center">
                      <strong className="font-display text-base text-[#ffe16d]">{rankedWinRate.toFixed(1)}%</strong>
                      {row.balanced_win_rate !== undefined && (
                        <span className="block text-[9px] text-ink-muted">原始 {row.win_rate.toFixed(1)}%</span>
                      )}
                      <span className="mt-1 block h-1 overflow-hidden bg-white/[0.06]">
                        <span className="block h-full bg-antique-gold" style={{ width: `${rankedWinRate}%` }} />
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right font-display text-base text-sky-200/80">
                      {row.behavior?.score?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-2 py-3 text-right font-label text-xs text-paper/65">
                      {row.behavior?.tokens_per_effective_decision?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}
                    </td>
                    <td className="px-2 py-3 text-right font-label text-xs text-paper/65">{row.calls.toLocaleString()}</td>
                    <td className="px-2 py-3 text-right font-label text-xs text-paper/65">{row.tokens.toLocaleString()}</td>
                    <td className="py-3 text-right font-label text-xs text-paper/65">{row.fallback_rate.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label htmlFor={id} className="font-label text-[9px] tracking-[0.12em] text-ink-muted">
      {label}
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="select mt-1 w-full">
        <option value="">全部{label}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function toneLabel(tone?: PerformanceStat['tone']) {
  return ({ calm: '冷静', direct: '直接', diplomatic: '圆融', playful: '活泼', dramatic: '戏剧化' } as Record<string, string>)[tone || ''] || '';
}

function reasoningLabel(style?: PerformanceStat['reasoning_style']) {
  return ({ evidence: '证据推理', intuition: '直觉推理', pressure: '施压推理', consensus: '共识推理' } as Record<string, string>)[style || ''] || '';
}
