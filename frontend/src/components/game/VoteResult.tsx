/**
 * 投票结果展示：票数条形 + "谁投谁"明细 + 放逐/平票结果。
 */
import { cn } from '../../utils/cn';
import { avatarColor } from './roleConfig';
import type { PlayerVoteEvent, VoteResultEvent } from '../../types/api';

interface Props {
  votes: PlayerVoteEvent[];
  result?: VoteResultEvent;
}

export default function VoteResult({ votes, result }: Props) {
  // 票数汇总
  const counts: Record<string, number> = {};
  for (const v of votes) {
    counts[v.data.target] = (counts[v.data.target] || 0) + 1;
  }
  const maxVotes = Math.max(1, ...Object.values(counts));
  const eliminated = result?.data.result === 'eliminated' ? result.data.eliminated : undefined;
  const tieCandidates = result?.data.result === 'tie' ? result.data.candidates : undefined;

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* 票数条形 */}
      {Object.keys(counts).length > 0 && (
        <div className="space-y-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([target, n]) => {
              const isOut = target === eliminated;
              return (
                <div key={target} className="flex items-center gap-2">
                  <span className="text-xs text-gray-300 w-16 truncate">{target}</span>
                  <div className="flex-1 h-5 bg-gray-700/50 rounded overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded transition-all flex items-center justify-end pr-2',
                        isOut ? 'bg-red-500/70' : 'bg-gray-500/60',
                      )}
                      style={{ width: `${(n / maxVotes) * 100}%` }}
                    >
                      <span className="text-[11px] font-bold text-white">{n}</span>
                    </div>
                  </div>
                  {isOut && <span className="text-xs text-red-300 w-8">出局</span>}
                </div>
              );
            })}
        </div>
      )}

      {/* 谁投谁 */}
      <div className="flex flex-wrap gap-1.5">
        {votes.map((v, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-[11px] bg-gray-700/40 px-1.5 py-0.5 rounded"
          >
            <span
              className={cn(
                'w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold',
                avatarColor(v.data.voter),
              )}
            >
              {v.data.voter.slice(-1)}
            </span>
            <span className="text-gray-300">{v.data.voter}</span>
            <span className="text-gray-500">→</span>
            <span className="text-gray-300">{v.data.target}</span>
          </span>
        ))}
      </div>

      {/* 结果文字 */}
      {result?.data.result === 'tie' && tieCandidates && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
          ⚖ 平票({tieCandidates.join(' vs ')}),无人出局
        </div>
      )}
      {result?.data.result === 'no_votes' && (
        <div className="text-xs text-gray-400 bg-gray-700/30 rounded px-2 py-1">
          无人投票
        </div>
      )}
    </div>
  );
}
