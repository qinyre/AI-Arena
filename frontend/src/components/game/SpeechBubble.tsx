import { cn } from '../../utils/cn';
import type { PlayerSpeechEvent } from '../../types/api';
import { claimRoleLabel, getRoleConfig } from './roleConfig';
import { LobeAvatar } from '../LobeAvatar';

interface Props {
  speech: PlayerSpeechEvent;
  roleAssignment?: Record<string, string>;
  avatarAssignment?: Record<string, string>;
  time?: string;
}

export default function SpeechBubble({ speech, roleAssignment, avatarAssignment, time }: Props) {
  const { speaker, content, claim_role } = speech.data;
  const { suspects = [], trusted = [], intended_vote, role_reads = {}, evidence_event_indexes = [] } = speech.data;
  const claim = claimRoleLabel(claim_role);
  const realRole = roleAssignment?.[speaker];
  const isLying = Boolean(
    claim_role !== 'none' &&
      realRole &&
      claim_role !== realRole &&
      realRole !== 'villager',
  );
  const realRoleConfig = realRole ? getRoleConfig(realRole) : null;
  const hasPublicStance = Boolean(
    suspects.length || trusted.length || intended_vote || Object.keys(role_reads).length || evidence_event_indexes.length,
  );

  return (
    <div className="flex gap-2.5">
      <LobeAvatar
        avatarId={avatarAssignment?.[speaker]}
        playerId={speaker}
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold text-paper ring-1',
          realRoleConfig?.ringClass || 'ring-white/15',
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="font-display text-[13px] text-paper">{speaker}</span>

          {realRoleConfig && (
            <span className={cn('rounded-sm px-1.5 py-0.5 font-label text-[10px]', realRoleConfig.badgeClass)}>
              {realRoleConfig.icon} {realRoleConfig.label}
            </span>
          )}

          {claim && (
            <span
              className={cn(
                'border px-1.5 py-0.5 font-label text-[10px]',
                isLying
                  ? 'border-crimson/35 bg-crimson/10 text-[#d9877f]'
                  : 'border-white/10 bg-white/[0.03] text-ink-muted',
              )}
            >
              {isLying ? `伪装 · ${claim}` : claim}
            </span>
          )}

          {speech.data.sheriff_campaign && (
            <span className="border border-antique-gold/25 bg-antique-gold/[0.06] px-1.5 py-0.5 font-label text-[10px] text-antique-gold">
              {speech.data.withdrew ? '竞选发言后退水' : '竞选警长'}
            </span>
          )}

          {speech.data.sheriff_summary && (
            <span className="border border-antique-gold/25 bg-antique-gold/[0.06] px-1.5 py-0.5 font-label text-[10px] text-antique-gold">
              警长归票 · {speech.data.nomination}
            </span>
          )}

          {speech.data.last_words && (
            <span className="border border-slate-400/25 bg-slate-400/[0.06] px-1.5 py-0.5 font-label text-[10px] text-slate-300">
              最后陈词
            </span>
          )}

          {time && <span className="ml-auto font-label text-[10px] text-ink-muted/60">{time}</span>}
        </div>

        <div className="border-l-2 border-antique-gold/35 bg-white/[0.035] px-3 py-2 font-body text-[13px] leading-[1.6] text-paper/90">
          {content}
        </div>

        {hasPublicStance && (
          <div
            aria-label={`${speaker} 的公开立场`}
            className="mt-1.5 flex flex-wrap gap-1 border-l border-white/10 pl-2 font-label text-[9px]"
          >
            {suspects.map((player) => (
              <span key={`suspect-${player}`} className="border border-crimson/25 bg-crimson/[0.06] px-1.5 py-0.5 text-red-200/80">
                怀疑 · {player}
              </span>
            ))}
            {trusted.map((player) => (
              <span key={`trusted-${player}`} className="border border-emerald-400/20 bg-emerald-400/[0.05] px-1.5 py-0.5 text-emerald-200/75">
                信任 · {player}
              </span>
            ))}
            {intended_vote && (
              <span className="border border-antique-gold/25 bg-antique-gold/[0.06] px-1.5 py-0.5 text-antique-gold/85">
                计划票 · {intended_vote === 'abstain' ? '弃票' : intended_vote}
              </span>
            )}
            {Object.entries(role_reads).map(([player, role]) => (
              <span key={`read-${player}`} className="border border-sky-300/20 bg-sky-300/[0.05] px-1.5 py-0.5 text-sky-100/75">
                {player} · {roleReadLabel(role)}
              </span>
            ))}
            {evidence_event_indexes.length > 0 && (
              <span className="px-1.5 py-0.5 text-ink-muted/70">
                依据 {evidence_event_indexes.map((index) => `#${index}`).join(' · ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function roleReadLabel(role: string) {
  if (role === 'good') return '好人';
  if (role === 'unknown') return '未知';
  return getRoleConfig(role).label;
}
