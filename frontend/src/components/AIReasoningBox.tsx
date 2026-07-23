import { useState, useEffect, useRef } from 'react';

interface AIReasoningBoxProps {
  reasoning: string;
  isExpanded: boolean;
  /** 是否启用打字机效果（默认 false） */
  typewriterEffect?: boolean;
  /** 打字速度（毫秒/字符，默认 30） */
  typewriterSpeed?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * AI 推理内容展示组件
 *
 * 设计特点：
 * - 紫蓝渐变边框突出"AI 思考"的神秘感
 * - 半透明背景层次分明
 * - 斜体文本模拟"思维流"
 * - 流畅的展开/收起动画
 * - 可选的打字机效果
 */
export default function AIReasoningBox({
  reasoning,
  isExpanded,
  typewriterEffect = false,
  typewriterSpeed = 30,
  className = '',
}: AIReasoningBoxProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 打字机效果
  useEffect(() => {
    if (!typewriterEffect || !isExpanded) {
      setDisplayedText(reasoning);
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    setDisplayedText('');

    let currentIndex = 0;
    const timer = setInterval(() => {
      if (currentIndex < reasoning.length) {
        setDisplayedText(reasoning.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(timer);
      }
    }, typewriterSpeed);

    return () => clearInterval(timer);
  }, [reasoning, isExpanded, typewriterEffect, typewriterSpeed]);

  if (!isExpanded) {
    return null;
  }

  return (
    <div
      className={`
        mt-3 relative overflow-hidden
        rounded-lg
        bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-indigo-900/20
        border border-transparent
        animate-in slide-in-from-top-2 fade-in-0 duration-300
        ${className}
      `}
      style={{
        backgroundImage: `
          linear-gradient(to bottom right, rgba(147, 51, 234, 0.2), rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2)),
          linear-gradient(135deg, rgba(147, 51, 234, 0.4) 0%, rgba(59, 130, 246, 0.4) 50%, rgba(99, 102, 241, 0.4) 100%)
        `,
        backgroundClip: 'padding-box, border-box',
        backgroundOrigin: 'padding-box, border-box',
      }}
    >
      {/* 渐变边框效果 */}
      <div className="absolute inset-0 rounded-lg opacity-50 blur-sm bg-gradient-to-r from-purple-500 via-blue-500 to-indigo-500 -z-10"></div>

      {/* 内容区域 */}
      <div className="relative p-4 backdrop-blur-sm">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 mb-2">
          <svg
            className={`w-5 h-5 text-purple-400 ${isTyping ? 'animate-pulse' : ''}`}
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
          <span className="text-sm font-semibold text-purple-300 tracking-wide">
            AI 推理过程
          </span>
          {isTyping && (
            <span className="ml-auto text-xs text-purple-400 animate-pulse">
              思考中...
            </span>
          )}
        </div>

        {/* 推理内容 */}
        <div
          ref={contentRef}
          className="
            text-sm leading-relaxed
            text-gray-200
            italic
            pl-7
            border-l-2 border-purple-500/50
            animate-in fade-in-0 duration-500
          "
          style={{
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
          }}
        >
          {displayedText}
          {isTyping && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-purple-400 animate-pulse"></span>
          )}
        </div>

        {/* 装饰性引号 */}
        <div className="absolute top-2 left-2 text-4xl text-purple-500/20 font-serif leading-none">
          &ldquo;
        </div>
        <div className="absolute bottom-2 right-2 text-4xl text-purple-500/20 font-serif leading-none">
          &rdquo;
        </div>
      </div>

      {/* 底部光晕效果 */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"></div>
    </div>
  );
}
