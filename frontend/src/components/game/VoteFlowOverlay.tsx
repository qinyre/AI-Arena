import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

interface VotePath {
  voter: string;
  target: string;
  path: string;
  targetX: number;
  targetY: number;
}

interface Props {
  containerRef: RefObject<HTMLDivElement>;
  detail: Record<string, string>;
  eventKey: string;
}

export default function VoteFlowOverlay({ containerRef, detail, eventKey }: Props) {
  const root = useRef<SVGSVGElement>(null);
  const markerId = `vote-arrow-${useId().replace(/:/g, '')}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [paths, setPaths] = useState<VotePath[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;

    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rootRect = container.getBoundingClientRect();
        const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-player-id]'));
        const cardFor = (playerId: string) => cards.find((card) => card.dataset.playerId === playerId);
        const width = rootRect.width;
        const height = rootRect.height;
        if (width < 1024) {
          setSize({ width, height });
          setPaths([]);
          return;
        }
        const centerX = width / 2;
        const nextPaths: VotePath[] = [];

        Object.entries(detail).forEach(([voter, target]) => {
          if (!target || target === 'abstain') return;
          const voterCard = cardFor(voter);
          const targetCard = cardFor(target);
          if (!voterCard || !targetCard) return;
          const voterRect = voterCard.getBoundingClientRect();
          const targetRect = targetCard.getBoundingClientRect();
          const voterOnLeft = voterRect.left + voterRect.width / 2 < rootRect.left + centerX;
          const targetOnLeft = targetRect.left + targetRect.width / 2 < rootRect.left + centerX;
          const sourceX = (voterOnLeft ? voterRect.right : voterRect.left) - rootRect.left;
          const targetX = (targetOnLeft ? targetRect.right : targetRect.left) - rootRect.left;
          const sourceY = voterRect.top + voterRect.height / 2 - rootRect.top;
          const targetY = targetRect.top + targetRect.height / 2 - rootRect.top;
          const bendX = voterOnLeft === targetOnLeft
            ? (voterOnLeft ? Math.max(sourceX, targetX) + 74 : Math.min(sourceX, targetX) - 74)
            : centerX;

          nextPaths.push({
            voter,
            target,
            path: `M ${sourceX} ${sourceY} C ${bendX} ${sourceY}, ${bendX} ${targetY}, ${targetX} ${targetY}`,
            targetX,
            targetY,
          });
        });

        setSize({ width, height });
        setPaths(nextPaths);
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, detail, eventKey]);

  useGSAP(() => {
    if (!root.current || !paths.length) return;
    const pathNodes = root.current.querySelectorAll('.vote-flow-path');
    const targetNodes = root.current.querySelectorAll('.vote-flow-target');
    if (!pathNodes.length || !targetNodes.length) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        pathNodes,
        { strokeDasharray: 1, strokeDashoffset: 1, autoAlpha: 0 },
        {
          strokeDashoffset: 0,
          autoAlpha: 0.72,
          duration: 0.72,
          stagger: 0.045,
          ease: 'power2.out',
        },
      );
      gsap.fromTo(
        targetNodes,
        { scale: 0.3, autoAlpha: 0 },
        { scale: 1, autoAlpha: 0.85, duration: 0.35, stagger: 0.04, ease: 'back.out(1.8)' },
      );
      return () => undefined;
    });
    return () => media.revert();
  }, {
    scope: root,
    dependencies: [eventKey, paths.length],
    revertOnUpdate: true,
  });

  return (
    <svg
      ref={root}
      className="vote-flow-overlay pointer-events-none absolute inset-0 z-20 hidden h-full w-full overflow-visible lg:block"
      viewBox={`0 0 ${size.width} ${size.height}`}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#c9a65b" />
        </marker>
      </defs>
      {paths.map((vote) => (
        <g key={`${vote.voter}-${vote.target}`}>
          <path
            className="vote-flow-path"
            d={vote.path}
            pathLength="1"
            markerEnd={`url(#${markerId})`}
          />
          <circle
            className="vote-flow-target"
            cx={vote.targetX}
            cy={vote.targetY}
            r="7"
          />
        </g>
      ))}
    </svg>
  );
}
