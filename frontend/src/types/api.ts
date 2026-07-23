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

export interface GameEvent {
  event_type: string;
  data: Record<string, any>;
  visibility: string;
  visible_to: string[];
  timestamp: string;
}

export interface GameEventResponse {
  game_id: string;
  events: GameEvent[];
  total: number;
}
