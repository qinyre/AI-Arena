import { useState, useEffect } from 'react';

interface Props {
  reasoning: string;
  isExpanded: boolean;
  playerName?: string;
}

export default function ReasoningPanel({ reasoning, isExpanded, playerName }: Props) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // 打字机效果（仅在首次展开时）
  useEffect(() => {
    if (isExpanded && displayedText === '') {
      setIsTyping(true);
      let currentIndex = 0;
      const typingSpeed = 15; // ms per character

      const interval = setInterval(() => {
        if (currentIndex <= reasoning.length) {
          setDisplayedText(reasoning.slice(0, currentIndex));
          currentIndex++;
        } else {
          setIsTyping(false);
          clearInterval(interval);
        }
      }, typingSpeed);

      return () => clearInterval(interval);
    } else if (!isExpanded) {
      setDisplayedText('');
    }
  }, [isExpanded, reasoning]);

  if (!isExpanded) return null;

  return (
    <div className="mt-3 animate-fade-in-up">
      {/* 主容器 - 渐变背景 + 模糊效果 */}
      <div className="relative group">
        {/* 背景层 */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/10 to-purple-900/20 rounded-lg blur-sm"></div>

        {/* 内容层 */}
        <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-lg border border-purple-500/30 overflow-hidden">
          {/* 发光边框效果 */}
          <div className="absolute inset-0 rounded-lg border border-purple-500/0 group-hover:border-purple-500/50 transition-all duration-300"></div>

          {/* 左侧装饰条 */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 via-blue-500 to-purple-500 opacity-50"></div>

          <div className="p-4 pl-5">
            {/* 头部 - 图标 + 标题 */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative">
                {/* 思考图标 - 带脉冲动画 */}
                <svg
                  className="w-5 h-5 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>

                {/* 脉冲动画环 */}
                {isTyping && (
                  <span className="absolute inset-0 rounded-full border-2 border-purple-400 animate-ping opacity-75"></span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-purple-400">
                  {playerName ? `${playerName} 的推理` : 'AI 推理过程'}
                </span>
                {isTyping && (
                  <span className="text-xs text-purple-400/60 animate-pulse">
                    思考中...
                  </span>
                )}
              </div>
            </div>

            {/* 分割线 */}
            <div className="h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent mb-3"></div>

            {/* 推理内容 */}
            <div className="reasoning-content space-y-2">
              <p className="text-gray-300 text-sm leading-relaxed font-light">
                {displayedText || reasoning}
                {isTyping && (
                  <span className="inline-block w-1 h-4 ml-1 bg-purple-400 animate-pulse"></span>
                )}
              </p>
            </div>

            {/* 底部装饰 */}
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                AI 内部思考，不对其他玩家可见
              </span>
              <span className="text-purple-400/60">
                {reasoning.length} 字
              </span>
            </div>
          </div>

          {/* 微妙的光效 */}
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-transparent pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
}
