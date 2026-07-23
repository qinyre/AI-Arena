/**
 * 发言气泡：白天阶段玩家发言的气泡式展示。
 * 含发言者头像、身份声明标签(claim_role)、发言内容。
 */
import { cn } from '../../utils/cn';
import { avatarColor, claimRoleLabel, getRoleConfig } from './roleConfig';
import type { PlayerSpeechEvent } from '../../types/api';

interface Props {
  speech: PlayerSpeechEvent;
  roleAssignment?: Record<string, string>;
}

export default function SpeechBubble({ speech, roleAssignment }: Props) {
  const { speaker, content, claim_role } = speech.data;
  const claim = claimRoleLabel(claim_role);
  const realRole = roleAssignment?.[speaker];
  // 如果发言者声称的角色和真实角色不符，标记"撒谎/伪装"
  const isLying = claim_role !== 'none' && realRole && claim_role !== realRole && realRole !== 'villager'
    ? claim_role !== realRole
    : false;
  const realRc = realRole ? getRoleConfig(realRole) : null;

  return (
    <div className="flex gap-2.5 animate-fade-in-up">
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5',
          avatarColor(speaker),
        )}
      >
        {speaker.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || speaker.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-200">{speaker}</span>
          {realRc && (
            <span className={cn('text-[10px] px-1 py-0.5 rounded', realRc.badgeClass)}>
              {realRc.icon} {realRc.label}
            </span>
          )}
          {claim && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full border',
                isLying
                  ? 'bg-red-500/10 text-red-300 border-red-500/30'
                  : 'bg-gray-600/40 text-gray-300 border-gray-500/30',
              )}
            >
              {isLying && '⚠ '}
              {claim}
            </span>
          )}
        </div>
        <div className="mt-1 bg-gray-750/50 rounded-lg rounded-tl-none px-3 py-2 text-sm text-gray-100 leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
}
