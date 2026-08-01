import { useEffect, useMemo, useState } from 'react';
import type { GameEvent, GameReview } from '../../types/api';
import { cn } from '../../utils/cn';
import { directorDelay, nextDirectorCursor } from './gameDirector';

interface Props {
  events: GameEvent[];
  cursor: number;
  onCursorChange: (cursor: number) => void;
  turningPoints: GameReview['turning_points'];
  directorEnabled: boolean;
  blocked?: boolean;
}

const SPEEDS = [0.5, 1, 2, 4];
const TRANSPORT_BUTTON = 'grid h-11 w-11 place-items-center rounded border border-[#47464b]/35 bg-[#102034]/70 text-[#c8c5cb]/65 transition-colors hover:border-[#e9c400]/35 hover:text-[#ffe16d]';

export default function ReplayControls({
  events,
  cursor,
  onCursorChange,
  turningPoints,
  directorEnabled,
  blocked = false,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = events.length;
  const markers = useMemo(
    () => buildMarkers(events, turningPoints),
    [events, turningPoints],
  );

  useEffect(() => {
    if (!playing || blocked) return;
    if (cursor >= total) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => onCursorChange(Math.min(nextDirectorCursor(events, cursor, directorEnabled), total)),
      directorDelay(events[cursor], speed, directorEnabled),
    );
    return () => window.clearTimeout(timer);
  }, [blocked, cursor, directorEnabled, events, onCursorChange, playing, speed, total]);

  const togglePlayback = () => {
    if (cursor >= total) onCursorChange(0);
    setPlaying((value) => !value || cursor >= total);
  };

  const seek = (next: number) => {
    setPlaying(false);
    onCursorChange(Math.max(0, Math.min(next, total)));
  };

  return (
    <section className="glass-panel rounded-lg border border-[#e9c400]/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-[19px] text-[#e9c400]">movie</span>
          <div>
            <h2 className="font-display text-base leading-none text-[#f6edc8]">对局回放</h2>
            <p className="mt-1 font-label text-[10px] text-[#c8c5cb]/45">
              {cursor}/{total} 事件
            </p>
          </div>
        </div>

        <button type="button" onClick={() => seek(0)} aria-label="回到开局" className={TRANSPORT_BUTTON}>
          <span className="material-symbols-outlined text-[18px]">first_page</span>
        </button>
        <button type="button" onClick={() => seek(cursor - 1)} aria-label="上一个事件" className={TRANSPORT_BUTTON}>
          <span className="material-symbols-outlined text-[18px]">skip_previous</span>
        </button>
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playing ? '暂停回放' : '播放回放'}
          className="grid h-11 w-11 place-items-center rounded-full border border-[#e9c400]/45 bg-[#e9c400]/10 text-[#ffe16d] transition-colors hover:bg-[#e9c400]/20"
        >
          <span className="material-symbols-outlined text-[21px]">{playing ? 'pause' : 'play_arrow'}</span>
        </button>
        <button type="button" onClick={() => seek(cursor + 1)} aria-label="下一个事件" className={TRANSPORT_BUTTON}>
          <span className="material-symbols-outlined text-[18px]">skip_next</span>
        </button>
        <button type="button" onClick={() => seek(total)} aria-label="跳到结局" className={TRANSPORT_BUTTON}>
          <span className="material-symbols-outlined text-[18px]">last_page</span>
        </button>

        <label className="ml-auto flex items-center gap-2 font-label text-[11px] text-[#c8c5cb]/55">
          倍速
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="rounded border border-[#47464b]/40 bg-[#102034] px-2 py-1.5 text-xs text-[#d3e4fe]"
          >
            {SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
      </div>

      <div className="relative mt-3 px-1">
        <input
          type="range"
          min="0"
          max={Math.max(total, 1)}
          value={cursor}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="回放事件进度"
          className="h-2 w-full cursor-pointer accent-[#e9c400]"
        />
        {total > 0 && markers.map((marker, index) => (
          <button
            key={`${marker.round}-${marker.cursor}-${index}`}
            type="button"
            onClick={() => seek(marker.cursor)}
            title={`第 ${marker.round} 轮 · ${marker.title}\n${marker.impact}`}
            aria-label={`跳到关键转折：${marker.title}`}
            className="absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ left: `clamp(1.375rem, ${(marker.cursor / total) * 100}%, calc(100% - 1.375rem))` }}
          >
            <span className={cn(
              'h-3 w-3 rounded-full border-2 border-[#081624] bg-[#c4b5fd] shadow-[0_0_9px_rgba(196,181,253,0.75)]',
              cursor >= marker.cursor && 'bg-[#ffe16d]',
            )} />
          </button>
        ))}
      </div>

      {markers.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {markers.map((marker) => (
            <button
              key={`${marker.title}-${marker.cursor}`}
              type="button"
              onClick={() => seek(marker.cursor)}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs transition-colors',
                cursor >= marker.cursor
                  ? 'border-[#e9c400]/35 bg-[#e9c400]/10 text-[#ffe16d]'
                  : 'border-[#c4b5fd]/25 bg-[#c4b5fd]/5 text-[#d8ccff]/70',
              )}
              title={marker.impact}
            >
              <span className="font-label">R{marker.round}</span> · {marker.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function buildMarkers(events: GameEvent[], points: GameReview['turning_points']) {
  const roundStarts = new Map<number, number>([[1, 0]]);
  events.forEach((event, index) => {
    const round = Number('round' in event.data ? event.data.round : NaN);
    if (Number.isFinite(round) && !roundStarts.has(round)) {
      roundStarts.set(round, index + 1);
    }
  });
  return points.map((point) => ({
    ...point,
    cursor: roundStarts.get(point.round) ?? events.length,
  }));
}
