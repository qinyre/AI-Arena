import { useState, useEffect } from 'react';

interface Props {
  reasoning: string;
  isExpanded: boolean;
  playerName?: string;
}

export default function ReasoningPanel({ reasoning, isExpanded, playerName }: Props) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showMaskSplit, setShowMaskSplit] = useState(false);

  // 面具分裂 + 打字机效果
  useEffect(() => {
    if (isExpanded && displayedText === '') {
      // 先触发面具分裂动画
      setShowMaskSplit(true);

      // 600ms 后开始打字机效果
      setTimeout(() => {
        setIsTyping(true);
        let currentIndex = 0;
        const typingSpeed = 20;

        const interval = setInterval(() => {
          if (currentIndex <= reasoning.length) {
            setDisplayedText(reasoning.slice(0, currentIndex));
            currentIndex++;
          } else {
            setIsTyping(false);
            clearInterval(interval);
          }
        }, typingSpeed);
      }, 600);
    } else if (!isExpanded) {
      setDisplayedText('');
      setShowMaskSplit(false);
    }
  }, [isExpanded, reasoning]);

  if (!isExpanded) return null;

  return (
    <div className="mt-4 animate-curtain-rise">
      {/* 面具分裂容器 */}
      <div className="relative">
        {/* 背景舞台效果 */}
        <div className="absolute inset-0 bg-gradient-to-br from-mask-shadow/20 to-stage-spot rounded-lg blur-sm"></div>

        {/* 主内容容器 */}
        <div className="relative bg-stage-spot/90 backdrop-blur-sm rounded-lg border border-mask-shadow/50 overflow-hidden">
          {/* 顶部装饰线 - 金色聚光 */}
          <div className="h-px bg-gradient-to-r from-transparent via-truth/40 to-transparent"></div>

          <div className="p-5">
            {/* 头部 - 面具图标 + 标题 */}
            <div className="flex items-center gap-3 mb-4">
              {/* 面具图标区域 */}
              <div className="relative">
                {/* 左半面具 */}
                <div className={`
                  relative w-10 h-10 flex items-center justify-center
                  ${showMaskSplit ? 'animate-mask-split' : ''}
                `}>
                  <div className="text-2xl">🎭</div>
                </div>

                {/* 分裂效果的金色光芒 */}
                {showMaskSplit && (
                  <div className="absolute inset-0 -z-10">
                    <div className="w-full h-full bg-truth/20 blur-md rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>

              {/* 标题区域 */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-label text-xs text-truth tracking-wider">
                    AI 推理过程
                  </span>
                  {isTyping && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-truth/10 border border-truth/30 rounded text-xs text-truth/80">
                      <span className="w-1.5 h-1.5 bg-truth rounded-full animate-pulse"></span>
                      思考中
                    </span>
                  )}
                </div>
                {playerName && (
                  <p className="text-sm text-mask-white/60 mt-0.5">
                    {playerName} 的内心独白
                  </p>
                )}
              </div>
            </div>

            {/* 分割线 - 戏剧性 */}
            <div className="relative h-px mb-4">
              <div className="absolute inset-0 bg-gradient-to-r from-mask-shadow/30 via-mask-shadow/60 to-mask-shadow/30"></div>
              {/* 中心装饰点 */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-1.5 h-1.5 bg-truth rounded-full shadow-truth"></div>
              </div>
            </div>

            {/* 推理内容 - 舞台台词风格 */}
            <div className="reasoning-content space-y-3">
              <div className="relative">
                {/* 左侧引号装饰 */}
                <div className="absolute -left-3 top-0 text-3xl text-mask-shadow/40 font-display leading-none">
                  "
                </div>

                <p className="text-mask-white/90 text-sm leading-relaxed pl-2">
                  {displayedText || reasoning}
                  {isTyping && (
                    <span className="inline-block w-0.5 h-4 ml-1 bg-truth animate-pulse"></span>
                  )}
                </p>

                {/* 右侧引号装饰 */}
                {!isTyping && (
                  <div className="absolute -right-3 bottom-0 text-3xl text-mask-shadow/40 font-display leading-none">
                    "
                  </div>
                )}
              </div>
            </div>

            {/* 底部元信息 */}
            <div className="mt-4 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-neutral">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span>私密思考，其他玩家不可见</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-mask-white/40">
                  {reasoning.length} 字
                </span>
                <div className="w-px h-3 bg-mask-shadow/50"></div>
                <span className="text-truth/60 font-label">
                  真实想法
                </span>
              </div>
            </div>
          </div>

          {/* 底部装饰线 */}
          <div className="h-px bg-gradient-to-r from-transparent via-mask-shadow/40 to-transparent"></div>

          {/* 舞台聚光效果（微妙） */}
          <div className="absolute inset-0 bg-gradient-to-t from-truth/5 via-transparent to-transparent pointer-events-none"></div>
        </div>

        {/* 外发光效果 */}
        <div className="absolute inset-0 -z-10 bg-truth/5 blur-xl rounded-lg opacity-50"></div>
      </div>
    </div>
  );
}
