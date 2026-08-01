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
  const claim = claimRoleLabel(claim_role);
  const realRole = roleAssignment?.[speaker];
  const isLying = Boolean(
    claim_role !== 'none' &&
      realRole &&
      claim_role !== realRole &&
      realRole !== 'villager',
  );
  const realRoleConfig = realRole ? getRoleConfig(realRole) : null;

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

          {time && <span className="ml-auto font-label text-[10px] text-ink-muted/60">{time}</span>}
        </div>

        <div className="border-l-2 border-antique-gold/35 bg-white/[0.035] px-3 py-2 font-body text-[13px] leading-[1.6] text-paper/90">
          {content}
        </div>
      </div>
    </div>
  );
}
