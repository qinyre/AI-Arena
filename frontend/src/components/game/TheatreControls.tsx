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
    <div className="theatre-controls hidden items-center gap-1 border-l border-white/10 pl-3 md:flex">
      <button
        type="button"
        aria-pressed={soundEnabled}
        onClick={() => onSoundChange(!soundEnabled)}
        className={cn('theatre-toggle', soundEnabled && 'is-on')}
        title={soundEnabled && !soundReady ? '点击页面后启用声场' : '开启或关闭对局声场'}
      >
        <span aria-hidden="true">{soundEnabled ? '声' : '静'}</span>
        <span>{soundEnabled && !soundReady ? '声场待启用' : '声场'}</span>
      </button>

      <label className={cn('theatre-volume', !soundEnabled && 'is-disabled')}>
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
        className={cn('theatre-toggle', directorEnabled && 'is-on')}
        title="关键事件进入演出，普通流程自动加速"
      >
        <span aria-hidden="true">导</span>
        <span>导演节奏</span>
      </button>
    </div>
  );
}
