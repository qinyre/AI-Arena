import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { GameEvent } from '../../types/api';
import {
  buildCinematics,
  type CinematicAction,
  type CinematicKind,
} from './cinematics';

gsap.registerPlugin(useGSAP);

const META: Record<CinematicKind, {
  eyebrow: string;
  icon: string;
  color: string;
  glow: string;
}> = {
  wolf: { eyebrow: 'WEREWOLF ACTION', icon: 'swords', color: '#eb2445', glow: 'rgba(235,36,69,.5)' },
  seer: { eyebrow: 'DIVINATION', icon: 'visibility', color: '#ffe16d', glow: 'rgba(233,196,0,.5)' },
  'witch-heal': { eyebrow: 'ELIXIR OF LIFE', icon: 'water_drop', color: '#6ee7b7', glow: 'rgba(52,211,153,.45)' },
  'witch-poison': { eyebrow: 'WITCHCRAFT', icon: 'experiment', color: '#c4b5fd', glow: 'rgba(167,139,250,.5)' },
  guard: { eyebrow: 'NIGHT WATCH', icon: 'shield', color: '#7dd3fc', glow: 'rgba(56,189,248,.45)' },
  shot: { eyebrow: 'LAST BULLET', icon: 'my_location', color: '#f8fafc', glow: 'rgba(248,250,252,.45)' },
  explode: { eyebrow: 'MASK BROKEN', icon: 'bomb', color: '#ff7189', glow: 'rgba(235,36,69,.7)' },
};

interface Props {
  events: GameEvent[];
  completed: boolean;
}

export default function ActionCinematics({ events, completed }: Props) {
  const cursor = useRef<number | null>(null);
  const [queue, setQueue] = useState<CinematicAction[]>([]);
  const [current, setCurrent] = useState<CinematicAction | null>(null);

  useEffect(() => {
    if (cursor.current === null) {
      cursor.current = events.length;
      if (!completed) {
        const recent = events.filter((event) => (
          Date.now() - new Date(event.timestamp).getTime() < 5000
        ));
        setQueue(buildCinematics(recent));
      }
      return;
    }
    const added = events.slice(cursor.current);
    cursor.current = events.length;
    if (added.length) setQueue((items) => [...items, ...buildCinematics(added)]);
  }, [events, completed]);

  useEffect(() => {
    if (!current && queue.length) {
      setCurrent(queue[0]);
      setQueue((items) => items.slice(1));
    }
  }, [current, queue]);

  return current ? (
    <CinematicScene action={current} onComplete={() => setCurrent(null)} />
  ) : null;
}

function CinematicScene({
  action,
  onComplete,
}: {
  action: CinematicAction;
  onComplete: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [reduced, setReduced] = useState(
    systemReduced || localStorage.getItem('ai-arena:reduced-cinematics') === '1',
  );
  const meta = META[action.kind];

  useGSAP(() => {
    if (reduced) {
      gsap.fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 });
      const timer = window.setTimeout(onComplete, 850);
      return () => window.clearTimeout(timer);
    }

    const timeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete,
    });
    timeline
      .fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 })
      .fromTo('.cinematic-curtain-left', { xPercent: 0 }, { xPercent: -100, duration: 0.55 }, 0.08)
      .fromTo('.cinematic-curtain-right', { xPercent: 0 }, { xPercent: 100, duration: 0.55 }, 0.08)
      .from('.cinematic-ring', { scale: 0.25, autoAlpha: 0, rotation: -45, duration: 0.55 }, 0.22)
      .from('.cinematic-icon', { scale: 0, rotation: -18, duration: 0.45, ease: 'back.out(1.7)' }, 0.35)
      .from('.cinematic-particle', {
        scale: 0,
        autoAlpha: 0,
        x: () => gsap.utils.random(-70, 70),
        y: () => gsap.utils.random(-45, 45),
        stagger: 0.025,
        duration: 0.35,
      }, 0.35)
      .from('.cinematic-copy > *', { y: 18, autoAlpha: 0, stagger: 0.08, duration: 0.35 }, 0.48)
      .to('.cinematic-ring', { scale: 1.08, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.75)
      .to('.cinematic-stage', { scale: 1.025, duration: 0.35, ease: 'power2.inOut' }, 0.8)
      .to('.cinematic-stage', { scale: 1, duration: 0.35 }, 1.15)
      .to('.cinematic-content', { y: -10, autoAlpha: 0, duration: 0.3 }, '+=0.45')
      .to(root.current, { autoAlpha: 0, duration: 0.24 }, '<0.08');

    return () => timeline.kill();
  }, {
    scope: root,
    dependencies: [action.id, reduced],
    revertOnUpdate: true,
  });

  const toggleReduced = () => {
    const next = !reduced;
    localStorage.setItem('ai-arena:reduced-cinematics', next ? '1' : '0');
    setReduced(next);
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={`${action.title}：${action.actor}${action.target ? ` 对 ${action.target}` : ''}`}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#010812]/90 backdrop-blur-sm"
      style={{ '--cinematic-color': meta.color, '--cinematic-glow': meta.glow } as React.CSSProperties}
    >
      <div className="cinematic-stage absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--cinematic-glow),transparent_42%)] opacity-45" />
        <div className="absolute left-1/2 top-1/2 h-[75vmin] w-[75vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
        <div className="absolute left-1/2 top-1/2 h-[52vmin] w-[52vmin] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white/5" />
      </div>

      <div className="cinematic-curtain-left absolute inset-y-0 left-0 w-1/2 origin-left bg-gradient-to-r from-[#020814] via-[#10192c] to-[#1c1321]" />
      <div className="cinematic-curtain-right absolute inset-y-0 right-0 w-1/2 origin-right bg-gradient-to-l from-[#020814] via-[#10192c] to-[#1c1321]" />

      <div className="cinematic-content relative flex max-w-3xl flex-col items-center px-6 text-center">
        <div
          className="cinematic-ring relative mb-6 flex h-32 w-32 items-center justify-center rounded-full border"
          style={{
            borderColor: meta.color,
            boxShadow: `0 0 35px ${meta.glow}, inset 0 0 28px ${meta.glow}`,
          }}
        >
          <div className="absolute inset-2 rounded-full border border-white/10" />
          <span
            className="cinematic-icon material-symbols-outlined text-[58px]"
            style={{ color: meta.color, textShadow: `0 0 22px ${meta.glow}` }}
          >
            {meta.icon}
          </span>
          {Array.from({ length: 10 }, (_, index) => (
            <i
              key={index}
              className="cinematic-particle absolute h-1 w-1 rounded-full"
              style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
            />
          ))}
        </div>

        <div className="cinematic-copy">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.42em]" style={{ color: meta.color }}>
            {meta.eyebrow}
          </p>
          <h2 className="mt-2 font-display text-4xl text-[#f2f5fa] sm:text-5xl">{action.title}</h2>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 font-display text-xl sm:text-2xl">
            <span className="text-[#d3e4fe]">{action.actor}</span>
            {action.target && (
              <>
                <span className="material-symbols-outlined text-[20px]" style={{ color: meta.color }}>arrow_forward</span>
                <span style={{ color: meta.color }}>{action.target}</span>
              </>
            )}
          </div>
          <p className="mt-3 font-body text-sm tracking-wide text-[#c8c5cb]/70">{action.detail}</p>
        </div>
      </div>

      <div className="absolute bottom-5 right-5 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleReduced}
          className="rounded border border-white/10 bg-black/20 px-3 py-1.5 font-label text-[10px] text-white/55 transition-colors hover:text-white"
        >
          {reduced ? '恢复完整动画' : '减少动态效果'}
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="rounded border border-white/20 bg-black/30 px-3 py-1.5 font-label text-[10px] text-white/75 transition-colors hover:border-white/40 hover:text-white"
        >
          跳过
        </button>
      </div>
    </div>
  );
}
