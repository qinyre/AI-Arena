/**
 * 结果面板:游戏结束后的复盘,放在整个页面底部(三栏布局下方,页面级区块)。
 * 不挤压三栏,往下滚整个页面即可看到。Nocturne Stage 风格:玻璃卡 + 金/绯红胜方色。
 */
import { cn } from '../../utils/cn';
import { getRoleConfig } from './roleConfig';
import type { GameResultResponse, GameStatusResponse } from '../../types/api';
import GameReviewPanel from './GameReviewPanel';
import { LobeAvatar } from '../LobeAvatar';
import { apiClient } from '../../api/client';
import { loadModelPresets } from '../../utils/modelPresets';
import { useState } from 'react';

interface Props {
  result: GameResultResponse | null;
  status: GameStatusResponse | null;
  onReviewGenerated?: (review: NonNullable<GameResultResponse['ai_review']>) => void;
  onGameCreated?: (gameId: string) => void;
}

/** 后端 reason 是蛇形枚举,这里映射成人类可读中文 */
function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    werewolves_outnumber_villagers: '狼人数量已超过好人,无法翻盘',
    all_werewolves_eliminated: '所有狼人已被找出并放逐',
    all_villagers_or_gods_eliminated: '全部平民或全部神职已经出局',
    werewolf_kill_completed_edge: '狼刀率先完成屠边',
    wolf_skill_completed_edge: '狼方技能结算后完成屠边',
    max_rounds_reached: '达到最大轮数，双方未分胜负',
  };
  return map[reason] || reason;
}

export default function ResultPanel({
  result,
  status,
  onReviewGenerated,
  onGameCreated,
}: Props) {
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchError, setRematchError] = useState('');
  if (!result) return null;

  const winnerGood = result.winner === 'good';
  const winnerDraw = result.winner === 'draw';
  const roleAssignment = status?.role_assignment || {};
  const customPlayers = new Set(result.custom_model_players);
  const hasCustomModels = customPlayers.size > 0;
  const metrics = result.llm_metrics;
  const successRate = metrics?.total_calls
    ? Math.round((metrics.successful_calls / metrics.total_calls) * 100)
    : 0;
  const factPlayers = Object.entries(result.match_facts?.players ?? {});
  const replayPlayers = 'players' in result.replay_config
    ? result.replay_config.players
    : [];

  const startRematch = async () => {
    if (!('players' in result.replay_config)) return;
    setRematchPending(true);
    setRematchError('');
    try {
      const presets = loadModelPresets();
      const players = result.replay_config.players.map((player) => {
        if (!player.base_url) return player;
        const endpoint = normalizeEndpoint(player.base_url);
        const preset = presets.find((item) => (
          item.model === player.model
          && item.apiFormat === player.api_format
          && normalizeEndpoint(item.baseUrl) === endpoint
        ));
        if (!preset && !player.key_env) {
          throw new Error(`${player.player_id} 的模型预设已不存在，请先在设置中恢复该预设`);
        }
        return {
          ...player,
          ...(preset?.apiKey ? { api_key: preset.apiKey } : {}),
        };
      });
      const created = await apiClient.createGame({
        player_configs: players,
        board_id: result.replay_config.board_id,
        ...(result.replay_config.custom_board
          ? { custom_board: result.replay_config.custom_board }
          : {}),
        enable_sheriff: result.replay_config.enable_sheriff,
        budget_tier: result.replay_config.budget_tier,
        max_rounds: result.replay_config.max_rounds ?? 20,
        parent_game_id: result.game_id,
      });
      onGameCreated?.(created.game_id);
    } catch (error) {
      setRematchError(error instanceof Error ? error.message : '复赛创建失败');
    } finally {
      setRematchPending(false);
    }
  };

  return (
    <div className="glass-panel rounded-lg p-6 animate-fade-in">
      <h3 className="font-display text-headline-lg text-[#d3e4fe] m-0 mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#e9c400]">emoji_events</span>
        对局复盘
      </h3>

      <div className="flex flex-col gap-4">
        {/* 胜方 */}
        <div
          className={cn(
            'p-4 rounded-lg border',
            winnerDraw
              ? 'bg-[#64748b]/10 border-[#64748b]/40'
              : winnerGood
              ? 'bg-[#e9c400]/10 border-[#e9c400]/40'
              : 'bg-[#eb2445]/10 border-[#eb2445]/40',
          )}
        >
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="font-label text-label-md text-[#c8c5cb] uppercase tracking-wider">胜利方</span>
            <span
              className={cn(
                'px-3 py-1 rounded-full font-label text-label-md uppercase tracking-wider shrink-0',
                winnerDraw
                  ? 'bg-[#64748b] text-white'
                  : winnerGood ? 'bg-[#e9c400] text-[#0a0a0f]' : 'bg-[#eb2445] text-white',
              )}
            >
              {winnerDraw ? '⚖ 和局' : winnerGood ? '👥 好人阵营' : '🐺 狼人阵营'}
            </span>
          </div>
          <p className="font-body text-body-md text-[#c8c5cb]">{reasonLabel(result.reason)}</p>
        </div>

        {/* 数据 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#0b1c30]/60 border border-[#47464b]/30 p-3 rounded-lg text-center">
            <div className="font-label text-label-sm text-[#c8c5cb]/60 mb-1 uppercase tracking-wider">总轮次</div>
            <div className="font-display text-title-md text-[#d3e4fe]">{result.final_round}</div>
          </div>
          <div className="bg-[#0b1c30]/60 border border-[#47464b]/30 p-3 rounded-lg text-center">
            <div className="font-label text-label-sm text-[#c8c5cb]/60 mb-1 uppercase tracking-wider">时长</div>
            <div className="font-display text-title-md text-[#d3e4fe]">
              {result.duration_seconds.toFixed(1)}s
            </div>
          </div>
          <div className="bg-[#0b1c30]/60 border border-[#47464b]/30 p-3 rounded-lg text-center">
            <div className="font-label text-label-sm text-[#c8c5cb]/60 mb-1 uppercase tracking-wider">
              {hasCustomModels ? '模型用量' : '总成本'}
            </div>
            <div className="font-display text-title-md text-[#ffe16d]">
              {result.total_cost > 0 && `$${result.total_cost.toFixed(4)}`}
              {result.total_cost > 0 && hasCustomModels && ' · '}
              {hasCustomModels && `${result.custom_tokens.toLocaleString()} tokens`}
              {!hasCustomModels && result.total_cost === 0 && '—'}
            </div>
            <div className="mt-1 font-label text-[9px] text-[#c8c5cb]/35">
              {result.budget_tier === 'economy' ? '节制' : result.budget_tier === 'premium' ? '宽裕' : '标准'}预算
              {' · '}{result.budget_profile.game_token_budget.toLocaleString()} 上限
            </div>
          </div>
        </div>

        {result.series?.series_id && (
          <section className="flex flex-col gap-3 rounded-lg border border-[#c4b5fd]/20 bg-[#c4b5fd]/[0.04] p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-[#c4b5fd]/55">
                Series · 第 {result.series.current_game_number} 局
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-display text-lg text-[#d3e4fe]">阵容系列赛</span>
                <span className="text-sm text-[#c8c5cb]/60">
                  好人 <strong className="text-[#ffe16d]">{result.series.score.good}</strong>
                  <span className="mx-2 text-[#c8c5cb]/20">:</span>
                  狼人 <strong className="text-[#ff8a9d]">{result.series.score.werewolf}</strong>
                  {result.series.score.draw > 0 && (
                    <span className="ml-3">和局 {result.series.score.draw}</span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#c8c5cb]/38">
                复赛沿用板型、玩家模型、头像和性格，重新随机身份与对局进程
              </p>
            </div>
            {replayPlayers.length > 0 && onGameCreated && (
              <button
                type="button"
                onClick={startRematch}
                disabled={rematchPending}
                className="btn-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-50"
              >
                <span className={cn('material-symbols-outlined text-[17px]', rematchPending && 'animate-spin')}>
                  {rematchPending ? 'progress_activity' : 'replay'}
                </span>
                {rematchPending ? '正在开局' : '原阵容再战'}
              </button>
            )}
          </section>
        )}

        {rematchError && (
          <div role="alert" className="border border-[#eb2445]/35 bg-[#eb2445]/10 px-3 py-2 text-xs text-[#ffb3b3]">
            {rematchError}
          </div>
        )}

        {metrics?.total_calls > 0 && (
          <div>
            <h4 className="font-label text-label-sm text-[#c8c5cb]/60 mb-2 uppercase tracking-wider">
              模型运行质量
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ['有效决策', `${successRate}%`],
                ['降级动作', metrics.fallback_calls.toLocaleString()],
                ['本地救回', metrics.repaired_json_calls.toLocaleString()],
                ['平均延迟', `${(metrics.average_latency_ms / 1000).toFixed(1)}s`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="bg-[#0b1c30]/50 border border-[#47464b]/20 px-3 py-2 rounded-md"
                >
                  <div className="font-label text-label-sm text-[#c8c5cb]/55">{label}</div>
                  <div className="font-display text-title-sm text-[#d3e4fe] mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {factPlayers.length > 0 && (
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h4 className="font-label text-label-sm uppercase tracking-wider text-[#c8c5cb]/60">
                  可核验赛后事实
                </h4>
                <p className="mt-1 text-xs text-[#c8c5cb]/40">
                  由完整事件流直接计算，不经过复盘模型
                </p>
              </div>
              <span className="font-label text-[10px] text-[#c4b5fd]/45">
                {result.match_facts.event_count} 个事件
              </span>
            </div>
            <div className="overflow-x-auto rounded-md border border-[#47464b]/25 bg-[#071523]/45">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="bg-[#102034]/80 font-label text-[10px] uppercase tracking-[0.14em] text-[#c8c5cb]/45">
                  <tr>
                    <th className="px-3 py-2 font-normal">玩家</th>
                    <th className="px-3 py-2 font-normal">结局</th>
                    <th className="px-3 py-2 text-center font-normal">发言</th>
                    <th className="px-3 py-2 text-center font-normal">公投</th>
                    <th className="px-3 py-2 text-center font-normal">投狼 / 投好</th>
                    <th className="px-3 py-2 text-center font-normal">弃票</th>
                    <th className="px-3 py-2 text-center font-normal">技能行动</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#47464b]/15">
                  {factPlayers.map(([playerId, fact]) => {
                    const role = getRoleConfig(fact.role);
                    return (
                      <tr key={playerId} className="text-sm text-[#c8c5cb]/70">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <LobeAvatar
                              avatarId={status?.avatar_assignment?.[playerId]}
                              playerId={playerId}
                              className="h-6 w-6 rounded-full text-[10px] font-bold text-white"
                            />
                            <span className="font-display text-[#d3e4fe]">{playerId}</span>
                            <span className={cn('rounded px-1.5 py-0.5 font-label text-[10px]', role.badgeClass)}>
                              {role.icon} {role.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {fact.survived
                            ? <span className="text-[#8de7b0]">存活</span>
                            : <span title={fact.death?.cause}>R{fact.death?.round} 出局</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">{fact.speech_count}</td>
                        <td className="px-3 py-2.5 text-center">{fact.day_votes.cast}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[#ffb3b3]">{fact.day_votes.targets_werewolf}</span>
                          <span className="mx-1 text-[#c8c5cb]/25">/</span>
                          <span>{fact.day_votes.targets_good}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">{fact.day_votes.abstained}</td>
                        <td className="px-3 py-2.5 text-center">{fact.skill_actions.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 各玩家成本 + 身份 */}
        <div>
          <h4 className="font-label text-label-sm text-[#c8c5cb]/60 mb-2 uppercase tracking-wider">
            玩家用量与身份
          </h4>
          <div className="flex flex-col gap-1.5">
            {Object.entries(result.player_costs)
              .sort((a, b) => b[1] - a[1])
              .map(([player, cost]) => {
                const role = roleAssignment[player];
                const rc = role ? getRoleConfig(role) : null;
                return (
                  <div
                    key={player}
                    className="flex items-center gap-2 bg-[#0b1c30]/50 border border-[#47464b]/20 px-3 py-1.5 rounded-md"
                  >
                    <LobeAvatar
                      avatarId={status?.avatar_assignment?.[player]}
                      playerId={player}
                      className="h-6 w-6 rounded-full text-[10px] font-bold text-white"
                    />
                    <span className="font-body text-body-md text-[#d3e4fe] flex-1">{player}</span>
                    {rc && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-label uppercase tracking-wider', rc.badgeClass)}>
                        {rc.icon} {rc.label}
                      </span>
                    )}
                    <span className="font-label text-body-md text-[#ffe16d] min-w-20 text-right">
                      {customPlayers.has(player)
                        ? `${(result.player_tokens[player] || 0).toLocaleString()} tokens`
                        : `$${cost.toFixed(4)}`}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        <GameReviewPanel
          gameId={result.game_id}
          initialReview={result.ai_review}
          roleAssignment={roleAssignment}
          avatarAssignment={status?.avatar_assignment}
          onReviewGenerated={onReviewGenerated}
        />
      </div>
    </div>
  );
}

function normalizeEndpoint(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}
