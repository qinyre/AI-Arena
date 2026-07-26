/**
 * 结果面板:游戏结束后的复盘,放在整个页面底部(三栏布局下方,页面级区块)。
 * 不挤压三栏,往下滚整个页面即可看到。Nocturne Stage 风格:玻璃卡 + 金/绯红胜方色。
 */
import { cn } from '../../utils/cn';
import { getRoleConfig, avatarColor, playerInitial } from './roleConfig';
import type { GameResultResponse, GameStatusResponse } from '../../types/api';
import GameReviewPanel from './GameReviewPanel';

interface Props {
  result: GameResultResponse | null;
  status: GameStatusResponse | null;
  onReviewGenerated?: (review: NonNullable<GameResultResponse['ai_review']>) => void;
}

/** 后端 reason 是蛇形枚举,这里映射成人类可读中文 */
function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    werewolves_outnumber_villagers: '狼人数量已超过好人,无法翻盘',
    all_werewolves_eliminated: '所有狼人已被找出并放逐',
    all_villagers_or_gods_eliminated: '全部平民或全部神职已经出局',
    werewolf_kill_completed_edge: '狼刀率先完成屠边',
    wolf_skill_completed_edge: '狼方技能结算后完成屠边',
  };
  return map[reason] || reason;
}

export default function ResultPanel({ result, status, onReviewGenerated }: Props) {
  if (!result) return null;

  const winnerGood = result.winner === 'good';
  const roleAssignment = status?.role_assignment || {};

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
            winnerGood
              ? 'bg-[#e9c400]/10 border-[#e9c400]/40'
              : 'bg-[#eb2445]/10 border-[#eb2445]/40',
          )}
        >
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="font-label text-label-md text-[#c8c5cb] uppercase tracking-wider">胜利方</span>
            <span
              className={cn(
                'px-3 py-1 rounded-full font-label text-label-md uppercase tracking-wider shrink-0',
                winnerGood ? 'bg-[#e9c400] text-[#0a0a0f]' : 'bg-[#eb2445] text-white',
              )}
            >
              {winnerGood ? '👥 好人阵营' : '🐺 狼人阵营'}
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
            <div className="font-label text-label-sm text-[#c8c5cb]/60 mb-1 uppercase tracking-wider">总成本</div>
            <div className="font-display text-title-md text-[#ffe16d]">
              ${result.total_cost.toFixed(4)}
            </div>
          </div>
        </div>

        {/* 各玩家成本 + 身份 */}
        <div>
          <h4 className="font-label text-label-sm text-[#c8c5cb]/60 mb-2 uppercase tracking-wider">
            玩家成本与身份
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
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold',
                        avatarColor(player),
                      )}
                    >
                      {playerInitial(player)}
                    </div>
                    <span className="font-body text-body-md text-[#d3e4fe] flex-1">{player}</span>
                    {rc && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-label uppercase tracking-wider', rc.badgeClass)}>
                        {rc.icon} {rc.label}
                      </span>
                    )}
                    <span className="font-label text-body-md text-[#ffe16d] w-16 text-right">
                      ${cost.toFixed(4)}
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
          onReviewGenerated={onReviewGenerated}
        />
      </div>
    </div>
  );
}
