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
  image?: string;
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
  'wolf-kill': {
    role: '夜间遇袭',
    chapter: '月下追猎',
    mark: '袭',
    image: '/assets/roles/werewolf-hunt.jpg',
    color: '#b84037',
    wash: 'rgba(90, 13, 18, .5)',
    position: '54% center',
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
  'sheriff-opening': {
    role: '警长竞选',
    chapter: '秩序争夺',
    mark: '竞',
    image: '/assets/roles/sheriff-campaign.jpg',
    color: '#c9a65b',
    wash: 'rgba(137, 99, 31, .42)',
    position: '62% center',
  },
  sheriff: {
    role: '警长',
    chapter: '警徽裁决',
    mark: '警',
    image: '/assets/roles/sheriff-elected.jpg',
    color: '#d0ad61',
    wash: 'rgba(137, 99, 31, .46)',
    position: '68% center',
  },
  badge: {
    role: '警徽流',
    chapter: '权柄易手',
    mark: '徽',
    image: '/assets/roles/badge-transfer.jpg',
    color: '#c9a65b',
    wash: 'rgba(111, 79, 25, .44)',
    position: '64% center',
  },
  'wolf-beauty': {
    role: '狼美人',
    chapter: '绯线入梦',
    mark: '魅',
    image: '/assets/roles/wolf-beauty-action.jpg',
    color: '#b64f78',
    wash: 'rgba(91, 24, 54, .46)',
    position: '52% center',
  },
  'wolf-beauty-trigger': {
    role: '狼美人',
    chapter: '殉情终章',
    mark: '殉',
    image: '/assets/roles/wolf-beauty-action.jpg',
    color: '#d05a81',
    wash: 'rgba(105, 20, 45, .54)',
    position: '52% center',
  },
  'knight-duel': {
    role: '骑士',
    chapter: '长剑问罪',
    mark: '决',
    image: '/assets/roles/knight-duel.jpg',
    color: '#c7b477',
    wash: 'rgba(86, 70, 35, .42)',
    position: '50% center',
  },
  'badge-destroyed': {
    role: '警徽流',
    chapter: '权柄终结',
    mark: '裂',
    image: '/assets/roles/badge-destroyed.jpg',
    color: '#a88c59',
    wash: 'rgba(91, 57, 31, .48)',
    position: '66% center',
  },
  exile: {
    role: '放逐审判',
    chapter: '票型落定',
    mark: '逐',
    image: '/assets/roles/exile-action.jpg',
    color: '#c7473d',
    wash: 'rgba(117, 20, 22, .46)',
    position: '66% center',
  },
  tie: {
    role: '平票裁决',
    chapter: '审判悬停',
    mark: '平',
    image: '/assets/roles/tie-vote.jpg',
    color: '#9870a8',
    wash: 'rgba(82, 43, 91, .42)',
    position: '68% center',
  },
  'last-words': {
    role: '遗言',
    chapter: '最后陈词',
    mark: '言',
    image: '/assets/roles/last-words.jpg',
    color: '#8fa0a8',
    wash: 'rgba(54, 70, 78, .42)',
    position: '67% center',
  },
  'victory-good': {
    role: '终局',
    chapter: '黎明已至',
    mark: '胜',
    image: '/assets/roles/victory-good.jpg',
    color: '#d0ad61',
    wash: 'rgba(126, 97, 35, .48)',
    position: '70% center',
  },
  'victory-wolf': {
    role: '终局',
    chapter: '长夜无明',
    mark: '夜',
    image: '/assets/roles/victory-wolf.jpg',
    color: '#c7473d',
    wash: 'rgba(117, 20, 22, .5)',
    position: '68% center',
  },
};

interface Props {
  events: GameEvent[];
  suppressInitial: boolean;
  replayMode: boolean;
  enabled: boolean;
  roleAssignment?: Record<string, string>;
  onActiveChange?: (active: boolean) => void;
  onActionStart?: (action: CinematicAction) => void;
}

export default function ActionCinematics({
  events,
  suppressInitial,
  replayMode,
  enabled,
  roleAssignment,
  onActiveChange,
  onActionStart,
}: Props) {
  const cursor = useRef<number | null>(null);
  const [queue, setQueue] = useState<CinematicAction[]>([]);
  const [current, setCurrent] = useState<CinematicAction | null>(null);
  const announced = useRef<string | null>(null);
  const finishCurrent = useCallback(() => setCurrent(null), []);

  useEffect(() => {
    if (!enabled) {
      cursor.current = events.length;
      setQueue([]);
      setCurrent(null);
      return;
    }
    if (cursor.current === null) {
      cursor.current = events.length;
      if (!suppressInitial) {
        const recent = events.filter((event) => (
          Date.now() - new Date(event.timestamp).getTime() < 5000
        ));
        setQueue(buildCinematics(recent, roleAssignment));
      }
      return;
    }
    if (events.length < cursor.current) {
      cursor.current = events.length;
      setQueue([]);
      setCurrent(null);
      return;
    }
    const added = events.slice(cursor.current);
    cursor.current = events.length;
    if (added.length) {
      const actions = buildCinematics(added, roleAssignment);
      const next = replayMode && added.length > 1 ? actions.slice(-1) : actions;
      if (next.length) setQueue((items) => [...items, ...next]);
    }
  }, [enabled, events, replayMode, roleAssignment, suppressInitial]);

  useEffect(() => {
    if (!current && queue.length) {
      setCurrent(queue[0]);
      setQueue((items) => items.slice(1));
    }
  }, [current, queue]);

  useEffect(() => {
    const next = current ?? queue[0];
    if (!next) return;
    const source = META[next.kind].image;
    if (!source) return;
    const image = new Image();
    image.src = source;
  }, [current, queue]);

  useEffect(() => {
    onActiveChange?.(Boolean(current));
    return () => onActiveChange?.(false);
  }, [current, onActiveChange]);

  useEffect(() => {
    if (!current) {
      announced.current = null;
    } else if (announced.current !== current.id) {
      announced.current = current.id;
      onActionStart?.(current);
    }
  }, [current, onActionStart]);

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
  const root = useRef<HTMLDialogElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const [reduced, setReduced] = useState(
    () => localStorage.getItem('ai-arena:reduced-cinematics') === '1',
  );
  const meta = META[action.kind];

  useEffect(() => {
    const dialog = root.current;
    const previousFocus = document.activeElement;
    if (dialog && !dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => skipButton.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (dialog?.open) dialog.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

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
          .to(root.current, { autoAlpha: 1, duration: 0.14 });

        if (meta.image) {
          timeline.fromTo(
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
          );
        } else {
          timeline
            .fromTo(
              '.cinematic-tribunal-field',
              { autoAlpha: 0, scale: 1.08 },
              { autoAlpha: 1, scale: 1, duration: 0.82 },
              0.08,
            )
            .from(
              '.cinematic-tribunal-glyph',
              { scale: 1.5, rotation: -8, autoAlpha: 0, duration: 0.72 },
              0.12,
            )
            .from(
              '.cinematic-tally > i',
              { scaleX: 0, transformOrigin: 'left center', stagger: 0.045, duration: 0.35 },
              0.28,
            );
        }

        timeline
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
          .to('.cinematic-progress', { scaleX: 1, duration: 2.4, ease: 'none' }, 0.5);

        if (meta.image) {
          timeline.to(
            '.cinematic-art',
            { scale: 1.07, xPercent: -1.5, duration: 2.45, ease: 'sine.inOut' },
            0.72,
          );
        } else {
          timeline.to(
            '.cinematic-tribunal-field',
            { scale: 1.025, rotation: 0.3, duration: 2.45, ease: 'sine.inOut' },
            0.72,
          );
        }

        timeline
          .to('.cinematic-copy', { x: -18, autoAlpha: 0, duration: 0.32 }, 2.78)
          .to(
            meta.image ? '.cinematic-art' : '.cinematic-tribunal-field',
            { xPercent: 4, autoAlpha: 0, duration: 0.36 },
            2.76,
          )
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
    <dialog
      ref={root}
      aria-label={`${action.title}，${action.actor}${action.target ? ` 对 ${action.target}` : ''}`}
      data-scene={action.kind}
      className="cinematic-root fixed inset-0 z-[100] m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-[#090b0d] p-0 backdrop:bg-[#090b0d]"
      onCancel={(event) => {
        event.preventDefault();
        onComplete();
      }}
      style={{
        '--cinematic-color': meta.color,
        '--cinematic-wash': meta.wash,
      } as React.CSSProperties}
    >
      {meta.image ? (
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
      ) : (
        <TribunalBackdrop action={action} meta={meta} />
      )}

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
    </dialog>
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
  const isSeer = ['seer', 'sheriff-opening', 'sheriff', 'badge', 'victory-good'].includes(kind);
  const isGuard = kind === 'guard';
  const isWitch = kind === 'witch-heal' || kind === 'witch-poison';
  const isShot = kind === 'hunter-shot' || kind === 'wolf-king';
  const isReveal = [
    'white-wolf', 'wolf-explode', 'idiot', 'badge-destroyed', 'exile', 'tie', 'last-words',
  ].includes(kind);

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

function TribunalBackdrop({
  action,
  meta,
}: {
  action: CinematicAction;
  meta: SceneMeta;
}) {
  return (
    <div
      className="cinematic-tribunal-field absolute inset-0 overflow-hidden"
      style={{ '--cinematic-wash': meta.wash } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="cinematic-tribunal-grid absolute inset-0" />
      <div className="cinematic-tribunal-ring absolute" />
      <div className="cinematic-tribunal-glyph absolute font-display" style={{ color: meta.color }}>
        {meta.mark}
      </div>
      <div className="cinematic-tally absolute">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </div>
      <div className="cinematic-tribunal-names absolute font-label">
        <span>{action.actor}</span>
        {action.target && <span>{action.target}</span>}
      </div>
    </div>
  );
}
