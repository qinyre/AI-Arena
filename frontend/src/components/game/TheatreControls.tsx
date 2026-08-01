import { cn } from '../../utils/cn';

interface Props {
  directorEnabled: boolean;
  onDirectorChange: (enabled: boolean) => void;
  soundEnabled: boolean;
  soundReady: boolean;
  volume: number;
  onSoundChange: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

export default function TheatreControls({
  directorEnabled,
  onDirectorChange,
  soundEnabled,
  soundReady,
  volume,
  onSoundChange,
  onVolumeChange,
}: Props) {
  return (
    <div className="theatre-controls flex items-center gap-1 border-l border-white/10 pl-2 sm:pl-3">
      <details className="group relative md:hidden">
        <summary
          className="theatre-toggle min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          aria-label="声音设置"
        >
          <span aria-hidden="true">声</span>
          <span>声音</span>
        </summary>
        <div className="absolute right-0 top-full z-50 mt-2 w-48 border border-antique-gold/25 bg-stage-deep p-3 shadow-2xl">
          <button
            type="button"
            aria-pressed={soundEnabled}
            onClick={() => onSoundChange(!soundEnabled)}
            className={cn('theatre-toggle min-h-11 w-full justify-start', soundEnabled && 'is-on')}
          >
            <span aria-hidden="true">{soundEnabled ? '声' : '静'}</span>
            <span>{soundEnabled && !soundReady ? '点击启用声场' : soundEnabled ? '声场已开启' : '声场已关闭'}</span>
          </button>
          <label className={cn('mt-2 flex min-h-11 items-center gap-3 text-xs text-ink-muted', !soundEnabled && 'opacity-30')}>
            音量
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              disabled={!soundEnabled}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              className="min-w-0 flex-1 accent-antique-gold"
            />
          </label>
        </div>
      </details>

      <button
        type="button"
        aria-pressed={soundEnabled}
        onClick={() => onSoundChange(!soundEnabled)}
        className={cn('theatre-toggle hidden min-h-11 md:inline-flex', soundEnabled && 'is-on')}
        title={soundEnabled && !soundReady ? '点击页面后启用声场' : '开启或关闭对局声场'}
      >
        <span aria-hidden="true">{soundEnabled ? '声' : '静'}</span>
        <span>{soundEnabled && !soundReady ? '声场待启用' : '声场'}</span>
      </button>

      <label className={cn('theatre-volume hidden min-h-11 md:flex', !soundEnabled && 'is-disabled')}>
        <span className="sr-only">声场音量</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          disabled={!soundEnabled}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </label>

      <button
        type="button"
        aria-pressed={directorEnabled}
        onClick={() => onDirectorChange(!directorEnabled)}
        className={cn('theatre-toggle min-h-11', directorEnabled && 'is-on')}
        title="关键事件进入演出，普通流程自动加速"
      >
        <span aria-hidden="true">导</span>
        <span className="md:hidden">导演</span>
        <span className="hidden md:inline">导演节奏</span>
      </button>
    </div>
  );
}
