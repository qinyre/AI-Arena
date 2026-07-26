/** 常驻内联的完整 AI 推理，弱化视觉层级但不截断内容。 */

interface Props {
  playerId: string;
  reasoning: string;
  /** 可选:推理类型标签(刀/查/投/言) */
  kind?: 'speech' | 'kill' | 'investigate' | 'vote';
}

const KIND_TAG: Record<string, string> = {
  speech: '发言决策',
  kill: '袭击决策',
  investigate: '查验决策',
  vote: '投票决策',
};

export default function AIReasoningPanel({ playerId, reasoning, kind }: Props) {
  return (
    <div className="mt-1.5 rounded-md border-l-2 border-[#e9c400]/45 bg-[#0b1c30]/55 px-2.5 py-1.5">
      <div className="mb-0.5 flex items-center gap-1.5 font-label text-[9px] uppercase tracking-wider">
        <span className="text-[#ffe16d]/75">AI 推理</span>
        <span className="text-[#c8c5cb]/40">· {playerId}</span>
        {kind && KIND_TAG[kind] && (
          <span className="text-[#c8c5cb]/40">{KIND_TAG[kind]}</span>
        )}
      </div>
      <p className="font-body text-[11px] leading-[1.45] text-[#b9c9dc]/70">
        {reasoning}
      </p>
    </div>
  );
}
