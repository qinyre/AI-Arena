import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type {
  BehaviorMetrics,
  PerformanceStat,
  PromptExperimentArm,
  PromptExperimentStatusResponse,
  StatsResponse,
} from '../types/api';
import CreateGame from './CreateGame';

const TERMINAL = new Set(['completed', 'stopped', 'error']);

interface Props {
  experimentId: string | null;
  onExperimentCreated: (experimentId: string | null) => void;
  onViewGame: (gameId: string) => void;
}

export default function PromptExperimentLab({
  experimentId, onExperimentCreated, onViewGame,
}: Props) {
  const [experiment, setExperiment] = useState<PromptExperimentStatusResponse>();
  const [stats, setStats] = useState<StatsResponse>();
  const [error, setError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [stopping, setStopping] = useState(false);

  const load = useCallback(async () => {
    if (!experimentId) return;
    try {
      const response = await apiClient.getPromptExperiment(experimentId);
      setExperiment(response);
      setError('');
      if (response.completed_pairs) {
        try {
          setStats(await apiClient.getStats({ series_id: experimentId }));
          setStatsError('');
        } catch (statsRequestError) {
          setStatsError(statsRequestError instanceof Error ? statsRequestError.message : '分层统计加载失败');
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '实验状态加载失败');
    }
  }, [experimentId]);

  useEffect(() => {
    setExperiment(undefined);
    setStats(undefined);
    setError('');
    setStatsError('');
  }, [experimentId]);

  useEffect(() => {
    if (!experimentId || error) return;
    void load();
    if (experiment?.status && TERMINAL.has(experiment.status)) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [error, experiment?.status, experimentId, load]);

  const stop = async () => {
    if (!experimentId || !window.confirm('停止后不会继续创建镜像局，正在运行的对局也会终止。确定停止？')) return;
    setStopping(true);
    try {
      setExperiment(await apiClient.stopPromptExperiment(experimentId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '停止实验失败');
    } finally {
      setStopping(false);
    }
  };

  if (!experimentId) {
    return <CreateGame mode="experiment" onExperimentCreated={onExperimentCreated} />;
  }

  if (!experiment) {
    return (
      <div className="mx-auto grid min-h-72 max-w-[1400px] place-items-center border border-sky-300/15 bg-sky-300/[0.025]">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-3xl text-sky-200/70">experiment</span>
          <p className="mt-2 font-label text-xs tracking-[0.16em] text-ink-muted">正在读取镜像实验记录</p>
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
          {error && (
            <button type="button" onClick={() => onExperimentCreated(null)} className="btn-secondary mt-4 min-h-11 px-4">
              返回创建实验
            </button>
          )}
        </div>
      </div>
    );
  }

  const progress = experiment.pair_count
    ? experiment.completed_pairs / experiment.pair_count * 100
    : 0;
  const canStop = ['pending', 'running'].includes(experiment.status);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="relative overflow-hidden border border-white/10 bg-stage-deep p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(56,189,248,0.10),transparent_38%,rgba(245,158,11,0.08))]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-label text-[9px] tracking-[0.26em] text-sky-200/60">PROMPT EVIDENCE LAB</p>
              <span className={`border px-2 py-0.5 font-label text-[9px] ${statusClass(experiment.status)}`}>
                {statusLabel(experiment.status)}
              </span>
            </div>
            <h2 className="mt-2 font-display text-2xl text-paper">提示词镜像实验</h2>
            <p className="mt-1 font-label text-[10px] text-ink-muted">
              {experiment.series_id} · seed {experiment.base_seed} · {experiment.seat_count} 席
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="btn-secondary min-h-11 px-4">刷新</button>
            {canStop && (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={stopping}
                className="min-h-11 border border-crimson/40 px-4 font-label text-xs text-red-200 hover:bg-crimson/10 disabled:opacity-50"
              >
                {stopping ? '正在停止…' : '停止实验'}
              </button>
            )}
            {TERMINAL.has(experiment.status) && (
              <button type="button" onClick={() => onExperimentCreated(null)} className="btn-primary min-h-11 px-4 text-sm">
                新建实验
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid gap-px border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
          <HeaderMetric label="镜像配对" value={`${experiment.completed_pairs} / ${experiment.pair_count}`} />
          <HeaderMetric label="实际对局" value={`${experiment.completed_games} / ${experiment.game_count}`} />
          <HeaderMetric label="累计 Tokens" value={experiment.total_tokens.toLocaleString()} />
          <HeaderMetric label="硬上限" value={experiment.max_total_tokens?.toLocaleString() || '未设置'} />
        </div>
        <div className="relative mt-4 grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
          <span className="font-label text-[9px] tracking-[0.12em] text-ink-muted">完整配对进度</span>
          <span className="h-1.5 overflow-hidden bg-white/[0.07]">
            <span className="block h-full bg-[linear-gradient(90deg,#7dd3fc,#fbbf24)] transition-[width] duration-500" style={{ width: `${Math.min(100, progress)}%` }} />
          </span>
          <span className="text-right font-label text-[10px] text-paper/70">{progress.toFixed(0)}%</span>
        </div>
      </header>

      {error && <div role="alert" className="border border-crimson/35 bg-crimson/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {(experiment.error || experiment.reason) && (
        <div role="alert" className="border border-crimson/35 bg-crimson/10 px-4 py-3 text-sm text-red-200">
          实验中止原因：{experiment.error || experiment.reason}
        </div>
      )}

      <ExperimentReport experiment={experiment} />

      <section className="border border-white/10 bg-stage-deep p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-[9px] tracking-[0.22em] text-antique-gold/55">MIRROR LEDGER</p>
            <h3 className="mt-1 font-display text-xl text-paper">镜像对局账本</h3>
          </div>
          <p className="text-[11px] text-ink-muted">同一配对的 AB / BA 两局必须都结束，才进入评分。</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {experiment.games.map((game) => (
            <button
              key={game.game_id}
              type="button"
              onClick={() => onViewGame(game.game_id)}
              className="grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-3 text-left transition-colors hover:border-sky-200/25"
            >
              <span className="grid h-8 w-8 place-items-center border border-white/10 font-display text-xs text-paper/70">
                {String(game.game_number).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                <strong className="block font-display text-sm font-normal text-paper/85">配对 {game.experiment_pair} · {game.experiment_mirror}</strong>
                <span className="block truncate font-label text-[9px] text-ink-muted">seed {game.seed} · {(game.tokens || 0).toLocaleString()} tokens</span>
              </span>
              <span className={`border px-2 py-1 font-label text-[9px] ${statusClass(game.status)}`}>{statusLabel(game.status)}</span>
            </button>
          ))}
        </div>
      </section>

      {statsError && (
        <div role="status" className="border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-xs text-amber-100/75">
          模型 / 性格分层暂未加载：{statsError}。A/B 主报告不受影响。
        </div>
      )}
      {stats && <BreakdownTables stats={stats} />}
    </div>
  );
}

function ExperimentReport({ experiment }: { experiment: PromptExperimentStatusResponse }) {
  const report = experiment.report;
  const [armA, armB] = report.arms;
  if (!armA || !armB) return null;
  const metrics: Array<{
    metricKey: keyof BehaviorMetrics | 'balanced_win_rate'; label: string; better: 'high' | 'low'; detail: string;
  }> = [
    { metricKey: 'balanced_win_rate', label: '阵营平衡胜率', better: 'high', detail: '板型 × 阵营 × 身份切片等权' },
    { metricKey: 'vote_accuracy', label: '阵营有效投票率', better: 'high', detail: '好人投狼、狼人投好人' },
    { metricKey: 'skill_value_rate', label: '神职 / 特殊技能收益', better: 'high', detail: '查狼、正确用药、挡刀、决斗等' },
    { metricKey: 'speech_repeat_rate', label: '发言重复率', better: 'low', detail: '与本人历史发言高度相似' },
    { metricKey: 'stance_reversal_rate', label: '无依据立场反复率', better: 'low', detail: '嫌疑 / 信任反转但未引用公开证据' },
    { metricKey: 'identity_leak_rate', label: '身份泄露率', better: 'low', detail: '狼方第一人称身份或刀口泄露（启发式）' },
    { metricKey: 'wolf_coordination', label: '狼队协作质量', better: 'high', detail: '刀口收敛 75% + 私聊新信息 25%' },
    { metricKey: 'tokens_per_effective_decision', label: 'Token / 有效决策', better: 'low', detail: '越低越省；仅计算命中决策' },
  ];

  return (
    <section className="relative overflow-hidden border border-white/10 bg-[#080d12]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_15rem_minmax(0,1fr)]">
        <ArmHeader arm={armA} tone="sky" winner={report.winner === 'A'} />
        <div className="order-first border-b border-white/10 px-5 py-5 text-center lg:order-none lg:border-x lg:border-b-0">
          <p className="font-label text-[9px] tracking-[0.24em] text-ink-muted">CROSSOVER VERDICT</p>
          <strong className="mt-3 block font-display text-4xl font-normal text-paper">
            {report.score_delta === null || report.score_delta === undefined ? '—' : `${report.score_delta > 0 ? '+' : ''}${report.score_delta}`}
          </strong>
          <span className="font-label text-[9px] text-ink-muted">B 相对 A 综合分差</span>
          <p className="mt-4 text-[11px] leading-relaxed text-paper/65">{report.verdict}</p>
          <span className={`mt-3 inline-block border px-2 py-1 font-label text-[9px] ${report.complete_rotation ? 'border-emerald-300/25 text-emerald-200' : 'border-amber-300/25 text-amber-200'}`}>
            {report.complete_rotation ? '已完成整轮席位样本' : '样本仍在收集'}
          </span>
        </div>
        <ArmHeader arm={armB} tone="amber" winner={report.winner === 'B'} />
      </div>

      <div className="border-t border-white/10 px-3 py-4 sm:px-5">
        <div className="grid gap-2">
          {metrics.map((metric) => (
            <MetricComparison key={metric.metricKey} armA={armA} armB={armB} {...metric} />
          ))}
        </div>
        <p className="mt-4 border-l-2 border-white/10 pl-3 text-[10px] leading-relaxed text-ink-muted">{report.methodology}</p>
      </div>
    </section>
  );
}

function ArmHeader({ arm, tone, winner }: { arm: PromptExperimentArm; tone: 'sky' | 'amber'; winner: boolean }) {
  const color = tone === 'sky' ? 'text-sky-200 border-sky-300/30' : 'text-amber-200 border-amber-300/30';
  return (
    <div className="relative min-w-0 p-5 sm:p-6">
      {winner && <span className={`absolute right-4 top-4 border px-2 py-1 font-label text-[9px] ${color}`}>当前领先</span>}
      <span className={`grid h-9 w-9 place-items-center border font-display text-lg ${color}`}>{arm.id}</span>
      <h3 className="mt-4 font-display text-2xl text-paper">{arm.name}</h3>
      <p className="mt-2 min-h-10 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-muted">
        {arm.instructions || '当前核心提示词，不附加额外策略。'}
      </p>
      <div className="mt-5 flex items-end gap-3">
        <strong className={`font-display text-5xl font-normal ${tone === 'sky' ? 'text-sky-200' : 'text-amber-200'}`}>
          {formatNumber(arm.behavior.score)}
        </strong>
        <span className="pb-1 font-label text-[9px] text-ink-muted">行为综合分 / 100</span>
      </div>
      <p className="mt-3 font-label text-[9px] text-ink-muted">
        {arm.appearances} 次出场 · {arm.games} 局 · {arm.behavior.effective_decisions} 个有效决策
      </p>
    </div>
  );
}

function MetricComparison({
  armA, armB, metricKey, label, better, detail,
}: {
  armA: PromptExperimentArm;
  armB: PromptExperimentArm;
  metricKey: keyof BehaviorMetrics | 'balanced_win_rate';
  label: string;
  better: 'high' | 'low';
  detail: string;
}) {
  const a = metricValue(armA, metricKey);
  const b = metricValue(armB, metricKey);
  const aBetter = a !== null && b !== null && (better === 'high' ? a > b : a < b);
  const bBetter = a !== null && b !== null && (better === 'high' ? b > a : b < a);
  const suffix = metricKey === 'tokens_per_effective_decision' ? '' : '%';
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 border border-white/[0.06] bg-white/[0.018] px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_7rem]">
      <strong className={`text-right font-display text-base font-normal ${aBetter ? 'text-sky-200' : 'text-paper/60'}`}>{formatMetric(a, suffix)}</strong>
      <span className="min-w-0 text-center">
        <span className="block font-display text-xs text-paper/85">{label}</span>
        <span className="hidden text-[9px] text-ink-muted sm:block">{detail}</span>
      </span>
      <strong className={`font-display text-base font-normal ${bBetter ? 'text-amber-200' : 'text-paper/60'}`}>{formatMetric(b, suffix)}</strong>
    </div>
  );
}

function BreakdownTables({ stats }: { stats: StatsResponse }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <Breakdown title="同场模型观察" rows={stats.model_stats} />
      <Breakdown title="同场性格观察" rows={stats.personality_stats} />
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: PerformanceStat[] }) {
  const sorted = [...rows].sort((a, b) => (b.behavior?.score || 0) - (a.behavior?.score || 0));
  return (
    <div className="border border-white/10 bg-stage-deep p-4 sm:p-5">
      <h3 className="font-display text-lg text-paper">{title}</h3>
      <p className="mt-1 text-[10px] text-ink-muted">该切片聚合 A/B 两版，只用于观察模型或性格差异，不代替版本对比。</p>
      <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.07]">
        {sorted.length ? sorted.slice(0, 8).map((row) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 py-2.5">
            <span className="truncate font-display text-sm text-paper/80">{row.label}</span>
            <span className="text-right font-label text-[10px] text-paper/60">胜率 {(row.balanced_win_rate ?? row.win_rate).toFixed(1)}%</span>
            <span className="text-right font-label text-[10px] text-[#ffe16d]">行为 {formatNumber(row.behavior?.score)}</span>
          </div>
        )) : <p className="py-6 text-center text-xs text-ink-muted">暂无完整样本</p>}
      </div>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#080d12]/90 px-4 py-3"><p className="font-label text-[9px] tracking-[0.13em] text-ink-muted">{label}</p><p className="mt-1 font-display text-lg text-paper">{value}</p></div>;
}

function metricValue(arm: PromptExperimentArm, key: keyof BehaviorMetrics | 'balanced_win_rate') {
  if (key === 'balanced_win_rate') return arm.balanced_win_rate;
  const value = arm.behavior[key];
  return typeof value === 'number' ? value : null;
}

function formatMetric(value: number | null, suffix: string) {
  return value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toFixed(1) : '—';
}

function statusLabel(status: string) {
  return ({ running: '运行中', initialized: '已就绪', completed: '已完成', stopped: '已停止', error: '异常', paused: '已暂停' } as Record<string, string>)[status] || status;
}

function statusClass(status: string) {
  if (status === 'completed') return 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200';
  if (status === 'running' || status === 'initialized') return 'border-sky-400/25 bg-sky-400/[0.07] text-sky-200';
  if (status === 'error') return 'border-crimson/35 bg-crimson/10 text-red-200';
  return 'border-white/12 bg-white/[0.03] text-ink-muted';
}
