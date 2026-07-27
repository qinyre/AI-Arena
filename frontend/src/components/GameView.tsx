/**
 * 观战主页面:剧场环绕式布局(借鉴稿 Nocturne Stage)。
 * 顶栏(GameHeader) + [左玩家栏 | 中央时间线 | 右玩家栏]。
 * 对局复盘放在整个页面底部(三栏下方,页面级区块),不挤压三栏;
 * 整个页面可滚动,三栏保持固定高度内部滚动,复盘自然出现在页面下方。
 *
 * 玩家按 index 分两半环绕舞台。AI 推理不再常驻右栏,改为时间线事件内点击展开。
 * 数据由单一 hook useGameStream 提供(合并 status+events 轮询 + 聚合 derived)。
 * 上帝视角:开局即从 status.role_assignment 显示所有人身份。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStream } from '../hooks/useGameStream';
import GameHeader from './game/GameHeader';
import PlayerTable from './game/PlayerTable';
import EventFeed from './game/EventFeed';
import ResultPanel from './game/ResultPanel';
import ActionCinematics from './game/ActionCinematics';
import ReplayControls from './game/ReplayControls';
import TheatreControls from './game/TheatreControls';
import VoteFlowOverlay from './game/VoteFlowOverlay';
import { useArenaAudio } from './game/useArenaAudio';
import {
  activeVoteDetail,
  currentSpeaker as speakerAt,
  playerAttention,
} from './game/gameDirector';
import { isPhaseChange, isPlayerDeath } from '../types/api';
import type { GameEvent, GameReview, GameStatusResponse, RoundData } from '../types/api';
import { cn } from '../utils/cn';

interface Props {
  gameId: string;
}

export default function GameView({ gameId }: Props) {
  const { status, result, events, players, rounds, loading, error } =
    useGameStream(gameId);
  const stageRef = useRef<HTMLDivElement>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [replayCursor, setReplayCursor] = useState<number | null>(null);
  const [generatedReview, setGeneratedReview] = useState<GameReview>();
  const [cinematicActive, setCinematicActive] = useState(false);
  const [directorEnabled, setDirectorEnabled] = useState(
    () => localStorage.getItem('ai-arena:director') !== '0',
  );
  const isCompleted = status?.status === 'completed';

  useEffect(() => {
    if (!isCompleted) setReplayCursor(null);
  }, [isCompleted]);

  useEffect(() => {
    setReplayCursor(null);
    setGeneratedReview(undefined);
  }, [gameId]);

  const cursor = isCompleted ? (replayCursor ?? events.length) : events.length;
  const displayEvents = useMemo(
    () => isCompleted ? events.slice(0, cursor) : events,
    [cursor, events, isCompleted],
  );
  const displayPlayers = useMemo(() => {
    if (!isCompleted || cursor >= events.length) return players;
    const deaths = new Map<string, { cause: string; round: number }>();
    const sheriffId = sheriffAt(displayEvents);
    displayEvents.forEach((event) => {
      if (isPlayerDeath(event)) {
        deaths.set(event.data.player, {
          cause: event.data.cause,
          round: event.data.round,
        });
      }
    });
    return players.map((player) => {
      const death = deaths.get(player.id);
      return {
        ...player,
        alive: !death,
        isSheriff: player.id === sheriffId,
        deathCause: death?.cause,
        deathRound: death?.round,
      };
    });
  }, [cursor, displayEvents, events.length, isCompleted, players]);
  const displayRounds = useMemo(
    () => isCompleted ? filterRounds(rounds, new Set(displayEvents)) : rounds,
    [displayEvents, isCompleted, rounds],
  );
  const displaySpeaker = useMemo(() => speakerAt(displayEvents), [displayEvents]);
  const displayStatus = useMemo(
    () => replayStatus(status, displayEvents, isCompleted && cursor < events.length),
    [cursor, displayEvents, events.length, isCompleted, status],
  );
  const attention = useMemo(() => playerAttention(displayEvents), [displayEvents]);
  const voteDetail = useMemo(() => activeVoteDetail(displayEvents), [displayEvents]);
  const voteEventKey = displayEvents.length
    ? `${displayEvents.length}-${displayEvents[displayEvents.length - 1].timestamp}`
    : 'empty';
  const audio = useArenaAudio(
    displayEvents,
    displayStatus?.current_phase,
    status?.status === 'running' || (isCompleted && replayCursor !== null),
  );

  const changeDirector = (enabled: boolean) => {
    localStorage.setItem('ai-arena:director', enabled ? '1' : '0');
    setDirectorEnabled(enabled);
  };

  // 首次加载
  if (loading && !status) {
    return (
      <div className="glass-panel rounded-sm p-12 text-center">
        <span className="mb-4 inline-block h-2 w-2 animate-pulse rounded-full bg-[#b99758]" />
        <p className="font-display text-lg tracking-[0.08em] text-[#e6dfd2]">正在开启旁观席</p>
        <p className="mt-1 font-body text-xs text-[#aaa79f]/55">同步对局状态与行动记录</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="glass-panel rounded-sm p-6">
        <div className="flex items-center gap-2 border border-[#b8463d]/40 bg-[#b8463d]/10 px-4 py-3 text-[#d28c85]">
          <span aria-hidden="true">!</span>
          <span className="font-body">{error}</span>
        </div>
      </div>
    );
  }

  // 玩家分两半:前一半左栏,后一半右栏(结束后仍保留,方便复盘)
  const mid = Math.ceil(displayPlayers.length / 2);
  const leftPlayers = displayPlayers.slice(0, mid);
  const rightPlayers = displayPlayers.slice(mid);
  const activeReview = generatedReview ?? result?.ai_review;

  return (
    <div className="flex flex-col gap-3.5">
      <ActionCinematics
        events={displayEvents}
        suppressInitial={isCompleted && replayCursor === null}
        replayMode={isCompleted}
        enabled={directorEnabled}
        roleAssignment={displayStatus?.role_assignment}
        onActiveChange={setCinematicActive}
      />

      {/* 顶栏 */}
      <GameHeader
        gameId={gameId}
        status={displayStatus}
        controls={(
          <TheatreControls
            directorEnabled={directorEnabled}
            onDirectorChange={changeDirector}
            soundEnabled={audio.enabled}
            soundReady={audio.ready}
            volume={audio.volume}
            onSoundChange={audio.setEnabled}
            onVolumeChange={audio.setVolume}
          />
        )}
      />

      {isCompleted && (
        <ReplayControls
          events={events}
          cursor={cursor}
          onCursorChange={setReplayCursor}
          turningPoints={activeReview?.turning_points ?? []}
          directorEnabled={directorEnabled}
          blocked={cinematicActive}
        />
      )}

      {/* 剧场环绕:左玩家栏 | 中央时间线 | 右玩家栏
          三栏固定高度、各自内部滚动,不被下方复盘挤压 */}
      <div ref={stageRef} className={cn(
        'relative grid min-h-[480px] grid-cols-1 gap-3 lg:grid-cols-[minmax(230px,.82fr)_minmax(0,2.3fr)_minmax(230px,.82fr)]',
        isCompleted ? 'h-[calc(100vh-330px)]' : 'h-[calc(100vh-180px)]',
      )}>
        <VoteFlowOverlay
          containerRef={stageRef}
          detail={voteDetail}
          eventKey={voteEventKey}
        />

        {/* 左栏:参与者(前一半) */}
        <aside className="arena-rail hidden overflow-hidden rounded-sm p-3 lg:flex lg:flex-col">
          <PlayerTable
            players={leftPlayers}
            currentSpeaker={displaySpeaker}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={(id) => setSelectedPlayer((current) => current === id ? null : id)}
            attention={attention}
            side="left"
          />
        </aside>

        {/* 中栏:事件时间线(主舞台) */}
        <main className="chronicle-panel overflow-hidden rounded-sm p-3 sm:p-4">
          <EventFeed
            events={displayEvents}
            rounds={displayRounds}
            status={displayStatus}
            followPlayback={isCompleted}
          />
        </main>

        {/* 右栏:参与者(后一半) */}
        <aside className="arena-rail hidden overflow-hidden rounded-sm p-3 lg:flex lg:flex-col">
          <PlayerTable
            players={rightPlayers}
            currentSpeaker={displaySpeaker}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={(id) => setSelectedPlayer((current) => current === id ? null : id)}
            attention={attention}
            side="right"
          />
        </aside>
      </div>

      {/* 对局复盘:整个页面底部,页面级区块。往下滚整个页面即可看到,不挤压三栏 */}
      {isCompleted && (
        <ResultPanel
          result={result}
          status={status}
          onReviewGenerated={setGeneratedReview}
        />
      )}
    </div>
  );
}

function filterRounds(rounds: RoundData[], visible: Set<object>): RoundData[] {
  return rounds.map((round) => ({
    ...round,
    speeches: round.speeches.filter((event) => visible.has(event)),
    votes: round.votes.filter((event) => visible.has(event)),
    voteResult: round.voteResult && visible.has(round.voteResult) ? round.voteResult : undefined,
    deaths: round.deaths.filter((event) => visible.has(event)),
    nightActions: round.nightActions.filter((event) => visible.has(event)),
  })).filter((round) => (
    round.speeches.length
    || round.votes.length
    || round.voteResult
    || round.deaths.length
    || round.nightActions.length
  ));
}

function replayStatus(
  status: GameStatusResponse | null,
  events: GameEvent[],
  replaying: boolean,
): GameStatusResponse | null {
  if (!status || !replaying) return status;
  let phase = events.length > 0 ? 'night' : 'setup';
  let round = events.length > 0 ? 1 : 0;
  events.forEach((event) => {
    if (isPhaseChange(event)) {
      phase = event.data.to;
      round = event.data.round;
    }
  });
  return {
    ...status,
    current_phase: phase,
    current_round: round,
    sheriff_id: sheriffAt(events) ?? undefined,
  };
}

function sheriffAt(events: GameEvent[]): string | null {
  let sheriff: string | null = null;
  events.forEach((event) => {
    if (
      event.event_type === 'sheriff_election_result'
      && event.data.result === 'elected'
    ) {
      sheriff = String(event.data.sheriff);
    } else if (event.event_type === 'badge_transferred') {
      sheriff = String(event.data.to);
    } else if (
      event.event_type === 'badge_destroyed'
      || (
        event.event_type === 'sheriff_election_result'
        && ['no_sheriff', 'cancelled_by_self_destruct'].includes(String(event.data.result))
      )
    ) {
      sheriff = null;
    }
  });
  return sheriff;
}
