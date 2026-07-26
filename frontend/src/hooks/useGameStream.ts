/**
 * 单一数据源 hook：合并状态轮询 + 事件流轮询，并聚合成观战界面直接可用的结构化数据。
 *
 * 取代原来 useGame(轮 status) + EventTimeline(独立轮 events) 的双轮询。
 * 一次 setInterval，并发拉两个端点，游戏结束自动停。
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '../api/client';
import type {
  GameStatusResponse,
  GameResultResponse,
  GameEvent,
  PlayerWithRole,
  RoundData,
  PlayerReasoning,
} from '../types/api';
import {
  isPlayerSpeech,
  isPlayerVote,
  isWerewolfKill,
  isSeerInvestigate,
  isVoteResult,
  isPlayerDeath,
} from '../types/api';

const POLL_INTERVAL = 2000;

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
    if (isPlayerSpeech(e)) {
      get(e.data.round).speeches.push(e);
    } else if (isPlayerVote(e)) {
      get(e.data.round).votes.push(e);
    } else if (isVoteResult(e)) {
      get(e.data.round).voteResult = e;
    } else if (isPlayerDeath(e)) {
      get(e.data.round).deaths.push(e);
    } else if (isWerewolfKill(e) || isSeerInvestigate(e)) {
      // 夜晚行动不自带 round，归到当前已知的最大轮次
      // (事件流顺序保证夜晚行动紧跟 phase_change(round N) 之后)
      const maxRound = roundMap.size > 0 ? Math.max(...roundMap.keys()) : 1;
      get(maxRound).nightActions.push(e);
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
  refetch: () => void;
}

export function useGameStream(gameId: string | null): GameStream {
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [result, setResult] = useState<GameResultResponse | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // 触发手动 refetch
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!gameId) return;
    try {
      setError(null);
      // 并发拉 status + events
      const [statusData, eventsData] = await Promise.all([
        apiClient.getGameStatus(gameId),
        apiClient.getGameEvents(gameId).then((r) => r.events).catch(() => [] as GameEvent[]),
      ]);
      if (!mountedRef.current) return;
      setStatus(statusData);
      setEvents(eventsData);

      // 完成态才拉 result
      if (statusData.status === 'completed') {
        try {
          const resultData = await apiClient.getGameResult(gameId);
          if (mountedRef.current) setResult(resultData);
        } catch {
          /* result 失败不致命 */
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : '获取游戏数据失败');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [gameId]);

  // 首次加载
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchAll();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll, tick]);

  // 轮询：running/initialized 时每 2s 拉；completed/error 停
  useEffect(() => {
    if (!gameId) return;
    const terminal = status?.status === 'completed' || status?.status === 'error';
    if (terminal) return;

    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [gameId, status?.status, fetchAll]);

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
