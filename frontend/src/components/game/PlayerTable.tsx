import { cn } from '../../utils/cn';
import { REASONING_LABELS, TONE_LABELS } from '../../utils/personalityPresets';
import { avatarColor, deathCauseLabel, getRoleConfig, playerInitial } from './roleConfig';
import type { PersonalityProfile, PlayerWithRole } from '../../types/api';

interface Props {
  players: PlayerWithRole[];
  currentSpeaker: string | null;
  selectedPlayer: string | null;
  onSelectPlayer: (id: string) => void;
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
      <div className="py-8 text-center font-body text-sm text-[#aaa79f]/60">
        等待玩家入场
      </div>
    );
  }

  const aliveCount = players.filter((player) => player.alive).length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        className={cn(
          'mb-1 flex items-end gap-2 border-b border-[#e6dfd2]/[0.08] pb-2',
          side === 'right' && 'flex-row-reverse',
        )}
      >
        <span className="mb-1 h-px w-5 bg-[#b99758]/65" />
        <h2 className="m-0 font-display text-[18px] leading-none tracking-[0.12em] text-[#e6dfd2]">
          席位
        </h2>
        <span className="ml-auto font-label text-[9px] tracking-[0.14em] text-[#aaa79f]/55">
          {aliveCount}/{players.length} 存活
        </span>
      </div>

      <div className="custom-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {players.map((player) => {
          const role = getRoleConfig(player.role);
          const isSpeaking = player.id === currentSpeaker;
          const isSelected = player.id === selectedPlayer;
          const isDead = !player.alive;

          return (
            <div key={player.id} className="space-y-2">
              <button
                type="button"
                onClick={() => onSelectPlayer(player.id)}
                aria-expanded={isSelected}
                aria-controls={`personality-${player.id}`}
                className={cn(
                  'player-card flex w-full items-center gap-3 rounded-sm p-2.5 text-left',
                  role.cardClass,
                  isSpeaking && 'is-speaking',
                  isSelected && 'is-selected',
                  isDead && 'dead',
                )}
              >
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-sm text-xs font-semibold text-[#e6dfd2] ring-1',
                      avatarColor(player.id),
                      role.ringClass,
                    )}
                  >
                    {playerInitial(player.id)}
                  </div>
                  <span
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center border border-[#0d1216] font-display text-[9px] text-[#090d10]"
                    style={{ background: role.color }}
                    title={role.label}
                  >
                    {role.icon}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate font-display text-[15px] leading-tight',
                      isDead ? 'text-[#aaa79f]/50 line-through' : 'text-[#e6dfd2]',
                    )}
                  >
                    {player.id}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-block border px-1.5 py-0.5 font-label text-[9px] tracking-wider',
                        role.badgeClass,
                      )}
                    >
                      {role.label}
                    </span>
                    {player.isSheriff && (
                      <span
                        title="警长的放逐投票计 1.5 票"
                        className="inline-flex items-center gap-0.5 border border-[#b99758]/40 bg-[#b99758]/10 px-1.5 py-0.5 font-label text-[9px] text-[#d7bd8b]"
                      >
                        <span className="material-symbols-outlined text-[11px]">military_tech</span>
                        警长
                      </span>
                    )}
                    {isSpeaking && (
                      <span className="inline-flex items-center gap-1 font-label text-[9px] tracking-wider text-[#d7bd8b]">
                        <span className="h-1 w-1 rounded-full bg-[#b99758]" />
                        发言中
                      </span>
                    )}
                  </div>
                  {isDead && (
                    <div className="mt-1 font-label text-[9px] text-[#aaa79f]/42">
                      {deathCauseLabel(player.deathCause)}
                      {player.deathRound ? ` · 第 ${player.deathRound} 轮` : ''}
                    </div>
                  )}
                </div>

                <span
                  className={cn(
                    'shrink-0 border px-1.5 py-0.5 font-label text-[9px] tracking-wider',
                    isDead
                      ? 'border-[#343b3d]/40 bg-[#12181c] text-[#aaa79f]/35'
                      : 'border-[#343b3d]/70 bg-[#12181c] text-[#aaa79f]/70',
                  )}
                >
                  {isDead ? '出局' : '在场'}
                </span>
              </button>

              {isSelected && (
                <PersonalityDetails playerId={player.id} personality={player.personality} />
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
      className="border border-[#e6dfd2]/10 border-l-[#9870a8]/55 bg-[#0d1216]/95 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-label text-[9px] tracking-[0.18em] text-[#9870a8]/80">
          性格档案
        </span>
        <span className="font-display text-[12px] text-[#9870a8]/55">记</span>
      </div>
      <h3 className="mt-1 font-display text-[17px] leading-tight text-[#e6dfd2]">
        {profile.name}
      </h3>
      <p className="mt-1 text-[10px] text-[#aaa79f]/60">
        {TONE_LABELS[profile.tone]} · {REASONING_LABELS[profile.reasoning_style]}
      </p>
      <div className="mt-3 space-y-2">
        {traits.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[28px_1fr_12px] items-center gap-2">
            <span className="font-label text-[9px] text-[#aaa79f]/55">{label}</span>
            <span className="h-1 overflow-hidden bg-[#182126]">
              <span
                className="block h-full bg-[#9870a8]"
                style={{ width: `${value * 20}%` }}
              />
            </span>
            <b className="font-label text-[9px] text-[#e6dfd2]">{value}</b>
          </div>
        ))}
      </div>
      {!personality && (
        <p className="mt-2 text-[9px] leading-relaxed text-[#aaa79f]/40">
          未指定预设，采用默认决策与表达风格。
        </p>
      )}
    </section>
  );
}
