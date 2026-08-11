/**
 * API Types
 */

export interface PlayerConfig {
  player_id: string;
  avatar_id?: string;
  // provider 与自定义端点二选一：
  //   - 用 provider 名时走后端 yaml 白名单
  //   - 用自定义端点时省略 provider，填 api_format + base_url（见 orchestrator）
  provider?: string;
  model: string;
  api_format?: 'openai' | 'anthropic';
  base_url?: string;
  api_key?: string;
  key_env?: string;
  personality_id?: string;
  personality?: PersonalityProfile;
}

export interface PersonalityProfile {
  name: string;
  tone: 'calm' | 'direct' | 'diplomatic' | 'playful' | 'dramatic';
  reasoning_style: 'evidence' | 'intuition' | 'pressure' | 'consensus';
  risk_tolerance: number;
  assertiveness: number;
  verbosity: number;
}

export type BudgetTier = 'economy' | 'standard' | 'premium';
export type RoleId =
  | 'werewolf' | 'seer' | 'witch' | 'hunter' | 'idiot' | 'guard'
  | 'white_wolf_king' | 'wolf_king' | 'wolf_beauty' | 'knight' | 'villager';

export interface CustomBoardConfig {
  name: string;
  roles: RoleId[];
  win_rule: 'parity' | 'edge';
}

// /api/providers 返回的类型
export interface ModelInfo {
  id: string;
  cost_per_1m_input: number;
  cost_per_1m_output: number;
  context: number;
}

export interface ProviderInfo {
  display_name: string;
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

export interface ModelConnectionTestRequest {
  provider?: string;
  api_format: 'openai' | 'anthropic';
  base_url?: string;
  model: string;
  api_key?: string;
}

export interface ModelConnectionTestResponse {
  ok: boolean;
  latency_ms: number;
  model: string;
  usage: { total_tokens?: number };
}

export interface GameReviewRequest {
  provider?: string;
  api_format: 'openai' | 'anthropic';
  base_url?: string;
  model: string;
  api_key?: string;
}

export interface GameReview {
  headline: string;
  overview: string;
  mvp: { player_id: string; reason: string };
  turning_points: Array<{
    round: number;
    /** 新复盘为精确事件索引；可选是为了兼容旧存档。 */
    event_index?: number;
    title: string;
    impact: string;
  }>;
  player_reviews: Array<{
    player_id: string;
    score: number;
    verdict: string;
    strengths: string[];
    improvements: string[];
  }>;
  awards: Array<{ title: string; player_id: string; reason: string }>;
  model: string;
  usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  generated_at: string;
}

export interface MatchFactDeath {
  player_id: string;
  cause: string;
  round: number;
  event_index: number;
}

export interface MatchFactPlayer {
  role: string;
  faction: 'good' | 'werewolf';
  survived: boolean;
  death: MatchFactDeath | null;
  speech_count: number;
  claims: Array<{ role: string; round: number; event_index: number }>;
  day_votes: {
    cast: number;
    abstained: number;
    targets_werewolf: number;
    targets_good: number;
  };
  sheriff_votes: { cast: number; abstained: number };
  skill_actions: Array<{
    type: string;
    event_index: number;
    round: number;
    target?: string;
    result?: string;
    phase?: string;
  }>;
  wolf_chat_messages: number;
}

export interface MatchFacts {
  schema_version: number;
  event_count: number;
  winner?: 'good' | 'werewolf' | 'draw';
  players: Record<string, MatchFactPlayer>;
  deaths: MatchFactDeath[];
  vote_rounds: Array<Record<string, unknown>>;
  key_events: Array<Record<string, unknown>>;
}

export interface CreateGameRequest {
  player_configs: PlayerConfig[];
  board_id: string;
  custom_board?: CustomBoardConfig;
  seed?: number;
  enable_sheriff?: boolean;
  budget_tier?: BudgetTier;
  max_rounds?: number;
  parent_game_id?: string;
}

export interface CreateGameResponse {
  game_id: string;
  status: string;
  message: string;
  players: string[];
  board_id: string;
  series_id: string;
  series_game_number: number;
}

export interface ReplayConfig {
  board_id: string;
  custom_board?: CustomBoardConfig;
  enable_sheriff: boolean;
  budget_tier: BudgetTier;
  max_rounds?: number;
  players: PlayerConfig[];
}

export interface SeriesSummary {
  series_id: string;
  current_game_number: number;
  total_games: number;
  completed_games: number;
  score: { good: number; werewolf: number; draw: number };
  games: Array<{
    game_id: string;
    game_number: number;
    status: string;
    winner?: 'good' | 'werewolf' | 'draw';
  }>;
}

export interface GameStatusResponse {
  game_id: string;
  status: 'pending' | 'initialized' | 'running' | 'paused' | 'completed' | 'error';
  current_phase?: string;
  current_round?: number;
  alive_players: string[];
  dead_players: string[];
  winner?: string;
  total_cost?: number;
  custom_model_players?: string[];
  custom_tokens?: number;
  role_assignment: Record<string, string>;  // 玩家角色分配
  personality_assignment: Record<string, PersonalityProfile>;
  avatar_assignment: Record<string, string>;
  sheriff_enabled: boolean;
  sheriff_id?: string;
}

export interface GameResultResponse {
  game_id: string;
  winner: 'good' | 'werewolf' | 'draw';
  final_round: number;
  reason: string;
  duration_seconds: number;
  total_cost: number;
  player_costs: Record<string, number>;
  custom_model_players: string[];
  custom_tokens: number;
  player_tokens: Record<string, number>;
  llm_metrics: {
    total_calls: number;
    successful_calls: number;
    fallback_calls: number;
    repaired_json_calls: number;
    average_latency_ms: number;
    by_player: Record<string, { calls: number; fallbacks: number; tokens: number }>;
    by_stage: Record<string, { calls: number; fallbacks: number; tokens: number }>;
  };
  match_facts: MatchFacts;
  replay_config: ReplayConfig | Record<string, never>;
  series: SeriesSummary;
  budget_tier: BudgetTier;
  budget_profile: {
    max_output_tokens: number;
    player_token_budget: number;
    game_token_budget: number;
  };
  summary: any;
  ai_review?: GameReview;
}

export interface GameListItem {
  game_id: string;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  board_id?: string;
  winner?: 'good' | 'werewolf' | 'draw';
  series_id?: string;
  series_game_number: number;
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
  custom_tokens: number;
  model_stats: PerformanceStat[];
  personality_stats: PerformanceStat[];
}

export interface PerformanceStat {
  id: string;
  label: string;
  provider?: string;
  model?: string;
  tone?: PersonalityProfile['tone'];
  reasoning_style?: PersonalityProfile['reasoning_style'];
  appearances: number;
  games: number;
  wins: number;
  win_rate: number;
  calls: number;
  tokens: number;
  fallbacks: number;
  fallback_rate: number;
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
    board_id?: string;
    board_name?: string;
    sheriff_enabled?: boolean;
    timestamp?: string;
  };
}

export interface PhaseChangeEvent extends GameEventBase {
  event_type: 'phase_change';
  data: { from: string; to: string; phase: string; round: number; candidates?: string[] };
}

export interface WerewolfKillEvent extends GameEventBase {
  event_type: 'werewolf_kill';
  data: { killer: string; target: string; reasoning: string; round: number; phase?: string };
}

export interface SeerInvestigateEvent extends GameEventBase {
  event_type: 'seer_investigate';
  data: { seer: string; target: string; result: string; reasoning: string; round: number; phase?: string };
}

export interface WolfDiscussionEvent extends GameEventBase {
  event_type: 'wolf_discussion';
  data: { speaker: string; content: string; reasoning: string; round: number; phase?: string };
}

export interface RoleActionEvent extends GameEventBase {
  event_type: 'guard_action' | 'witch_heal' | 'witch_poison';
  data: {
    guard?: string;
    witch?: string;
    target: string;
    reasoning: string;
    round: number;
    phase?: string;
  };
}

export interface WolfBeautyCharmEvent extends GameEventBase {
  event_type: 'wolf_beauty_charm';
  data: {
    wolf_beauty: string;
    target: string;
    reasoning: string;
    round: number;
    phase?: string;
  };
}

export interface WolfBeautyCharmTriggeredEvent extends GameEventBase {
  event_type: 'wolf_beauty_charm_triggered';
  data: {
    wolf_beauty: string;
    target: string;
    round: number;
    phase?: string;
  };
}

export interface KnightDuelEvent extends GameEventBase {
  event_type: 'knight_duel';
  data: {
    knight: string;
    target: string;
    target_faction: 'good' | 'werewolf';
    winner: string;
    reasoning: string;
    round: number;
    phase?: string;
  };
}

export interface PassEvent extends GameEventBase {
  event_type: 'guard_pass' | 'player_pass' | 'sheriff_campaign_pass';
  data: {
    player?: string;
    guard?: string;
    reasoning?: string;
    round: number;
    phase?: string;
    context?: string;
  };
}

export interface PlayerSpeechEvent extends GameEventBase {
  event_type: 'player_speech';
  data: {
    speaker: string;
    content: string;
    claim_role: string; // none | seer | villager
    reasoning: string;
    round: number;
    phase?: string;
    sheriff_campaign?: boolean;
    withdrew?: boolean;
    sheriff_summary?: boolean;
    nomination?: string;
    last_words?: boolean;
  };
}

export interface PlayerVoteEvent extends GameEventBase {
  event_type: 'player_vote';
  data: { voter: string; target: string; reasoning: string; round: number };
}

export interface VoteResultEvent extends GameEventBase {
  event_type: 'vote_result';
  data: {
    result: 'eliminated' | 'tie' | 'no_votes' | 'no_elimination' | 'idiot_revealed';
    eliminated?: string;
    player?: string;
    candidates?: string[];
    votes?: Record<string, number>;        // target -> 得票数
    vote_detail?: Record<string, string>;  // voter -> target（弃票为 "abstain"）
    round: number;
  };
}

export interface PlayerDeathEvent extends GameEventBase {
  event_type: 'player_death';
  data: {
    player: string;
    cause: 'werewolf_kill' | 'voted_out' | 'poison' | 'night_death'
      | 'hunter_shot' | 'wolf_king_shot'
      | 'white_wolf_king' | 'self_destruct'
      | 'wolf_beauty_charm' | 'knight_duel' | 'knight_failed';
    round: number;
    phase?: string;
    shooter?: string;
  };
}

export interface PlayerAbstainEvent extends GameEventBase {
  event_type: 'player_abstain';
  data: { voter: string; reasoning: string; round: number; phase?: string };
}

export interface SheriffVoteEvent extends GameEventBase {
  event_type: 'sheriff_vote' | 'sheriff_abstain';
  data: { voter: string; target?: string; reasoning: string; round: number; phase?: string };
}

export interface GameEndEvent extends GameEventBase {
  event_type: 'game_end';
  data: {
    winner: 'good' | 'werewolf' | 'draw';
    reason: string;
    final_round: number;
    duration_seconds: number;
  };
}

export interface SelfDestructEvent extends GameEventBase {
  event_type: 'white_wolf_king_self_destruct' | 'wolf_self_destruct';
  data: { player: string; target?: string; round: number; phase?: string };
}

export interface SheriffElectionResultEvent extends GameEventBase {
  event_type: 'sheriff_election_result';
  data: {
    result: 'elected' | 'tie' | 'no_sheriff' | 'cancelled_by_self_destruct';
    sheriff?: string;
    reason?: string;
    candidates?: string[];
    votes?: Record<string, number>;
    vote_detail?: Record<string, string>;
    round: number;
    phase?: string;
  };
}

export interface SheriffWithdrawalEvent extends GameEventBase {
  event_type: 'sheriff_withdrawal';
  data: { player: string; reasoning: string; round: number; phase?: string };
}

export interface BadgeEvent extends GameEventBase {
  event_type: 'badge_transferred' | 'badge_destroyed';
  data: { from?: string; to?: string; player?: string; reasoning?: string; round: number; phase?: string };
}

export interface SpeechOrderEvent extends GameEventBase {
  event_type: 'speech_order_decided';
  data: {
    chooser: string;
    direction: 'clockwise' | 'counterclockwise';
    anchor?: string;
    anchor_type?: string;
    order: string[];
    night_deaths?: string[];
    reasoning?: string;
    round: number;
    phase?: string;
  };
}

export interface AgentFallbackEvent extends GameEventBase {
  event_type: 'agent_fallback';
  data: {
    player: string;
    round: number;
    phase: string;
    message: string;
    attempts: number;
    usage?: Record<string, number>;
    response_excerpt?: string;
    finish_reason?: string;
    fallback_action?: string;
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
  | WolfDiscussionEvent
  | SeerInvestigateEvent
  | RoleActionEvent
  | WolfBeautyCharmEvent
  | WolfBeautyCharmTriggeredEvent
  | KnightDuelEvent
  | PassEvent
  | PlayerSpeechEvent
  | PlayerVoteEvent
  | PlayerAbstainEvent
  | SheriffVoteEvent
  | VoteResultEvent
  | PlayerDeathEvent
  | SelfDestructEvent
  | SheriffElectionResultEvent
  | SheriffWithdrawalEvent
  | BadgeEvent
  | SpeechOrderEvent
  | AgentFallbackEvent
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
export function isPlayerAbstain(e: GameEvent): e is PlayerAbstainEvent {
  return e.event_type === 'player_abstain';
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
  from_index: number;
  next_index: number;
  total: number;
  terminal: boolean;
}

export interface GameStreamUpdate extends GameEventResponse {
  status: GameStatusResponse;
}

// ---- 观战界面用的派生类型 ----

export type Role =
  | 'werewolf' | 'seer' | 'witch' | 'hunter' | 'idiot' | 'guard'
  | 'white_wolf_king' | 'wolf_king' | 'wolf_beauty' | 'knight' | 'villager' | string;
export type GamePhase = 'night' | 'day' | 'vote' | 'death_skill' | string;

/** 玩家 + 身份 + 存活状态(合并 status.role_assignment 与 alive/dead) */
export interface PlayerWithRole {
  id: string;
  avatarId?: string;
  role: Role;
  alive: boolean;
  personality?: PersonalityProfile;
  isSheriff?: boolean;
  /** 死因（玩家视角的夜间死因会统一为 night_death） */
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
