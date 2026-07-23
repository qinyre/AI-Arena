import AIReasoningBox from './AIReasoningBox';

export default {
  title: 'Components/AIReasoningBox',
  component: AIReasoningBox,
};

const sampleReasoning = '根据当前局势分析，玩家3在昨晚的发言中多次强调自己的好人身份，这种过度防御的态度很可疑。同时，玩家5一直保持沉默，可能是在隐藏身份。综合考虑投票趋势和发言内容，我认为玩家3的威胁更大。';

export const Default = () => (
  <div className="bg-gray-900 p-8">
    <AIReasoningBox
      reasoning={sampleReasoning}
      isExpanded={true}
    />
  </div>
);

export const WithTypewriterEffect = () => (
  <div className="bg-gray-900 p-8">
    <AIReasoningBox
      reasoning={sampleReasoning}
      isExpanded={true}
      typewriterEffect={true}
      typewriterSpeed={20}
    />
  </div>
);

export const ShortReasoning = () => (
  <div className="bg-gray-900 p-8">
    <AIReasoningBox
      reasoning="玩家3行为可疑，选择击杀。"
      isExpanded={true}
    />
  </div>
);

export const LongReasoning = () => (
  <div className="bg-gray-900 p-8">
    <AIReasoningBox
      reasoning="这是一段很长的推理内容。根据游戏进程，我们已经进入了第三轮白天。从目前的局势来看，狼人阵营处于劣势，必须尽快击杀关键角色。玩家3在昨天的发言中表现出明显的领导能力，很可能是预言家或者村长。同时，玩家5和玩家7之间的互相指责让我怀疑他们都是好人，正在互相消耗。综合以上分析，我决定今晚击杀玩家3，削弱好人阵营的组织能力。"
      isExpanded={true}
    />
  </div>
);

export const Collapsed = () => (
  <div className="bg-gray-900 p-8">
    <p className="text-white mb-4">推理内容被折叠时不显示（组件返回 null）</p>
    <AIReasoningBox
      reasoning={sampleReasoning}
      isExpanded={false}
    />
    <p className="text-gray-500 mt-4">↑ 上方应该是空的</p>
  </div>
);

export const InEventContext = () => (
  <div className="bg-gray-900 p-8">
    <div className="border border-red-700 bg-red-900/30 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔪</span>
        <div className="flex-1">
          <div className="font-medium text-white">狼人击杀</div>
          <div className="text-sm text-gray-400 mt-1">目标: 玩家3</div>
          <AIReasoningBox
            reasoning={sampleReasoning}
            isExpanded={true}
          />
        </div>
      </div>
    </div>
  </div>
);
