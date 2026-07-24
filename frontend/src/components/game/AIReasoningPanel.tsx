/**
 * 内联 AI 推理面板(借鉴稿 ai-reasoning-panel):
 * 玻璃拟态深紫蓝渐变背景 + 左侧金色 2px 边 + 扫描线动画。
 * 🎭 图标 + 「内心独白 - 玩家X」(DM Sans 大写)+ 引用斜体推理(金色引号)。
 *
 * 嵌入时间线事件内,点击「揭开 AI 推理」展开。
 */
import { cn } from '../../utils/cn';
import { avatarColor, playerInitial } from './roleConfig';

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
    <div className="ai-reasoning-panel rounded-lg p-4 ml-4 backdrop-blur-md animate-fade-in">
      <div className="flex items-start gap-3">
        {/* 🎭 图标 + 头像 */}
        <div className="relative shrink-0">
          <div
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold',
              avatarColor(playerId),
            )}
          >
            {playerInitial(playerId)}
          </div>
          <span className="absolute -top-1 -right-1 text-sm opacity-70">🎭</span>
        </div>

        <div className="flex flex-col gap-2 min-w-0 flex-1">
          {/* 头部标签 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-label text-label-sm text-[#ffe16d] uppercase tracking-wider font-bold">
              内心独白
            </span>
            <span className="font-label text-label-sm text-[#c8c5cb]/60">
              · {playerId}
            </span>
            {kind && KIND_TAG[kind] && (
              <span className="px-2 py-0.5 rounded-full bg-[#102034] text-[#c8c5cb] font-label text-[10px] uppercase tracking-wider">
                {KIND_TAG[kind]}
              </span>
            )}
          </div>

          {/* 引用斜体推理 */}
          <p className="font-body text-body-md text-[#d3e4fe]/90 italic border-l border-[#47464b]/40 pl-4 leading-relaxed">
            <span className="text-[#ffe16d]">“</span>
            {reasoning}
            <span className="text-[#ffe16d]">”</span>
          </p>
        </div>
      </div>
    </div>
  );
}
