/**
 * 剧场环绕玩家栏(左/右)。借鉴稿 tarot 牌样式:
 * 🎭 面具水印 + 玻璃拟态 + 角色 glow 边框 + 状态 chip。
 * 上帝视角——开局即显示所有人身份。存活/死亡混排(死亡卡灰掉)。
 *
 * GameView 把玩家按 index 分两半,本组件渲染其中一半(side=left/right)。
 */
import { cn } from '../../utils/cn';
import { REASONING_LABELS, TONE_LABELS } from '../../utils/personalityPresets';
import { getRoleConfig, deathCauseLabel, avatarColor, playerInitial } from './roleConfig';
import type { PersonalityProfile, PlayerWithRole } from '../../types/api';

interface Props {
  players: PlayerWithRole[];
  currentSpeaker: string | null;
  selectedPlayer: string | null;
  onSelectPlayer: (id: string) => void;
  /** 左栏/右栏,仅影响标题对齐(右侧右对齐) */
  side?: 'left' | 'right';
}

export default function PlayerTable({
  players,
  currentSpeaker,
  selectedPlayer,
  onSelectPlayer,
  side = 'left',
}: Props) {
  if (players.length === 0) {
    return (
      <div className="text-center text-[#c8c5cb]/60 py-8 text-sm font-body">
        等待玩家入场...
      </div>
    );
  }

  const aliveCount = players.filter((p) => p.alive).length;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 标题 */}
      <div className={cn('flex items-center gap-2 mb-1', side === 'right' && 'flex-row-reverse')}>
        <span className="material-symbols-outlined text-[20px] text-[#e9c400]/70">theater_comedy</span>
        <h2 className="font-display text-headline-lg text-[#d3e4fe] m-0 leading-none text-[20px]">
          参与者
        </h2>
        <span className="font-label text-label-sm text-[#c8c5cb]/60 ml-auto uppercase tracking-wider">
          {aliveCount}/{players.length} 存活
        </span>
      </div>

      {/* 玩家卡列表 */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar pr-1">
        {players.map((p) => {
          const rc = getRoleConfig(p.role);
          const isSpeaking = p.id === currentSpeaker;
          const isSelected = p.id === selectedPlayer;
          const isDead = !p.alive;

          return (
            <div key={p.id} className="space-y-2">
              <button
                type="button"
                onClick={() => onSelectPlayer(p.id)}
                aria-expanded={isSelected}
                aria-controls={`personality-${p.id}`}
                className={cn(
                  'player-card w-full rounded-lg p-3 flex items-center gap-3 text-left',
                  rc.cardClass,
                  isSpeaking && 'is-speaking',
                  isSelected && 'is-selected',
                  isDead && 'dead',
                )}
              >
              {/* 头像 + 角色 ring */}
              <div className="relative shrink-0">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2',
                    avatarColor(p.id),
                    rc.ringClass,
                  )}
                >
                  {playerInitial(p.id)}
                </div>
                {/* 角色 icon 角标 */}
                <span
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border border-[#0b1c30]"
                  style={{ background: rc.color }}
                  title={rc.label}
                >
                  {rc.icon}
                </span>
              </div>

              {/* 名字 + 角色 */}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'font-display text-[16px] leading-tight truncate',
                    isDead ? 'text-[#c8c5cb]/50 line-through' : 'text-[#d3e4fe]',
                  )}
                >
                  {p.id}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={cn(
                      'inline-block text-[10px] px-1.5 py-0.5 rounded font-label uppercase tracking-wider',
                      rc.badgeClass,
                    )}
                  >
                    {rc.label}
                  </span>
                  {p.isSheriff && (
                    <span
                      title="警长：放逐投票计 1.5 票"
                      className="inline-flex items-center gap-0.5 rounded border border-[#e9c400]/40 bg-[#e9c400]/10 px-1.5 py-0.5 font-label text-[10px] text-[#ffe16d]"
                    >
                      <span className="material-symbols-outlined text-[12px]">military_tech</span>
                      警长
                    </span>
                  )}
                  {isSpeaking && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#ffe16d] font-label uppercase tracking-wider animate-pulse">
                      <span className="material-symbols-outlined text-[12px]">graphic_eq</span>
                      发言
                    </span>
                  )}
                </div>
                {isDead && (
                  <div className="text-[10px] text-[#c8c5cb]/40 mt-0.5 font-label">
                    {deathCauseLabel(p.deathCause)}
                    {p.deathRound ? ` · 第${p.deathRound}轮` : ''}
                  </div>
                )}
              </div>

              {/* 状态 chip */}
                <span
                  className={cn(
                    'shrink-0 px-2 py-0.5 rounded-full font-label text-[10px] uppercase tracking-wider border',
                    isDead
                      ? 'bg-[#1b2b3f] text-[#c8c5cb]/40 border-[#47464b]/30'
                      : 'bg-[#1b2b3f] text-[#d3e4fe] border-[#47464b]/30',
                  )}
                >
                  {isDead ? '死亡' : '存活'}
                </span>
              </button>
              {isSelected && (
                <PersonalityDetails playerId={p.id} personality={p.personality} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonalityDetails({
  playerId,
  personality,
}: {
  playerId: string;
  personality?: PersonalityProfile;
}) {
  const profile = personality ?? {
    name: '标准平衡',
    tone: 'calm' as const,
    reasoning_style: 'evidence' as const,
    risk_tolerance: 3,
    assertiveness: 3,
    verbosity: 3,
  };
  const traits = [
    ['风险', profile.risk_tolerance],
    ['主导', profile.assertiveness],
    ['表达', profile.verbosity],
  ] as const;

  return (
    <section
      id={`personality-${playerId}`}
      aria-label={`${playerId} 的性格档案`}
      className="rounded-lg border border-[#c4b5fd]/25 bg-[#0b1c30]/90 p-3 shadow-[inset_3px_0_0_rgba(196,181,253,0.45)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-label text-[9px] uppercase tracking-[0.24em] text-[#c4b5fd]/70">
          Personality
        </span>
        <span className="material-symbols-outlined text-[16px] text-[#c4b5fd]/55">psychology</span>
      </div>
      <h3 className="mt-1 font-display text-[17px] leading-tight text-[#f0eaff]">{profile.name}</h3>
      <p className="mt-1 text-[10px] text-[#c8c5cb]/60">
        {TONE_LABELS[profile.tone]} · {REASONING_LABELS[profile.reasoning_style]}
      </p>
      <div className="mt-3 space-y-2">
        {traits.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[28px_1fr_12px] items-center gap-2">
            <span className="font-label text-[9px] text-[#c8c5cb]/55">{label}</span>
            <span className="h-1 overflow-hidden rounded-full bg-[#1b2b3f]">
              <span
                className="block h-full rounded-full bg-[#c4b5fd]"
                style={{ width: `${value * 20}%` }}
              />
            </span>
            <b className="font-label text-[9px] text-[#d3e4fe]">{value}</b>
          </div>
        ))}
      </div>
      {!personality && (
        <p className="mt-2 text-[9px] leading-relaxed text-[#c8c5cb]/40">
          未指定预设，采用默认决策与表达风格。
        </p>
      )}
    </section>
  );
}
