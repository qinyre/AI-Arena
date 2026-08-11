/**
 * 单一数据源 hook：首屏读取一次快照，之后通过 SSE 增量接收状态与事件。
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '../api/client';
import type {
  GameStatusResponse,
  GameResultResponse,
  GameEvent,
  GameStreamUpdate,
  PlayerWithRole,
  RoundData,
  PlayerReasoning,
} from '../types/api';
import {
  isPlayerSpeech,
  isPlayerVote,
  isPlayerAbstain,
  isWerewolfKill,
  isSeerInvestigate,
  isVoteResult,
  isPlayerDeath,
  isPhaseChange,
} from '../types/api';

/** 从死亡事件里提取每个玩家的死因/死轮 */
interface DeathInfo {
  cause: string;
  round: number;
}

function buildDeathMap(events: GameEvent[]): Record<string, DeathInfo> {
  const map: Record<string, DeathInfo> = {};
  for (const e of events) {
    if (isPlayerDeath(e)) {
      map[e.data.player] = { cause: e.data.cause, round: e.data.round };
    }
  }
  return map;
}

/** 把原始事件按 round 聚合成单轮结构化数据 */
function buildRounds(events: GameEvent[]): RoundData[] {
  const roundMap = new Map<number, RoundData>();
  let currentRound = 1;
  const get = (round: number): RoundData => {
    let r = roundMap.get(round);
    if (!r) {
      r = {
        round,
        speeches: [],
        votes: [],
        voteResult: undefined,
        deaths: [],
        nightActions: [],
      };
      roundMap.set(round, r);
    }
    return r;
  };

  for (const e of events) {
    if (isPhaseChange(e)) {
      currentRound = Number.isFinite(e.data.round) ? e.data.round : currentRound;
    } else if (isPlayerSpeech(e)) {
      get(e.data.round).speeches.push(e);
    } else if (isPlayerVote(e)) {
      get(e.data.round).votes.push(e);
    } else if (isPlayerAbstain(e)) {
      get(e.data.round);
    } else if (isVoteResult(e)) {
      get(e.data.round).voteResult = e;
    } else if (isPlayerDeath(e)) {
      get(e.data.round).deaths.push(e);
    } else if (isWerewolfKill(e) || isSeerInvestigate(e)) {
      // 新事件直接携带 round；currentRound 兼容尚未补齐坐标的旧存档。
      const eventRound = Number.isFinite(e.data.round) ? e.data.round : currentRound;
      get(eventRound).nightActions.push(e);
    }
  }
  return Array.from(roundMap.values()).sort((a, b) => a.round - b.round);
}

/** 从事件流里给每个玩家找最近一次带 reasoning 的动作 */
function buildLatestReasoning(
  events: GameEvent[],
  playerFilter?: string
): PlayerReasoning | null {
  let latest: PlayerReasoning | null = null;
  for (const e of events) {
    if (playerFilter && !eventInvolvesPlayer(e, playerFilter)) continue;
    const r = reasoningFromEvent(e);
    if (r && (!latest || r.timestamp >= latest.timestamp)) {
      latest = r;
    }
  }
  return latest;
}

function eventInvolvesPlayer(e: GameEvent, pid: string): boolean {
  if (isPlayerSpeech(e)) return e.data.speaker === pid;
  if (isPlayerVote(e)) return e.data.voter === pid;
  if (isPlayerAbstain(e)) return e.data.voter === pid;
  if (isWerewolfKill(e)) return e.data.killer === pid;
  if (isSeerInvestigate(e)) return e.data.seer === pid;
  return false;
}

function reasoningFromEvent(e: GameEvent): PlayerReasoning | null {
  if (isPlayerSpeech(e)) {
    return e.data.reasoning
      ? { playerId: e.data.speaker, text: e.data.reasoning, kind: 'speech', round: e.data.round, timestamp: e.timestamp }
      : null;
  }
  if (isPlayerVote(e)) {
    return e.data.reasoning
      ? { playerId: e.data.voter, text: e.data.reasoning, kind: 'vote', round: e.data.round, timestamp: e.timestamp }
      : null;
  }
  if (isPlayerAbstain(e)) {
    return e.data.reasoning
      ? { playerId: e.data.voter, text: e.data.reasoning, kind: 'vote', round: e.data.round, timestamp: e.timestamp }
      : null;
  }
  if (isWerewolfKill(e)) {
    return { playerId: e.data.killer, text: e.data.reasoning, kind: 'kill', round: 0, timestamp: e.timestamp };
  }
  if (isSeerInvestigate(e)) {
    return { playerId: e.data.seer, text: e.data.reasoning, kind: 'investigate', round: 0, timestamp: e.timestamp };
  }
  return null;
}

export interface GameStream {
  status: GameStatusResponse | null;
  result: GameResultResponse | null;
  events: GameEvent[];
  players: PlayerWithRole[];
  rounds: RoundData[];
  /** 当前发言者(最近一条 player_speech 的 speaker) */
  currentSpeaker: string | null;
  loading: boolean;
  error: string | null;
  connectionState: 'connecting' | 'live' | 'reconnecting' | 'closed';
  refetch: () => void;
}

export function useGameStream(gameId: string | null): GameStream {
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [result, setResult] = useState<GameResultResponse | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<GameStream['connectionState']>('connecting');
  const [tick, setTick] = useState(0); // 触发手动 refetch
  const cursorRef = useRef(0);

  // 首次读取快照；SSE 中断时以指数退避重连，并先用 REST 游标补齐遗漏事件。
  useEffect(() => {
    if (!gameId) {
      setConnectionState('closed');
      return;
    }
    const activeGameId = gameId;
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let connectedAt = 0;
    let resultLoading = false;
    let latestStatus: GameStatusResponse['status'] | null = null;

    const appendPage = (page: {
      events: GameEvent[];
      from_index: number;
      next_index: number;
    }) => {
      const overlap = Math.max(0, cursorRef.current - page.from_index);
      const additions = page.events.slice(overlap);
      cursorRef.current = Math.max(cursorRef.current, page.next_index);
      if (additions.length) setEvents((current) => [...current, ...additions]);
    };

    const loadResult = async () => {
      if (resultLoading || latestStatus !== 'completed') return;
      resultLoading = true;
      try {
        const resultData = await apiClient.getGameResult(activeGameId);
        if (!cancelled) setResult(resultData);
      } catch {
        /* result 失败不阻断事件流 */
      } finally {
        resultLoading = false;
      }
    };

    function scheduleReconnect(message: string) {
      if (cancelled || latestStatus === 'completed' || latestStatus === 'error') return;
      source?.close();
      source = null;
      if (retryTimer) clearTimeout(retryTimer);
      const delay = Math.min(1000 * (2 ** retryAttempt), 15000);
      retryAttempt += 1;
      setConnectionState('reconnecting');
      setError(`${message}，${Math.ceil(delay / 1000)} 秒后补齐事件并重连…`);
      retryTimer = setTimeout(() => { void recover(); }, delay);
    }

    async function recover() {
      retryTimer = null;
      try {
        const [statusData, eventData] = await Promise.all([
          apiClient.getGameStatus(activeGameId),
          apiClient.getGameEvents(activeGameId, cursorRef.current),
        ]);
        if (cancelled) return;
        appendPage(eventData);
        latestStatus = statusData.status;
        setStatus(statusData);
        if (latestStatus === 'completed') {
          setConnectionState('closed');
          setError(null);
          await loadResult();
        } else if (latestStatus === 'error') {
          setConnectionState('closed');
          setError('对局已异常终止');
        } else {
          connect(cursorRef.current);
        }
      } catch (err) {
        scheduleReconnect(err instanceof Error ? err.message : '恢复实时连接失败');
      }
    }

    function connect(after: number) {
      source?.close();
      const nextSource = new EventSource(apiClient.getGameEventStreamUrl(activeGameId, after));
      source = nextSource;
      nextSource.onopen = () => {
        if (cancelled || source !== nextSource) return;
        connectedAt = Date.now();
        setConnectionState('live');
        setError(null);
      };
      nextSource.addEventListener('update', (message) => {
        if (cancelled || source !== nextSource) return;
        try {
          const update = JSON.parse((message as MessageEvent<string>).data) as GameStreamUpdate;
          appendPage(update);
          latestStatus = update.status.status;
          setStatus(update.status);
          if (latestStatus === 'completed') void loadResult();
        } catch {
          setError('实时事件格式无效，请手动刷新');
        }
      });
      nextSource.addEventListener('end', () => {
        if (source !== nextSource) return;
        nextSource.close();
        source = null;
        setConnectionState('closed');
        setError(latestStatus === 'error' ? '对局已异常终止' : null);
        void loadResult();
      });
      nextSource.onerror = () => {
        if (cancelled || source !== nextSource) return;
        if (connectedAt && Date.now() - connectedAt >= 30000) retryAttempt = 0;
        connectedAt = 0;
        scheduleReconnect('实时连接中断');
      };
    }

    const loadSnapshot = async () => {
      setLoading(true);
      setConnectionState('connecting');
      setError(null);
      setResult(null);
      try {
        const [statusData, eventData] = await Promise.all([
          apiClient.getGameStatus(activeGameId),
          apiClient.getGameEvents(activeGameId),
        ]);
        if (cancelled) return;
        latestStatus = statusData.status;
        cursorRef.current = eventData.next_index;
        setStatus(statusData);
        setEvents(eventData.events);
        if (statusData.status === 'completed') {
          setConnectionState('closed');
          await loadResult();
        } else if (statusData.status === 'error') {
          setConnectionState('closed');
          setError('对局已异常终止');
        } else {
          connect(eventData.next_index);
        }
      } catch (err) {
        if (!cancelled) {
          scheduleReconnect(err instanceof Error ? err.message : '获取游戏数据失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSnapshot();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [gameId, tick]);

  // ---- derived: 聚合 ----
  const players = useMemo<PlayerWithRole[]>(() => {
    if (!status) return [];
    const roleMap = status.role_assignment || {};
    const deathMap = buildDeathMap(events);
    const allIds = new Set([...status.alive_players, ...status.dead_players, ...Object.keys(roleMap)]);
    return Array.from(allIds).map((id) => {
      const alive = status.alive_players.includes(id);
      const d = deathMap[id];
      return {
        id,
        avatarId: status.avatar_assignment?.[id],
        role: roleMap[id] || 'villager',
        alive,
        isSheriff: status.sheriff_id === id,
        personality: status.personality_assignment?.[id],
        deathCause: d?.cause,
        deathRound: d?.round,
      };
    });
  }, [status, events]);

  const rounds = useMemo(() => buildRounds(events), [events]);

  const currentSpeaker = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (isPlayerSpeech(e)) return e.data.speaker;
    }
    return null;
  }, [events]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return {
    status,
    result,
    events,
    players,
    rounds,
    currentSpeaker,
    loading,
    error,
    connectionState,
    refetch,
  };
}

/** 给 ReasoningSidebar 用的辅助：取某玩家最近思考 */
export function getLatestReasoningForPlayer(
  events: GameEvent[],
  playerId: string
): PlayerReasoning | null {
  return buildLatestReasoning(events, playerId);
}
