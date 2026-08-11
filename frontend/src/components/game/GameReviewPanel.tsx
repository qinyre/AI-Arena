import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../api/client';
import type { GameReview, GameReviewRequest, ProvidersResponse } from '../../types/api';
import { loadModelPresets } from '../../utils/modelPresets';
import { cn } from '../../utils/cn';
import { getRoleConfig } from './roleConfig';
import { LobeAvatar } from '../LobeAvatar';

interface Props {
  gameId: string;
  initialReview?: GameReview;
  roleAssignment: Record<string, string>;
  avatarAssignment?: Record<string, string>;
  onReviewGenerated?: (review: GameReview) => void;
}

interface ReviewModelOption {
  id: string;
  label: string;
  request: GameReviewRequest;
}

export default function GameReviewPanel({
  gameId,
  initialReview,
  roleAssignment,
  avatarAssignment,
  onReviewGenerated,
}: Props) {
  const [presets] = useState(loadModelPresets);
  const [providers, setProviders] = useState<ProvidersResponse>();
  const [sourceId, setSourceId] = useState(presets[0] ? `preset:${presets[0].id}` : '');
  const [review, setReview] = useState(initialReview);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient.getProviders()
      .then((value) => {
        if (!cancelled) setProviders(value);
      })
      .catch(() => {
        /* 后端预设不可用时，仍允许使用浏览器里保存的模型预设。 */
      });
    return () => { cancelled = true; };
  }, []);

  const presetOptions = useMemo<ReviewModelOption[]>(() => presets.map((preset) => ({
    id: `preset:${preset.id}`,
    label: `${preset.name} · ${preset.model}`,
    request: {
      api_format: preset.apiFormat,
      base_url: preset.baseUrl,
      model: preset.model,
      ...(preset.apiKey ? { api_key: preset.apiKey } : {}),
    },
  })), [presets]);

  const providerOptions = useMemo<ReviewModelOption[]>(() => (
    Object.entries(providers?.providers ?? {}).flatMap(([providerId, provider]) => (
      provider.models.map((model) => ({
        id: `provider:${providerId}:${model.id}`,
        label: `${provider.display_name} · ${model.id}`,
        request: {
          provider: providerId,
          api_format: provider.protocol,
          model: model.id,
        },
      }))
    ))
  ), [providers]);

  const modelOptions = useMemo(
    () => [...presetOptions, ...providerOptions],
    [presetOptions, providerOptions],
  );

  useEffect(() => {
    if (!modelOptions.some((option) => option.id === sourceId)) {
      setSourceId(modelOptions[0]?.id ?? '');
    }
  }, [modelOptions, sourceId]);

  const generate = async () => {
    const option = modelOptions.find((item) => item.id === sourceId);
    if (!option) return;
    if (review && !window.confirm('重新生成会覆盖当前复盘并产生一次模型调用，继续吗？')) return;

    setLoading(true);
    setError(null);
    try {
      const generated = await apiClient.generateGameReview(gameId, option.request);
      setReview(generated);
      onReviewGenerated?.(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '复盘生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-2 overflow-hidden rounded-lg border border-[#e9c400]/25 bg-[#081624]/70">
      <div className="flex flex-col gap-4 border-b border-[#47464b]/25 bg-[radial-gradient(circle_at_85%_0%,rgba(233,196,0,0.12),transparent_40%)] p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-label text-[11px] uppercase tracking-[0.28em] text-[#e9c400]/65">Post-match intelligence</p>
          <h4 className="mt-1 font-display text-2xl text-[#f6edc8]">AI 复盘室</h4>
          <p className="mt-1 max-w-xl text-sm text-[#c8c5cb]/55">
            由你选择的模型复核全局事件、评选 MVP，并逐一评价所有玩家。
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row md:min-w-[420px]">
          {modelOptions.length > 0 ? (
            <>
              <select
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
                aria-label="复盘模型预设"
                className="select min-w-0 flex-1"
                disabled={loading}
              >
                {presetOptions.length > 0 && (
                  <optgroup label="我的模型预设">
                    {presetOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </optgroup>
                )}
                {providerOptions.length > 0 && (
                  <optgroup label="后端命名 Provider">
                    {providerOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                onClick={generate}
                disabled={loading || !sourceId}
                className="btn-primary inline-flex min-w-[118px] items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={cn('material-symbols-outlined text-[17px]', loading && 'animate-spin')}>
                  {loading ? 'progress_activity' : 'auto_awesome'}
                </span>
                {loading ? '分析中' : review ? '重新生成' : '生成复盘'}
              </button>
            </>
          ) : (
            <p className="rounded border border-[#e9c400]/20 bg-[#e9c400]/5 px-3 py-2 text-xs text-[#ffe16d]/75">
              未找到可用模型，请检查后端 Provider 或在设置中保存模型预设。
            </p>
          )}
        </div>
      </div>

      {modelOptions.length > 0 && (
        <p className="border-b border-[#47464b]/20 px-5 py-2 font-label text-xs text-[#c8c5cb]/40">
          手动触发，会产生一次模型调用；命名 Provider 使用后端环境变量，预设 API Key 仅用于本次请求。
        </p>
      )}

      {error && (
        <div role="alert" className="m-5 flex items-center gap-2 rounded border border-[#eb2445]/35 bg-[#eb2445]/10 px-3 py-2 text-xs text-[#ffb3b3]">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </div>
      )}

      {loading && !review && <ReviewSkeleton />}
      {review ? (
        <ReviewReport
          review={review}
          roleAssignment={roleAssignment}
          avatarAssignment={avatarAssignment}
          dimmed={loading}
        />
      ) : !loading && (
        <div className="grid min-h-[180px] place-items-center p-8 text-center">
          <div>
            <span className="material-symbols-outlined text-[38px] text-[#e9c400]/25">query_stats</span>
            <p className="mt-2 font-display text-lg text-[#d3e4fe]/70">等待赛后裁决</p>
            <p className="mt-1 text-sm text-[#c8c5cb]/45">复盘不会自动生成，额度由你掌控。</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewReport({
  review,
  roleAssignment,
  avatarAssignment,
  dimmed,
}: {
  review: GameReview;
  roleAssignment: Record<string, string>;
  avatarAssignment?: Record<string, string>;
  dimmed: boolean;
}) {
  const players = [...review.player_reviews].sort((a, b) => b.score - a.score);

  return (
    <div className={cn('space-y-5 p-5 transition-opacity', dimmed && 'opacity-40')}>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <article className="rounded-lg border border-[#47464b]/25 bg-[#102034]/70 p-4">
          <span className="font-label text-[11px] uppercase tracking-[0.24em] text-[#c8c5cb]/45">Final verdict</span>
          <h5 className="mt-1 font-display text-xl text-[#d3e4fe]">{review.headline}</h5>
          <p className="mt-2 text-base leading-relaxed text-[#c8c5cb]/75">{review.overview}</p>
        </article>
        <article className="relative overflow-hidden rounded-lg border border-[#e9c400]/40 bg-[#e9c400]/10 p-4">
          <span className="absolute -right-3 -top-3 material-symbols-outlined text-[72px] text-[#e9c400]/10">workspace_premium</span>
          <span className="font-label text-[11px] uppercase tracking-[0.26em] text-[#ffe16d]/70">Match MVP</span>
          <p className="mt-1 font-display text-3xl text-[#fff4b8]">{review.mvp.player_id}</p>
          <p className="relative mt-2 text-sm leading-relaxed text-[#f6edc8]/70">{review.mvp.reason}</p>
        </article>
      </div>

      {review.turning_points.length > 0 && (
        <div>
          <h5 className="mb-3 font-label text-xs uppercase tracking-[0.22em] text-[#c8c5cb]/60">关键转折</h5>
          <div className="grid gap-2 md:grid-cols-2">
            {review.turning_points.map((point, index) => (
              <article key={`${point.round}-${index}`} className="flex gap-3 rounded-md border border-[#47464b]/20 bg-[#0b1c30]/55 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e9c400]/30 font-display text-sm text-[#ffe16d]">
                  R{point.round}
                </span>
                <div>
                  <h6 className="font-display text-base text-[#d3e4fe]">{point.title}</h6>
                  <p className="mt-1 text-sm leading-relaxed text-[#c8c5cb]/60">{point.impact}</p>
                  {point.event_index !== undefined && (
                    <p className="mt-1 font-label text-[10px] text-[#c4b5fd]/50">
                      事件 #{point.event_index + 1}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <div>
        <h5 className="mb-3 font-label text-xs uppercase tracking-[0.22em] text-[#c8c5cb]/60">全员评分</h5>
        <div className="grid gap-2 lg:grid-cols-2">
          {players.map((player, index) => {
            const role = roleAssignment[player.player_id];
            const roleConfig = role ? getRoleConfig(role) : null;
            return (
              <article key={player.player_id} className="rounded-md border border-[#47464b]/20 bg-[#0b1c30]/55 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-4 font-display text-sm text-[#c8c5cb]/40">{index + 1}</span>
                  <LobeAvatar
                    avatarId={avatarAssignment?.[player.player_id]}
                    playerId={player.player_id}
                    className="h-8 w-8 rounded-full text-[10px] font-bold text-white"
                  />
                  <strong className="font-display text-base text-[#d3e4fe]">{player.player_id}</strong>
                  {roleConfig && (
                    <span className={cn('rounded px-1.5 py-0.5 font-label text-[11px]', roleConfig.badgeClass)}>
                      {roleConfig.icon} {roleConfig.label}
                    </span>
                  )}
                  <span className="ml-auto font-display text-2xl text-[#ffe16d]">{player.score}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1b2b3f]">
                  <span className="block h-full rounded-full bg-[#e9c400]" style={{ width: `${player.score}%` }} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#c8c5cb]/70">{player.verdict}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <ReviewList title="亮点" items={player.strengths} color="text-[#8de7b0]" />
                  <ReviewList title="改进" items={player.improvements} color="text-[#ffb3b3]" />
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {review.awards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {review.awards.map((award, index) => (
            <div key={`${award.title}-${index}`} title={award.reason} className="rounded-full border border-[#c4b5fd]/25 bg-[#c4b5fd]/5 px-3 py-1.5 text-sm text-[#d8ccff]">
              <span className="mr-1 text-[#c4b5fd]">◆</span>{award.title} · {award.player_id}
            </div>
          ))}
        </div>
      )}

      <p className="text-right font-label text-[11px] text-[#c8c5cb]/35">
        {review.model} · {review.usage.total_tokens ?? 0} tokens · {new Date(review.generated_at).toLocaleString()}
      </p>
    </div>
  );
}

function ReviewList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <span className={cn('font-label text-[11px] uppercase tracking-wider', color)}>{title}</span>
      <ul className="mt-1 space-y-1 text-xs leading-relaxed text-[#c8c5cb]/60">
        {items.map((item, index) => <li key={index}>· {item}</li>)}
      </ul>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-label="正在生成对局复盘">
      <div className="h-24 animate-pulse rounded-lg bg-[#1b2b3f]/60" />
      <div className="grid gap-2 md:grid-cols-2">
        <div className="h-36 animate-pulse rounded-lg bg-[#1b2b3f]/45" />
        <div className="h-36 animate-pulse rounded-lg bg-[#1b2b3f]/45" />
      </div>
    </div>
  );
}
