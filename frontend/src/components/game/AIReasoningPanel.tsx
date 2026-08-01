interface Props {
  playerId: string;
  reasoning: string;
  kind?: 'speech' | 'kill' | 'investigate' | 'vote';
}

const KIND_TAG: Record<NonNullable<Props['kind']>, string> = {
  speech: '发言判断',
  kill: '袭击判断',
  investigate: '查验判断',
  vote: '投票判断',
};

export default function AIReasoningPanel({ playerId, reasoning, kind }: Props) {
  return (
    <div className="ai-reasoning-panel mt-1.5 px-2.5 py-1.5">
      <div className="mb-0.5 flex items-center gap-1.5 font-label text-[10px] tracking-[0.12em] text-ink-muted">
        <span className="text-antique-gold/80">决策手记</span>
        <span>· {playerId}</span>
        {kind && <span>{KIND_TAG[kind]}</span>}
      </div>
      <p className="font-body text-[12px] leading-[1.6] text-paper/75">{reasoning}</p>
    </div>
  );
}
