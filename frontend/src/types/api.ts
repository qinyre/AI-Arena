/**
 * API Types
 */

export interface PlayerConfig {
  player_id: string;
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
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
