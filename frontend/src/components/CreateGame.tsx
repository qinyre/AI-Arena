import { useState } from 'react';
import { apiClient } from '../api/client';
import type { PlayerConfig } from '../types/api';

interface Props {
  onGameCreated: (gameId: string) => void;
}

const PROVIDERS = ['openai', 'anthropic', 'ollama'] as const;

const MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ],
  ollama: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'gemma2', 'phi3', 'deepseek-r1']
};

export default function CreateGame({ onGameCreated }: Props) {
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([
    { player_id: 'AI-1', provider: 'openai', model: 'gpt-4o-mini' },
    { player_id: 'AI-2', provider: 'openai', model: 'gpt-4o-mini' },
    { player_id: 'AI-3', provider: 'openai', model: 'gpt-4o-mini' },
    { player_id: 'AI-4', provider: 'openai', model: 'gpt-4o-mini' },
    { player_id: 'AI-5', provider: 'openai', model: 'gpt-4o-mini' },
  ]);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePlayer = (index: number, field: keyof PlayerConfig, value: string) => {
    const newConfigs = [...playerConfigs];
    if (field === 'provider') {
      // Reset model when provider changes
      newConfigs[index] = {
        ...newConfigs[index],
        provider: value as any,
        model: MODELS[value as keyof typeof MODELS][0]
      };
    } else {
      newConfigs[index] = { ...newConfigs[index], [field]: value };
    }
    setPlayerConfigs(newConfigs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.createGame({
        player_configs: playerConfigs,
        seed: seed || undefined
      });

      onGameCreated(response.game_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">创建新游戏</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Player Configurations */}
          <div>
            <h3 className="text-lg font-semibold mb-4">玩家配置</h3>
            <div className="space-y-4">
              {playerConfigs.map((config, index) => (
                <div key={index} className="flex gap-4 items-center bg-gray-700 p-4 rounded-lg">
                  <div className="w-24">
                    <label className="block text-sm text-gray-400 mb-1">玩家</label>
                    <input
                      type="text"
                      value={config.player_id}
                      onChange={(e) => updatePlayer(index, 'player_id', e.target.value)}
                      className="input w-full"
                      required
                    />
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">提供商</label>
                    <select
                      value={config.provider}
                      onChange={(e) => updatePlayer(index, 'provider', e.target.value)}
                      className="select w-full"
                    >
                      {PROVIDERS.map(provider => (
                        <option key={provider} value={provider}>
                          {provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Ollama'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">模型</label>
                    <select
                      value={config.model}
                      onChange={(e) => updatePlayer(index, 'model', e.target.value)}
                      className="select w-full"
                    >
                      {MODELS[config.provider].map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seed */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              随机种子（可选，用于可复现）
            </label>
            <input
              type="number"
              value={seed || ''}
              onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="留空随机生成"
              className="input w-full"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-lg"
          >
            {loading ? '创建中...' : '🎮 创建游戏'}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-sm text-blue-200">
            <strong>💡 提示:</strong> 游戏将在后台异步运行，创建后可在"当前游戏"标签查看实时进度。
          </p>
        </div>
      </div>
    </div>
  );
}
