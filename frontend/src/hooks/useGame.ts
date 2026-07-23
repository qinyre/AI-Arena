/**
 * Game Hook
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import type { GameStatusResponse, GameResultResponse } from '../types/api';

export function useGame(gameId: string | null) {
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [result, setResult] = useState<GameResultResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!gameId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getGameStatus(gameId);
      setStatus(data);

      // If completed, fetch result
      if (data.status === 'completed') {
        const resultData = await apiClient.getGameResult(gameId);
        setResult(resultData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch game status');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    // Initial fetch
    fetchStatus();

    // Poll every 3 seconds if game is running
    const interval = setInterval(() => {
      if (status?.status === 'running' || status?.status === 'initialized') {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [gameId, status?.status, fetchStatus]);

  return { status, result, loading, error, refetch: fetchStatus };
}
