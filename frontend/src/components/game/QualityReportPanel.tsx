import { useMemo, useState } from 'react';
import type {
  GameQualityReport,
  QualityCategory,
  QualityFinding,
} from '../../types/api';
import { cn } from '../../utils/cn';

interface Props {
  report: GameQualityReport;
  onLocateEvent?: (eventIndex: number) => void;
}

const severityMeta = {
  error: { label: '错误', icon: 'error', color: '#ff7b72' },
  warning: { label: '警告', icon: 'warning', color: '#e7bd6d' },
  info: { label: '观察', icon: 'visibility', color: '#8fb8df' },
};

export default function QualityReportPanel({ report, onLocateEvent }: Props) {
  const [category, setCategory] = useState<QualityCategory | 'all'>('all');
  const [showObservations, setShowObservations] = useState(true);
  const findings = useMemo(() => report.findings.filter((finding) => (
    (category === 'all' || finding.category === category)
    && (showObservations || finding.severity !== 'info')
  )), [category, report.findings, showObservations]);
  const statusLabel = report.status === 'passed'
    ? '规则链完整'
    : report.status === 'failed' ? '发现确定性漏洞' : '存在质量风险';
  const accent = report.status === 'passed'
    ? '#73d7a2'
    : report.status === 'failed' ? '#ff7b72' : '#e7bd6d';
  const reliability = report.metrics.reliability;
  const personality = report.metrics.personality;

  return (
    <section
      id="quality-report"
      className="relative overflow-hidden border border-[#d8c18e]/15 bg-[#071018]/80"
      style={{ boxShadow: `inset 3px 0 0 ${accent}99` }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-20"
        style={{ background: `linear-gradient(120deg, ${accent}22, transparent 64%)` }}
      />
      <div className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="border-b border-white/[0.07] pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <p className="font-label text-[9px] uppercase tracking-[0.28em] text-[#d8c18e]/55">
            Deterministic Match Audit
          </p>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-display text-6xl leading-none" style={{ color: accent }}>
              {report.score}
            </span>
            <span className="mb-1 font-label text-[10px] tracking-[0.12em] text-[#aaa79f]/50">
              / 100
            </span>
          </div>
          <h4 className="mt-3 font-display text-xl text-[#e6dfd2]">{statusLabel}</h4>
          <p className="mt-1 text-xs leading-relaxed text-[#aaa79f]/55">
            基于完整事件流直接检查，不调用复盘模型，也不会产生 Token 消耗。
          </p>

          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden border border-white/[0.06] bg-white/[0.06]">
            {([
              ['error', report.summary.error],
              ['warning', report.summary.warning],
              ['info', report.summary.info],
            ] as const).map(([severity, count]) => (
              <div key={severity} className="bg-[#09141d] px-2 py-2.5 text-center">
                <strong
                  className="block font-display text-lg"
                  style={{ color: severityMeta[severity].color }}
                >
                  {count}
                </strong>
                <span className="font-label text-[9px] tracking-wider text-[#aaa79f]/45">
                  {severityMeta[severity].label}
                </span>
              </div>
            ))}
          </div>

          <dl className="mt-4 space-y-2 text-xs">
            <Metric label="通过检查" value={`${report.summary.checks_passed}/${report.summary.checks_total}`} />
            <Metric
              label="有效决策"
              value={reliability?.total_calls
                ? `${Math.round((1 - reliability.fallback_rate) * 100)}%`
                : '—'}
            />
            <Metric
              label="Token 占用"
              value={reliability?.token_budget_ratio != null
                ? `${Math.round(reliability.token_budget_ratio * 100)}%`
                : '—'}
            />
            <Metric
              label="性格可评估"
              value={personality?.configured_players
                ? `${personality.evaluated_players}/${personality.configured_players}`
                : '未配置'}
            />
          </dl>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl text-[#e6dfd2]">自动对局质检</h3>
              <p className="mt-1 text-xs text-[#aaa79f]/50">
                确定性错误直接判定；重复、立场和性格仅作为启发式观察，不等同规则漏洞。
              </p>
            </div>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 border border-white/10 px-3 text-[11px] text-[#aaa79f]/65">
              <input
                type="checkbox"
                checked={showObservations}
                onChange={(event) => setShowObservations(event.target.checked)}
                className="accent-[#b99758]"
              />
              显示观察项
            </label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {report.checks.map((check) => {
              const active = category === check.category;
              const checkColor = check.status === 'passed'
                ? '#73d7a2'
                : check.status === 'failed' ? '#ff7b72' : '#e7bd6d';
              return (
                <button
                  key={check.category}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(active ? 'all' : check.category)}
                  className={cn(
                    'min-h-16 border px-3 py-2 text-left transition-colors',
                    active
                      ? 'border-[#d8c18e]/35 bg-[#d8c18e]/[0.08]'
                      : 'border-white/[0.07] bg-[#0b1721]/65 hover:border-white/15',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm text-[#dfd8cc]">{check.label}</span>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: checkColor, boxShadow: `0 0 10px ${checkColor}99` }}
                    />
                  </span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-[#aaa79f]/45">
                    {check.finding_count ? `${check.finding_count} 项记录` : '未发现异常'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            {findings.length === 0 ? (
              <div className="border border-[#73d7a2]/20 bg-[#73d7a2]/[0.04] px-4 py-7 text-center">
                <span className="material-symbols-outlined text-2xl text-[#73d7a2]">verified</span>
                <p className="mt-1 font-display text-[#dce9df]">当前筛选没有发现问题</p>
              </div>
            ) : findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                onLocateEvent={onLocateEvent}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
      <dt className="text-[#aaa79f]/50">{label}</dt>
      <dd className="font-label text-[#dfd8cc]/80">{value}</dd>
    </div>
  );
}

function FindingRow({
  finding,
  onLocateEvent,
}: {
  finding: QualityFinding;
  onLocateEvent?: (eventIndex: number) => void;
}) {
  const meta = severityMeta[finding.severity];
  return (
    <article className="group flex gap-3 border border-white/[0.07] bg-[#0b1721]/55 p-3 transition-colors hover:border-white/[0.13]">
      <span
        className="material-symbols-outlined mt-0.5 text-[18px]"
        style={{ color: meta.color }}
        aria-hidden="true"
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="font-display text-[15px] text-[#e1dbd0]">{finding.title}</h5>
          {finding.confidence === 'heuristic' && (
            <span className="border border-[#8fb8df]/20 px-1.5 py-0.5 font-label text-[9px] tracking-wider text-[#8fb8df]/65">
              启发式
            </span>
          )}
          {finding.round != null && (
            <span className="font-label text-[9px] text-[#aaa79f]/40">R{finding.round}</span>
          )}
          {finding.player_id && (
            <span className="font-label text-[9px] text-[#d8c18e]/55">{finding.player_id}</span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#aaa79f]/62">{finding.detail}</p>
      </div>
      {finding.event_index != null && onLocateEvent && (
        <button
          type="button"
          onClick={() => onLocateEvent(finding.event_index!)}
          className="min-h-9 shrink-0 self-center border-l border-white/[0.08] pl-3 font-label text-[10px] tracking-wider text-[#d8c18e]/65 transition-colors hover:text-[#f2d999]"
          title={`跳转到事件 #${finding.event_index}`}
        >
          定位 #{finding.event_index}
        </button>
      )}
    </article>
  );
}
