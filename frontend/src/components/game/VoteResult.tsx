/**
 * 投票结果展示:票数条形 + "谁投谁"明细 + 放逐/平票结果。
 * Nocturne Stage 风格:金/绯红条形 + 玻璃 chip。
 */
import { cn } from '../../utils/cn';
import { avatarColor, playerInitial } from './roleConfig';
import type { PlayerVoteEvent, VoteResultEvent } from '../../types/api';

interface Props {
  votes: PlayerVoteEvent[];
  result?: VoteResultEvent;
}

export default function VoteResult({ votes, result }: Props) {
  // 投票明细优先用 vote_result 里的 vote_detail（voter->target，含弃票），
  // 回退到 player_vote 事件数组。
  const detail: Record<string, string> = result?.data.vote_detail
    ? result.data.vote_detail
    : Object.fromEntries(votes.map((v) => [v.data.voter, v.data.target]));

  // 票数汇总（只统计有效投票，弃票不计入得票数）
  const counts: Record<string, number> = {};
  for (const target of Object.values(detail)) {
    if (target && target !== 'abstain') counts[target] = (counts[target] || 0) + 1;
  }
  const maxVotes = Math.max(1, ...Object.values(counts));
  const eliminated = result?.data.result === 'eliminated' ? result.data.eliminated : undefined;
  const tieCandidates =
    result?.data.result === 'tie' || result?.data.result === 'no_elimination'
      ? result.data.candidates
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* 票数条形 */}
      {Object.keys(counts).length > 0 && (
        <div className="flex flex-col gap-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([target, n]) => {
              const isOut = target === eliminated;
              return (
                <div key={target} className="flex items-center gap-2">
                  <span className="font-body text-body-md text-[#d3e4fe] w-20 truncate">{target}</span>
                  <div className="flex-1 h-5 bg-[#0b1c30]/60 rounded overflow-hidden border border-[#47464b]/20">
                    <div
                      className={cn(
                        'h-full rounded transition-all flex items-center justify-end pr-2',
                        isOut
                          ? 'bg-gradient-to-r from-[#eb2445]/60 to-[#eb2445]/80'
                          : 'bg-gradient-to-r from-[#64748b]/50 to-[#64748b]/70',
                      )}
                      style={{ width: `${(n / maxVotes) * 100}%` }}
                    >
                      <span className="font-label text-label-sm text-white font-bold">{n}</span>
                    </div>
                  </div>
                  {isOut && (
                    <span className="font-label text-label-sm text-[#ffb3b3] w-10 uppercase tracking-wider">
                      出局
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* 谁投谁（含弃票） */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(detail).map(([voter, target]) => {
          const isAbstain = target === 'abstain' || !target;
          return (
            <span
              key={voter}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-label border',
                isAbstain
                  ? 'bg-[#1b2b3f]/40 border-[#47464b]/20 text-[#64748b]'
                  : 'bg-[#1b2b3f]/60 border-[#47464b]/30',
              )}
            >
              <span
                className={cn(
                  'w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold',
                  avatarColor(voter),
                )}
              >
                {playerInitial(voter).slice(-1)}
              </span>
              <span className="text-[#d3e4fe]">{voter}</span>
              {isAbstain ? (
                <span className="text-[#64748b]">弃票</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[12px] text-[#e9c400]/70">arrow_forward</span>
                  <span className="text-[#d3e4fe]">{target}</span>
                </>
              )}
            </span>
          );
        })}
      </div>

      {/* 结果文字 */}
      {tieCandidates && (result?.data.result === 'tie' || result?.data.result === 'no_elimination') && (
        <div className="font-body text-body-md text-[#ffe16d] bg-[#e9c400]/10 border border-[#e9c400]/30 rounded-md px-3 py-1.5">
          ⚖ 平票({tieCandidates.join(' vs ')}),无人出局
        </div>
      )}
      {result?.data.result === 'no_votes' && (
        <div className="font-body text-body-md text-[#c8c5cb] bg-[#1b2b3f]/60 rounded-md px-3 py-1.5">
          无人投票
        </div>
      )}
      {result?.data.result === 'idiot_revealed' && (
        <div className="font-body text-body-md text-pink-200 bg-pink-500/10 border border-pink-500/30 rounded-md px-3 py-1.5">
          🃏 {result.data.player} 翻牌为白痴，免于放逐但失去投票权
        </div>
      )}
    </div>
  );
}
