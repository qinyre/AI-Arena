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
  ModelConnectionTestRequest,
  ModelConnectionTestResponse,
  GameEventResponse,
  GameReview,
  GameReviewRequest,
  CreateSeriesRequest,
  SeriesStatusResponse,
  CreatePromptExperimentRequest,
  PromptExperimentStatusResponse,
  StatsFilters,
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

  async createSeries(request: CreateSeriesRequest): Promise<SeriesStatusResponse> {
    return this.request<SeriesStatusResponse>('/api/games/series', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getSeries(seriesId: string): Promise<SeriesStatusResponse> {
    return this.request<SeriesStatusResponse>(`/api/games/series/${seriesId}`);
  }

  async stopSeries(seriesId: string): Promise<SeriesStatusResponse> {
    return this.request<SeriesStatusResponse>(`/api/games/series/${seriesId}/stop`, {
      method: 'POST',
    });
  }

  async createPromptExperiment(
    request: CreatePromptExperimentRequest,
  ): Promise<PromptExperimentStatusResponse> {
    return this.request<PromptExperimentStatusResponse>('/api/games/experiments', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getPromptExperiment(experimentId: string): Promise<PromptExperimentStatusResponse> {
    return this.request<PromptExperimentStatusResponse>(`/api/games/experiments/${experimentId}`);
  }

  async stopPromptExperiment(experimentId: string): Promise<PromptExperimentStatusResponse> {
    return this.request<PromptExperimentStatusResponse>(`/api/games/experiments/${experimentId}/stop`, {
      method: 'POST',
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

  async pauseGame(gameId: string): Promise<{ status: 'paused' }> {
    return this.request<{ status: 'paused' }>(`/api/games/${gameId}/pause`, {
      method: 'POST',
    });
  }

  async resumeGame(gameId: string): Promise<{ status: 'running' }> {
    return this.request<{ status: 'running' }>(`/api/games/${gameId}/resume`, {
      method: 'POST',
    });
  }

  async generateGameReview(gameId: string, request: GameReviewRequest): Promise<GameReview> {
    return this.request<GameReview>(`/api/games/${gameId}/review`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
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
  async getStats(filters: StatsFilters = {}): Promise<StatsResponse> {
    const query = new URLSearchParams(
      Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    return this.request<StatsResponse>(`/api/games/stats${query.size ? `?${query}` : ''}`);
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  // Get available providers & models (from backend yaml, single source of truth)
  async getProviders(): Promise<ProvidersResponse> {
    return this.request<ProvidersResponse>('/api/providers');
  }

  async testModelConnection(request: ModelConnectionTestRequest): Promise<ModelConnectionTestResponse> {
    return this.request<ModelConnectionTestResponse>('/api/model-connection/test', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Get game events from an exclusive cursor (0 returns the full history).
  async getGameEvents(gameId: string, after = 0): Promise<GameEventResponse> {
    return this.request<GameEventResponse>(`/api/games/${gameId}/events?after=${after}`);
  }

  getGameEventStreamUrl(gameId: string, after: number): string {
    return `${this.baseURL}/api/games/${gameId}/events/stream?after=${after}`;
  }
}

export const apiClient = new APIClient();
