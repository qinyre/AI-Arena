interface Props {
  isFirst?: boolean;
  isLast?: boolean;
}

export default function TimelineConnector({ isFirst = false, isLast = false }: Props) {
  return (
    <div className="absolute left-[1.25rem] top-0 bottom-0 flex justify-center pointer-events-none">
      {/* 垂直连接线 */}
      <div className="relative w-0.5">
        {/* 主线 - 渐变效果 */}
        <div
          className={`
            absolute inset-0 bg-gradient-to-b from-blue-500/40 via-purple-500/30 to-blue-500/20
            ${isFirst ? 'top-1/2' : ''}
            ${isLast ? 'bottom-1/2' : ''}
          `}
        />

        {/* 动画脉冲效果 */}
        <div
          className={`
            absolute inset-0 bg-gradient-to-b from-blue-400 via-purple-400 to-transparent
            opacity-0 group-hover:opacity-30 transition-opacity duration-300
            ${isFirst ? 'top-1/2' : ''}
            ${isLast ? 'bottom-1/2' : ''}
          `}
        />

        {/* 发光点（在连接处） */}
        {!isLast && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400/50 group-hover:bg-blue-400 transition-colors duration-300">
              {/* 脉冲环 */}
              <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
