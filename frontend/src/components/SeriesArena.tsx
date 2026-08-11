import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { PerformanceStat, SeriesGameItem, SeriesStatusResponse, StatsResponse } from '../types/api';
import CreateGame from './CreateGame';

interface Props {
  seriesId: string | null;
  onSeriesCreated: (seriesId: string | null) => void;
  onViewGame: (gameId: string) => void;
}

const TERMINAL_STATUSES = new Set(['completed', 'stopped', 'error']);

export default function SeriesArena({ seriesId, onSeriesCreated, onViewGame }: Props) {
  const [series, setSeries] = useState<SeriesStatusResponse>();
  const [error, setError] = useState('');
  const [stopping, setStopping] = useState(false);
  const [standings, setStandings] = useState<StatsResponse>();
  const [standingsError, setStandingsError] = useState('');

  const load = useCallback(async () => {
    if (!seriesId) return;
    try {
      setSeries(await apiClient.getSeries(seriesId));
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '赛事状态加载失败');
    }
  }, [seriesId]);

  useEffect(() => {
    setSeries(undefined);
    setError('');
    setStandings(undefined);
    setStandingsError('');
  }, [seriesId]);

  useEffect(() => {
    if (!seriesId || error) return;
    void load();
    if (series?.status && TERMINAL_STATUSES.has(series.status)) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [error, load, series?.status, seriesId]);

  useEffect(() => {
    if (!seriesId || !series?.completed_games) return;
    let active = true;
    apiClient.getStats({ series_id: seriesId })
      .then((response) => {
        if (!active) return;
        setStandings(response);
        setStandingsError('');
      })
      .catch((requestError) => {
        if (!active) return;
        setStandingsError(requestError instanceof Error ? requestError.message : '赛事排行加载失败');
      });
    return () => { active = false; };
  }, [series?.completed_games, seriesId]);

  const stop = async () => {
    if (!seriesId || !window.confirm('停止后不会再启动下一局，当前正在进行的对局也会立即终止。确定停止？')) return;
    setStopping(true);
    setError('');
    try {
      setSeries(await apiClient.stopSeries(seriesId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '停止赛事失败');
    } finally {
      setStopping(false);
    }
  };

  if (!seriesId) {
    return <CreateGame mode="series" onSeriesCreated={onSeriesCreated} />;
  }

  if (!series) {
    return (
      <div className="mx-auto grid min-h-72 max-w-[1400px] place-items-center border border-white/10 bg-white/[0.02]">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-3xl text-antique-gold/70">progress_activity</span>
          <p className="mt-2 font-label text-xs tracking-[0.16em] text-ink-muted">正在调取赛事案卷</p>
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
          {error && (
            <button type="button" onClick={() => onSeriesCreated(null)} className="btn-secondary mt-4 min-h-11 px-4">
              返回创建赛事
            </button>
          )}
        </div>
      </div>
    );
  }

  const progress = series.game_count
    ? Math.min(100, (series.completed_games / series.game_count) * 100)
    : 0;
  const tokenProgress = series.max_total_tokens
    ? Math.min(100, (series.total_tokens / series.max_total_tokens) * 100)
    : 0;
  const canStop = ['pending', 'running'].includes(series.status);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="card relative overflow-hidden border border-antique-gold/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(185,151,88,0.14),transparent_38%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-label text-[9px] tracking-[0.25em] text-antique-gold/65">FAIR SERIES CONTROL</p>
              <span className={`border px-2 py-0.5 font-label text-[9px] tracking-[0.12em] ${statusClass(series.status)}`}>
                {statusLabel(series.status)}
              </span>
            </div>
            <h2 className="mt-2 font-display text-2xl text-paper">AI 公平赛事</h2>
            <p className="mt-1 truncate font-label text-[10px] text-ink-muted">案卷 {series.series_id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="btn-secondary inline-flex min-h-11 items-center gap-1.5">
              <span className="material-symbols-outlined text-[17px]">refresh</span>
              刷新
            </button>
            {canStop && (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={stopping}
                className="inline-flex min-h-11 items-center gap-1.5 border border-crimson/40 px-4 font-label text-xs text-red-200 transition-colors hover:bg-crimson/10 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px]">stop_circle</span>
                {stopping ? '正在停止…' : '停止赛事'}
              </button>
            )}
            {TERMINAL_STATUSES.has(series.status) && (
              <button type="button" onClick={() => onSeriesCreated(null)} className="btn-primary min-h-11 px-4 text-sm">
                创建新赛事
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid gap-px border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="完成进度" value={`${series.completed_games} / ${series.game_count} 局`} detail={`当前第 ${Math.min(series.current_game_number, series.game_count)} 局`} />
          <Metric
            label="累计 Tokens"
            value={series.total_tokens.toLocaleString()}
            detail={series.max_total_tokens ? `上限 ${series.max_total_tokens.toLocaleString()}` : '本赛事未设置总上限'}
          />
          <Metric label="累计成本" value={formatCost(series.total_cost)} detail="仅统计已返回的模型调用" />
          <Metric label="基础种子" value={String(series.base_seed ?? series.games[0]?.seed ?? '—')} detail="轮换块递增 · 席位轮换" />
        </div>

        <div className="relative mt-4 space-y-3">
          <Progress label="赛程" value={progress} tone="gold" />
          {series.max_total_tokens && (
            <Progress label="Token 硬上限" value={tokenProgress} tone={tokenProgress >= 85 ? 'red' : 'blue'} />
          )}
        </div>
      </header>

      {error && (
        <div role="alert" className="border border-crimson/35 bg-crimson/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {(series.error || series.reason) && (
        <div role="alert" className="border border-crimson/35 bg-crimson/10 px-4 py-3 text-sm text-red-200">
          赛事中止原因：{series.error || series.reason}
        </div>
      )}

      <section className="card border border-white/10">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-[9px] tracking-[0.22em] text-antique-gold/55">MATCH LEDGER</p>
            <h3 className="mt-1 font-display text-xl text-paper">逐局案卷</h3>
          </div>
          <p className="max-w-lg text-[11px] leading-relaxed text-ink-muted">
            赛事严格串行运行；每局自动轮换玩家席位，种子可复现。胜率需结合板型、阵营与角色样本解读。
          </p>
        </div>

        {series.games.length ? (
          <div className="grid gap-2">
            {series.games.map((game) => (
              <GameRow key={game.game_id} game={game} onView={onViewGame} />
            ))}
          </div>
        ) : (
          <div className="grid min-h-32 place-items-center border border-dashed border-white/10 text-sm text-ink-muted">
            正在等待第一局入场…
          </div>
        )}
      </section>

      {series.completed_games > 0 && (
        <SeriesStandings stats={standings} error={standingsError} />
      )}
    </div>
  );
}

function SeriesStandings({ stats, error }: { stats?: StatsResponse; error: string }) {
  const rows = [...(stats?.model_stats ?? [])].sort((left, right) => (
    (right.balanced_win_rate ?? right.win_rate) - (left.balanced_win_rate ?? left.win_rate)
    || right.appearances - left.appearances
  ));

  return (
    <section className="card border border-white/10">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-label text-[9px] tracking-[0.22em] text-antique-gold/55">SERIES STANDINGS</p>
          <h3 className="mt-1 font-display text-xl text-paper">赛事模型排行</h3>
        </div>
        <p className="max-w-xl text-[11px] leading-relaxed text-ink-muted">
          按板型、阵营与角色切片等权计算分层胜率；完整席位轮换后才更适合横向比较，小样本仅作参考。
        </p>
      </div>
      {error ? (
        <p role="alert" className="border border-crimson/30 bg-crimson/[0.07] px-3 py-2 text-xs text-red-200">{error}</p>
      ) : !stats ? (
        <div className="h-24 animate-pulse border border-white/[0.07] bg-white/[0.02]" />
      ) : rows.length === 0 ? (
        <p className="border border-dashed border-white/10 px-4 py-8 text-center text-sm text-ink-muted">暂无可排行的模型样本。</p>
      ) : (
        <div className="divide-y divide-white/[0.06] border-y border-white/[0.07]">
          {rows.map((row, index) => (
            <StandingRow key={row.id} row={row} rank={index + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function StandingRow({ row, rank }: { row: PerformanceStat; rank: number }) {
  const rate = row.balanced_win_rate ?? row.win_rate;
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_7rem_7rem]">
      <span className="grid h-7 w-7 place-items-center border border-antique-gold/20 font-display text-xs text-antique-gold/75">{rank}</span>
      <span className="min-w-0">
        <strong className="block truncate font-display text-sm font-normal text-paper/90">{row.label}</strong>
        <span className="text-[10px] text-ink-muted">{row.provider || 'custom'} · {row.appearances} 次出场 / {row.games} 局</span>
      </span>
      <span className="text-right">
        <strong className="block font-display text-base font-normal text-[#ffe16d]">{rate.toFixed(1)}%</strong>
        <span className="text-[9px] text-ink-muted">分层胜率</span>
      </span>
      <span className="hidden text-right sm:block">
        <strong className="block font-label text-xs font-normal text-paper/70">{row.fallback_rate.toFixed(1)}%</strong>
        <span className="text-[9px] text-ink-muted">降级率</span>
      </span>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-stage-deep/90 px-4 py-3">
      <p className="font-label text-[9px] uppercase tracking-[0.14em] text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-lg text-paper">{value}</p>
      <p className="mt-0.5 text-[10px] text-ink-muted">{detail}</p>
    </div>
  );
}

function Progress({ label, value, tone }: { label: string; value: number; tone: 'gold' | 'blue' | 'red' }) {
  const color = { gold: 'bg-antique-gold', blue: 'bg-sky-400', red: 'bg-crimson' }[tone];
  return (
    <div className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
      <span className="font-label text-[9px] tracking-[0.12em] text-ink-muted">{label}</span>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        className="h-1.5 overflow-hidden bg-white/[0.07]"
      >
        <span className={`block h-full transition-[width] duration-500 ${color}`} style={{ width: `${value}%` }} />
      </span>
      <span className="text-right font-label text-[10px] text-paper/70">{value.toFixed(0)}%</span>
    </div>
  );
}

function GameRow({ game, onView }: { game: SeriesGameItem; onView: (gameId: string) => void }) {
  return (
    <article className="grid gap-3 border border-white/[0.08] bg-white/[0.02] px-3 py-3 transition-colors hover:border-white/15 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-4">
      <div className="grid h-10 w-10 place-items-center border border-antique-gold/20 font-display text-sm text-antique-gold/75">
        {String(game.game_number).padStart(2, '0')}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-display text-sm font-normal text-paper">第 {game.game_number} 局</strong>
          <span className={`border px-1.5 py-0.5 font-label text-[9px] ${statusClass(game.status)}`}>{statusLabel(game.status)}</span>
          {game.winner && <span className="font-label text-[10px] text-[#ffe16d]">{winnerLabel(game.winner)}</span>}
        </div>
        <p className="mt-1 truncate font-label text-[10px] text-ink-muted">
          seed {game.seed} · {(game.tokens ?? 0).toLocaleString()} tokens · {formatCost(game.cost ?? 0)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onView(game.game_id)}
        className="min-h-11 border border-white/12 px-4 font-label text-[10px] text-paper/70 transition-colors hover:border-antique-gold/40 hover:text-antique-gold"
      >
        查看对局
      </button>
    </article>
  );
}

function statusLabel(status: string) {
  return ({
    pending: '待入场', running: '进行中', stopping: '停止中', stopped: '已停止',
    completed: '已落幕', error: '异常', initialized: '已就绪', paused: '已暂停',
  } as Record<string, string>)[status] || status;
}

function statusClass(status: string) {
  if (status === 'completed') return 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200';
  if (status === 'running') return 'border-sky-400/25 bg-sky-400/[0.07] text-sky-200';
  if (status === 'error') return 'border-crimson/35 bg-crimson/10 text-red-200';
  return 'border-white/12 bg-white/[0.03] text-ink-muted';
}

function winnerLabel(winner: SeriesGameItem['winner']) {
  return winner === 'good' ? '好人胜利' : winner === 'werewolf' ? '狼人胜利' : '平局';
}

function formatCost(cost: number) {
  return cost > 0 ? `$${cost.toFixed(cost < 0.01 ? 4 : 2)}` : '$0.00';
}
