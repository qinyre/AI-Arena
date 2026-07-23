/**
 * API Types
 */

export interface PlayerConfig {
  player_id: string;
  // provider 与自定义端点二选一：
  //   - 用 provider 名时走后端 yaml 白名单
  //   - 用自定义端点时省略 provider，填 api_format + base_url（见 orchestrator）
  provider?: string;
  model: string;
  api_format?: 'openai' | 'anthropic';
  base_url?: string;
  api_key?: string;
  key_env?: string;
}

// /api/providers 返回的类型
export interface ModelInfo {
  id: string;
  cost_per_1m_input: number;
  cost_per_1m_output: number;
  context: number;
}

export interface ProviderInfo {
  protocol: 'openai' | 'anthropic';
  api_base: string;
  needs_api_key: boolean;
  models: ModelInfo[];
}

export interface ProvidersResponse {
  providers: Record<string, ProviderInfo>;
  default_provider: string;
  default_model: string;
}

export interface CreateGameRequest {
  player_configs: PlayerConfig[];
  seed?: number;
}

export interface CreateGameResponse {
  game_id: string;
  status: string;
  message: string;
  players: string[];
}

export interface GameStatusResponse {
  game_id: string;
  status: 'pending' | 'initialized' | 'running' | 'completed' | 'error';
  current_phase?: string;
  current_round?: number;
  alive_players: string[];
  dead_players: string[];
  winner?: string;
  total_cost?: number;
  role_assignment: Record<string, string>;  // 玩家角色分配
}

export interface GameResultResponse {
  game_id: string;
  winner: string;
  final_round: number;
  reason: string;
  duration_seconds: number;
  total_cost: number;
  player_costs: Record<string, number>;
  summary: any;
}

export interface GameListItem {
  game_id: string;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface ListGamesResponse {
  total: number;
  games: GameListItem[];
}

export interface StatsResponse {
  total_games: number;
  completed: number;
  running: number;
  error: number;
  total_cost: number;
}

// ---- 事件类型(按 event_type 判别的联合类型)----
// 后端 engine 的 9 种 event_type，每种 data 结构不同。
// 用联合类型后，EventCard 等组件访问 data.speaker/data.target 会有类型保护。

/** 所有事件共享的字段 */
interface GameEventBase {
  visibility: string;
  visible_to: string[];
  timestamp: string;
}

export interface GameStartEvent extends GameEventBase {
  event_type: 'game_start';
  data: {
    game_id?: string;
    players: string[];
    role_assignment: Record<string, string>;
    timestamp?: string;
  };
}

export interface PhaseChangeEvent extends GameEventBase {
  event_type: 'phase_change';
  data: { from: string; to: string; phase: string; round: number };
}

export interface WerewolfKillEvent extends GameEventBase {
  event_type: 'werewolf_kill';
  data: { killer: string; target: string; reasoning: string };
}

export interface SeerInvestigateEvent extends GameEventBase {
  event_type: 'seer_investigate';
  data: { seer: string; target: string; result: string; reasoning: string };
}

export interface PlayerSpeechEvent extends GameEventBase {
  event_type: 'player_speech';
  data: {
    speaker: string;
    content: string;
    claim_role: string; // none | seer | villager
    reasoning: string;
    round: number;
  };
}

export interface PlayerVoteEvent extends GameEventBase {
  event_type: 'player_vote';
  data: { voter: string; target: string; reasoning: string; round: number };
}

export interface VoteResultEvent extends GameEventBase {
  event_type: 'vote_result';
  data: {
    result: 'eliminated' | 'tie' | 'no_votes';
    eliminated?: string;
    candidates?: string[];
    votes?: Record<string, number>;
    round: number;
  };
}

export interface PlayerDeathEvent extends GameEventBase {
  event_type: 'player_death';
  data: { player: string; cause: 'werewolf_kill' | 'voted_out'; round: number };
}

export interface GameEndEvent extends GameEventBase {
  event_type: 'game_end';
  data: {
    winner: 'good' | 'werewolf';
    reason: string;
    final_round: number;
    duration_seconds: number;
  };
}

/** 未知事件类型的兜底(引擎未来可能新增) */
export interface UnknownEvent extends GameEventBase {
  event_type: string;
  data: Record<string, any>;
}

export type GameEvent =
  | GameStartEvent
  | PhaseChangeEvent
  | WerewolfKillEvent
  | SeerInvestigateEvent
  | PlayerSpeechEvent
  | PlayerVoteEvent
  | VoteResultEvent
  | PlayerDeathEvent
  | GameEndEvent
  | UnknownEvent;

// ---- 类型守卫：因 UnknownEvent.event_type 为 string 会破坏 switch 收窄，
// 用这些守卫在 case 分支内显式收窄到具体类型。----
export function isPlayerSpeech(e: GameEvent): e is PlayerSpeechEvent {
  return e.event_type === 'player_speech';
}
export function isPlayerVote(e: GameEvent): e is PlayerVoteEvent {
  return e.event_type === 'player_vote';
}
export function isVoteResult(e: GameEvent): e is VoteResultEvent {
  return e.event_type === 'vote_result';
}
export function isPlayerDeath(e: GameEvent): e is PlayerDeathEvent {
  return e.event_type === 'player_death';
}
export function isWerewolfKill(e: GameEvent): e is WerewolfKillEvent {
  return e.event_type === 'werewolf_kill';
}
export function isSeerInvestigate(e: GameEvent): e is SeerInvestigateEvent {
  return e.event_type === 'seer_investigate';
}
export function isPhaseChange(e: GameEvent): e is PhaseChangeEvent {
  return e.event_type === 'phase_change';
}
export function isGameEnd(e: GameEvent): e is GameEndEvent {
  return e.event_type === 'game_end';
}

export interface GameEventResponse {
  game_id: string;
  events: GameEvent[];
  total: number;
}

// ---- 观战界面用的派生类型 ----

export type Role = 'werewolf' | 'seer' | 'villager' | string;
export type GamePhase = 'night' | 'day' | 'vote' | string;

/** 玩家 + 身份 + 存活状态(合并 status.role_assignment 与 alive/dead) */
export interface PlayerWithRole {
  id: string;
  role: Role;
  alive: boolean;
  /** 死因(从 player_death 事件反推): werewolf_kill | voted_out */
  deathCause?: string;
  deathRound?: number;
}

/** 单轮的结构化数据(供 EventFeed 按轮次分组叙事) */
export interface RoundData {
  round: number;
  speeches: PlayerSpeechEvent[];
  votes: PlayerVoteEvent[];
  voteResult?: VoteResultEvent;
  deaths: PlayerDeathEvent[];
  nightActions: (WerewolfKillEvent | SeerInvestigateEvent)[];
}

/** 单个玩家的最新思考(供 ReasoningSidebar 跟踪) */
export interface PlayerReasoning {
  playerId: string;
  text: string;
  /** 思考对应的动作类型,用于侧栏分类展示 */
  kind: 'speech' | 'kill' | 'investigate' | 'vote';
  round: number;
  timestamp: string;
}
