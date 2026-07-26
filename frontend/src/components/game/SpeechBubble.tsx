/**
 * 发言气泡:白天阶段玩家发言的气泡式展示。
 * 含发言者头像、身份声明标签(claim_role)、发言内容。
 * Nocturne Stage 风格:玻璃质感气泡 + 角色 ring + 撒谎警告。
 */
import { cn } from '../../utils/cn';
import { avatarColor, claimRoleLabel, getRoleConfig, playerInitial } from './roleConfig';
import type { PlayerSpeechEvent } from '../../types/api';

interface Props {
  speech: PlayerSpeechEvent;
  roleAssignment?: Record<string, string>;
  time?: string;
}

export default function SpeechBubble({ speech, roleAssignment, time }: Props) {
  const { speaker, content, claim_role } = speech.data;
  const claim = claimRoleLabel(claim_role);
  const realRole = roleAssignment?.[speaker];
  // 如果发言者声称的角色和真实角色不符,标记"撒谎/伪装"
  const isLying =
    claim_role !== 'none' && realRole && claim_role !== realRole && realRole !== 'villager'
      ? claim_role !== realRole
      : false;
  const realRc = realRole ? getRoleConfig(realRole) : null;

  return (
    <div className="flex gap-2">
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold mt-0.5 ring-1',
          avatarColor(speaker),
          realRc?.ringClass || 'ring-[#47464b]/40',
        )}
      >
        {playerInitial(speaker)}
      </div>
      <div className="min-w-0 flex-1">
        {/* 头部:名字 + 真实身份 + 身份声明 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="font-display text-[13px] text-[#d3e4fe]">{speaker}</span>
          {realRc && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-label uppercase tracking-wider', realRc.badgeClass)}>
              {realRc.icon} {realRc.label}
            </span>
          )}
          {claim && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-label uppercase tracking-wider',
                isLying
                  ? 'bg-[#eb2445]/10 text-[#ffb3b3] border-[#eb2445]/40'
                  : 'bg-[#1b2b3f]/60 text-[#c8c5cb] border-[#47464b]/40',
              )}
            >
              {isLying && (
                <span className="material-symbols-outlined text-[12px]">warning</span>
              )}
              {claim}
            </span>
          )}
          {speech.data.sheriff_campaign && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-[#e9c400]/35 bg-[#e9c400]/10 px-1.5 py-0.5 font-label text-[10px] text-[#ffe16d]">
              <span className="material-symbols-outlined text-[12px]">campaign</span>
              {speech.data.withdrew ? '竞选发言后退水' : '竞选警长'}
            </span>
          )}
          {time && (
            <span className="ml-auto font-label text-[10px] text-[#c8c5cb]/35">
              {time}
            </span>
          )}
        </div>
        <div className="rounded-xl rounded-tl-sm border border-[#64748b]/25 bg-[#13263b]/75 px-3 py-2 font-body text-[13px] leading-[1.55] text-[#d3e4fe] shadow-sm">
          {content}
        </div>
      </div>
    </div>
  );
}
