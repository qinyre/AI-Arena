import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { GameEvent } from '../../types/api';
import { cn } from '../../utils/cn';
import {
  buildCinematics,
  type CinematicAction,
  type CinematicKind,
} from './cinematics';

gsap.registerPlugin(useGSAP);

interface SceneMeta {
  role: string;
  chapter: string;
  mark: string;
  image: string;
  color: string;
  wash: string;
  position?: string;
}

const META: Record<CinematicKind, SceneMeta> = {
  wolf: {
    role: '狼人',
    chapter: '夜幕裁决',
    mark: '狼',
    image: '/assets/roles/werewolf-action.jpg',
    color: '#c7473d',
    wash: 'rgba(117, 20, 22, .44)',
    position: '64% center',
  },
  seer: {
    role: '预言家',
    chapter: '真相显形',
    mark: '预',
    image: '/assets/roles/seer-action.jpg',
    color: '#c9a65b',
    wash: 'rgba(137, 99, 31, .38)',
    position: '66% center',
  },
  'witch-heal': {
    role: '女巫',
    chapter: '生息回流',
    mark: '生',
    image: '/assets/roles/witch-action.jpg',
    color: '#79a58c',
    wash: 'rgba(46, 106, 76, .38)',
    position: '62% center',
  },
  'witch-poison': {
    role: '女巫',
    chapter: '毒息入夜',
    mark: '毒',
    image: '/assets/roles/witch-action.jpg',
    color: '#9870a8',
    wash: 'rgba(82, 43, 91, .42)',
    position: '62% center',
  },
  guard: {
    role: '守卫',
    chapter: '铁壁迎刃',
    mark: '守',
    image: '/assets/roles/guard-action.jpg',
    color: '#6f9ca5',
    wash: 'rgba(31, 88, 100, .4)',
    position: '67% center',
  },
  'hunter-shot': {
    role: '猎人',
    chapter: '遗枪回响',
    mark: '猎',
    image: '/assets/roles/hunter-action.jpg',
    color: '#bc8d50',
    wash: 'rgba(117, 67, 24, .38)',
    position: '65% center',
  },
  'wolf-king': {
    role: '狼王',
    chapter: '末令仍行',
    mark: '王',
    image: '/assets/roles/wolf-king-action.jpg',
    color: '#a63b35',
    wash: 'rgba(106, 24, 25, .44)',
    position: '67% center',
  },
  'white-wolf': {
    role: '白狼王',
    chapter: '假面尽碎',
    mark: '白',
    image: '/assets/roles/white-wolf-action.jpg',
    color: '#d7c8b1',
    wash: 'rgba(116, 27, 28, .45)',
    position: '66% center',
  },
  'wolf-explode': {
    role: '狼人',
    chapter: '白昼中断',
    mark: '爆',
    image: '/assets/roles/werewolf-action.jpg',
    color: '#c7473d',
    wash: 'rgba(117, 20, 22, .5)',
    position: '64% center',
  },
  idiot: {
    role: '白痴',
    chapter: '审判反转',
    mark: '愚',
    image: '/assets/roles/idiot-reveal.jpg',
    color: '#b77979',
    wash: 'rgba(102, 48, 58, .4)',
    position: '67% center',
  },
};

interface Props {
  events: GameEvent[];
  completed: boolean;
}

export default function ActionCinematics({ events, completed }: Props) {
  const cursor = useRef<number | null>(null);
  const [queue, setQueue] = useState<CinematicAction[]>([]);
  const [current, setCurrent] = useState<CinematicAction | null>(null);
  const finishCurrent = useCallback(() => setCurrent(null), []);

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

  useEffect(() => {
    const next = current ?? queue[0];
    if (!next) return;
    const image = new Image();
    image.src = META[next.kind].image;
  }, [current, queue]);

  return current ? (
    <CinematicScene action={current} onComplete={finishCurrent} />
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
  const skipButton = useRef<HTMLButtonElement>(null);
  const [reduced, setReduced] = useState(
    () => localStorage.getItem('ai-arena:reduced-cinematics') === '1',
  );
  const meta = META[action.kind];

  useEffect(() => {
    const previousFocus = document.activeElement;
    const frame = window.requestAnimationFrame(() => skipButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onComplete]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        reduceMotion: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const fullMotion = Boolean(context.conditions?.motion) && !reduced;
        if (!fullMotion) {
          const short = gsap.timeline({ onComplete });
          short
            .fromTo(root.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 })
            .to(root.current, { autoAlpha: 1, duration: 1.05 })
            .to(root.current, { autoAlpha: 0, duration: 0.16 });
          return () => short.kill();
        }

        const timeline = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete,
        });
        timeline
          .set(root.current, { autoAlpha: 0 })
          .set('.cinematic-progress', { scaleX: 0, transformOrigin: 'left center' })
          .to(root.current, { autoAlpha: 1, duration: 0.14 })
          .fromTo(
            '.cinematic-art',
            { autoAlpha: 0, xPercent: 10, scale: 1.12 },
            { autoAlpha: 1, xPercent: 0, scale: 1.025, duration: 0.82 },
            0.08,
          )
          .fromTo(
            '.cinematic-art-veil',
            { xPercent: 0 },
            { xPercent: 105, duration: 0.72, ease: 'power4.inOut' },
            0.08,
          )
          .from(
            '.cinematic-rule',
            { scaleX: 0, transformOrigin: 'left center', duration: 0.45 },
            0.34,
          )
          .from(
            '.cinematic-role-mark',
            { y: 16, rotation: -6, autoAlpha: 0, duration: 0.4 },
            0.34,
          )
          .from(
            '.cinematic-kicker',
            { y: 12, autoAlpha: 0, duration: 0.35 },
            0.42,
          )
          .from(
            '.cinematic-title-line',
            { yPercent: 115, stagger: 0.09, duration: 0.58, ease: 'power4.out' },
            0.46,
          )
          .from(
            '.cinematic-cast > *',
            { y: 10, autoAlpha: 0, stagger: 0.07, duration: 0.35 },
            0.72,
          )
          .from(
            '.cinematic-detail',
            { y: 8, autoAlpha: 0, duration: 0.34 },
            0.9,
          )
          .from(
            '.cinematic-motif > *',
            { scale: 0.3, autoAlpha: 0, stagger: 0.045, duration: 0.32 },
            0.48,
          )
          .to('.cinematic-progress', { scaleX: 1, duration: 2.4, ease: 'none' }, 0.5)
          .to('.cinematic-art', { scale: 1.07, xPercent: -1.5, duration: 2.45, ease: 'sine.inOut' }, 0.72)
          .to('.cinematic-copy', { x: -18, autoAlpha: 0, duration: 0.32 }, 2.78)
          .to('.cinematic-art', { xPercent: 4, autoAlpha: 0, duration: 0.36 }, 2.76)
          .to(root.current, { autoAlpha: 0, duration: 0.22 }, 3.02);

        return () => timeline.kill();
      },
      root,
    );
    return () => media.revert();
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
      aria-modal="true"
      aria-label={`${action.title}，${action.actor}${action.target ? ` 对 ${action.target}` : ''}`}
      data-scene={action.kind}
      className="cinematic-root fixed inset-0 z-[100] overflow-hidden bg-[#090b0d]"
      style={{
        '--cinematic-color': meta.color,
        '--cinematic-wash': meta.wash,
      } as React.CSSProperties}
    >
      <div className="cinematic-art-shell absolute inset-0 md:left-[30%]">
        <img
          className="cinematic-art h-full w-full object-cover"
          src={meta.image}
          alt=""
          style={{ objectPosition: meta.position }}
        />
        <div className="cinematic-art-grade absolute inset-0" />
        <div className="cinematic-art-veil absolute inset-0 bg-[#090b0d]" />
      </div>

      <div className="cinematic-paper absolute inset-0" aria-hidden="true" />
      <div className="cinematic-vignette absolute inset-0" aria-hidden="true" />

      <SceneMotif kind={action.kind} />

      <div className="relative z-20 mx-auto grid min-h-full max-w-[1440px] items-end px-6 pb-20 pt-24 sm:px-10 md:grid-cols-[minmax(0,48rem)_1fr] md:items-center md:px-14 md:pb-12 lg:px-20">
        <section className="cinematic-copy max-w-[46rem]">
          <div className="mb-6 flex items-center gap-4">
            <span
              className="cinematic-role-mark grid h-12 w-12 place-items-center border font-display text-xl"
              style={{ borderColor: meta.color, color: meta.color }}
              aria-hidden="true"
            >
              {meta.mark}
            </span>
            <div>
              <p className="cinematic-kicker font-label text-[11px] tracking-[0.34em] text-[#d9d0bf]/60">
                {meta.role} · {meta.chapter}
              </p>
              <div
                className="cinematic-rule mt-2 h-px w-28"
                style={{ backgroundColor: meta.color }}
              />
            </div>
          </div>

          <h2 className="cinematic-title m-0 overflow-hidden font-display text-[clamp(3rem,8vw,7rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-[#eee8dc]">
            {action.title.split('').map((character, index) => (
              <span
                key={`${character}-${index}`}
                className="cinematic-title-line inline-block"
              >
                {character}
              </span>
            ))}
          </h2>

          <div className="cinematic-cast mt-8 flex flex-wrap items-end gap-x-7 gap-y-3">
            <CastMember label="执行者" value={action.actor} />
            {action.target && (
              <>
                <span
                  className="mb-1 hidden h-px w-10 sm:block"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <CastMember label="目标" value={action.target} accent={meta.color} />
              </>
            )}
          </div>

          <p className="cinematic-detail mt-5 max-w-xl border-l pl-4 font-body text-base leading-relaxed text-[#d9d0bf]/68 sm:text-lg"
            style={{ borderColor: `${meta.color}99` }}
          >
            {action.detail}
          </p>
        </section>
      </div>

      <div className="absolute right-4 top-4 z-30 flex items-center gap-2 sm:right-6 sm:top-6">
        <button
          type="button"
          aria-pressed={reduced}
          onClick={toggleReduced}
          className="cinematic-control"
        >
          {reduced ? '完整动态' : '减少动态'}
        </button>
        <button
          ref={skipButton}
          type="button"
          onClick={onComplete}
          className="cinematic-control cinematic-skip"
        >
          跳过 <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/5">
        <div
          className="cinematic-progress h-full w-full"
          style={{ backgroundColor: meta.color }}
        />
      </div>
    </div>
  );
}

function CastMember({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="font-label text-[9px] tracking-[0.28em] text-[#d9d0bf]/42">
        {label}
      </div>
      <div
        className="mt-1 font-display text-xl text-[#eee8dc] sm:text-2xl"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function SceneMotif({ kind }: { kind: CinematicKind }) {
  const isSeer = kind === 'seer';
  const isGuard = kind === 'guard';
  const isWitch = kind === 'witch-heal' || kind === 'witch-poison';
  const isShot = kind === 'hunter-shot' || kind === 'wolf-king';
  const isReveal = kind === 'white-wolf' || kind === 'wolf-explode' || kind === 'idiot';

  return (
    <div
      className={cn(
        'cinematic-motif pointer-events-none absolute z-10 text-[var(--cinematic-color)]',
        isSeer && 'cinematic-motif-seer',
        isGuard && 'cinematic-motif-guard',
        isWitch && 'cinematic-motif-witch',
        isShot && 'cinematic-motif-shot',
        isReveal && 'cinematic-motif-reveal',
        !isSeer && !isGuard && !isWitch && !isShot && !isReveal && 'cinematic-motif-wolf',
      )}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
