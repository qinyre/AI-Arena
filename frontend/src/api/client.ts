/**
 * API Client
 */
import type {
  CreateGameRequest,
  CreateGameResponse,
  GameStatusResponse,
  GameResultResponse,
  ListGamesResponse,
  StatsResponse,
  ProvidersResponse,
  GameEventResponse
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

class APIClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE) {
    this.baseURL = baseURL;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Create game
  async createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
    return this.request<CreateGameResponse>('/api/games/', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Get game status
  async getGameStatus(gameId: string): Promise<GameStatusResponse> {
    return this.request<GameStatusResponse>(`/api/games/${gameId}/status`);
  }

  // Get game result
  async getGameResult(gameId: string): Promise<GameResultResponse> {
    return this.request<GameResultResponse>(`/api/games/${gameId}/result`);
  }

  // List games
  async listGames(): Promise<ListGamesResponse> {
    return this.request<ListGamesResponse>('/api/games/');
  }

  // Delete game
  async deleteGame(gameId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/games/${gameId}`, {
      method: 'DELETE',
    });
  }

  // Get stats
  async getStats(): Promise<StatsResponse> {
    return this.request<StatsResponse>('/api/games/stats');
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  // Get available providers & models (from backend yaml, single source of truth)
  async getProviders(): Promise<ProvidersResponse> {
    return this.request<ProvidersResponse>('/api/providers');
  }

  // Get game events (full event stream with AI reasoning)
  async getGameEvents(gameId: string): Promise<GameEventResponse> {
    return this.request<GameEventResponse>(`/api/games/${gameId}/events`);
  }
}

export const apiClient = new APIClient();
