import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { PlayerConfig, ProvidersResponse } from '../types/api';

interface Props {
  onGameCreated: (gameId: string) => void;
}

// 特殊 provider 值：用户自定义端点（对应后端"用户直填"路径，绕过 yaml 白名单）
const CUSTOM_PROVIDER = '__custom__';

// 快速开始预设（基于 2026-07 最新模型）
const QUICK_START_PRESETS = [
  {
    name: '5个 DeepSeek V4 Flash（推荐 💰）',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    description: '极低成本 $0.28/1M，国内直连',
  },
  {
    name: '5个 GPT-5 Nano（快速 ⚡）',
    provider: 'openai',
    model: 'gpt-5-nano',
    description: 'OpenAI 最快模型 $0.05/1M',
  },
  {
    name: '5个 Claude Haiku 4.5（智能 🧠）',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    description: 'Anthropic 快速模型 $0.8/1M',
  },
  {
    name: '5个 Gemini 3.6 Flash（长文本 📄）',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    description: '1M 上下文 $0.3/1M',
  },
  {
    name: '5个 Ollama DeepSeek-R1（本地 🏠）',
    provider: 'ollama',
    model: 'deepseek-r1',
    description: '完全免费，需本地运行 Ollama',
  },
];

export default function CreateGame({ onGameCreated }: Props) {
  const [providersData, setProvidersData] = useState<ProvidersResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([]);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});

  // 启动时从后端拉取 provider 列表（单一数据源：后端 config/models.yaml）
  useEffect(() => {
    apiClient.getProviders()
      .then((data) => {
        setProvidersData(data);
        // 初始化 5 个玩家，用后端返回的默认 provider/model
        const defaultProvider = data.default_provider;
        const defaultModel = data.default_model;
        setPlayerConfigs(
          Array.from({ length: 5 }, (_, i) => ({
            player_id: `AI-${i + 1}`,
            provider: defaultProvider,
            model: defaultModel,
          }))
        );
      })
      .catch((err) => {
        setLoadError(
          `无法加载 provider 列表（${err instanceof Error ? err.message : '未知错误'}）。` +
          `请确认后端已启动。`
        );
      });
  }, []);

  const updatePlayer = (index: number, field: keyof PlayerConfig, value: string) => {
    const newConfigs = [...playerConfigs];
    if (field === 'provider') {
      // 切换 provider 时重置 model，并清空自定义字段
      if (value === CUSTOM_PROVIDER) {
        newConfigs[index] = {
          player_id: newConfigs[index].player_id,
          provider: CUSTOM_PROVIDER,
          model: '',
          api_format: 'openai',
          base_url: '',
        };
      } else {
        const models = providersData?.providers[value]?.models ?? [];
        newConfigs[index] = {
          player_id: newConfigs[index].player_id,
          provider: value,
          model: models[0]?.id ?? '',
          // 清空自定义字段
          api_format: undefined,
          base_url: undefined,
          api_key: undefined,
          key_env: undefined,
        };
      }
    } else {
      newConfigs[index] = { ...newConfigs[index], [field]: value };
    }
    setPlayerConfigs(newConfigs);
    // 清除该玩家的验证错误
    const newErrors = { ...validationErrors };
    delete newErrors[index];
    setValidationErrors(newErrors);
  };

  const applyQuickStart = (preset: typeof QUICK_START_PRESETS[0]) => {
    const newConfigs = Array.from({ length: 5 }, (_, i) => ({
      player_id: `AI-${i + 1}`,
      provider: preset.provider,
      model: preset.model,
    }));
    setPlayerConfigs(newConfigs);
    setValidationErrors({});
    setError(null);
  };

  const validateForm = (): boolean => {
    const errors: Record<number, string> = {};

    playerConfigs.forEach((config, index) => {
      if (!config.player_id.trim()) {
        errors[index] = '玩家 ID 不能为空';
      } else if (config.provider === CUSTOM_PROVIDER) {
        if (!config.base_url?.trim()) {
          errors[index] = 'Base URL 不能为空';
        } else if (!config.base_url.startsWith('http')) {
          errors[index] = 'Base URL 必须以 http:// 或 https:// 开头';
        }
        if (!config.model?.trim()) {
          errors[index] = (errors[index] || '') + (errors[index] ? '；' : '') + '模型名称不能为空';
        }
      } else if (!config.model) {
        errors[index] = '请选择模型';
      }
    });

    // 检查玩家 ID 重复
    const playerIds = playerConfigs.map(c => c.player_id);
    const duplicates = playerIds.filter((id, index) => playerIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      playerConfigs.forEach((config, index) => {
        if (duplicates.includes(config.player_id)) {
          errors[index] = (errors[index] || '') + (errors[index] ? '；' : '') + '玩家 ID 重复';
        }
      });
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      setError('请修正表单中的错误');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 自定义 provider 转成后端"用户直填"格式（带 base_url），其余保持 provider 名
      const configsToSend = playerConfigs.map((c) => {
        if (c.provider === CUSTOM_PROVIDER) {
          return {
            player_id: c.player_id,
            api_format: c.api_format,
            base_url: c.base_url,
            model: c.model,
            ...(c.api_key ? { api_key: c.api_key } : {}),
            ...(c.key_env ? { key_env: c.key_env } : {}),
          };
        }
        return {
          player_id: c.player_id,
          provider: c.provider,
          model: c.model,
        };
      });

      const response = await apiClient.createGame({
        player_configs: configsToSend,
        seed: seed || undefined
      });

      onGameCreated(response.game_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  // provider 列表加载中
  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card">
          <h2 className="text-2xl font-bold mb-4">创建新游戏</h2>
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {loadError}
          </div>
        </div>
      </div>
    );
  }
  if (!providersData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card">
          <p className="text-gray-400">正在加载 provider 列表...</p>
        </div>
      </div>
    );
  }

  const providerNames = Object.keys(providersData.providers);
  const isCustom = (p: string) => p === CUSTOM_PROVIDER;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">创建新游戏</h2>

        {/* 快速开始预设 */}
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <h3 className="text-sm font-medium text-blue-200 mb-3">⚡ 快速开始</h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_START_PRESETS.map((preset, index) => (
              <button
                key={index}
                type="button"
                onClick={() => applyQuickStart(preset)}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors text-sm"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Player Configurations */}
          <div>
            <h3 className="text-lg font-semibold mb-4">玩家配置</h3>
            <div className="space-y-4">
              {playerConfigs.map((config, index) => {
                const provider = config.provider!;
                const provInfo = isCustom(provider)
                  ? null
                  : providersData.providers[provider];
                const hasError = validationErrors[index];
                return (
                  <div
                    key={index}
                    className={`bg-gray-700 p-4 rounded-lg space-y-3 ${
                      hasError ? 'border-2 border-red-500' : ''
                    }`}
                  >
                    {hasError && (
                      <div className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded">
                        ⚠️ {hasError}
                      </div>
                    )}
                    <div className="flex gap-4 items-center">
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
                          value={provider}
                          onChange={(e) => updatePlayer(index, 'provider', e.target.value)}
                          className="select w-full"
                        >
                          {providerNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          <option value={CUSTOM_PROVIDER}>自定义端点...</option>
                        </select>
                      </div>

                      <div className="flex-1">
                        <label className="block text-sm text-gray-400 mb-1">模型</label>
                        {isCustom(provider) ? (
                          <input
                            type="text"
                            value={config.model}
                            onChange={(e) => updatePlayer(index, 'model', e.target.value)}
                            placeholder="模型名称"
                            className="input w-full"
                            required
                          />
                        ) : (
                          <select
                            value={config.model}
                            onChange={(e) => updatePlayer(index, 'model', e.target.value)}
                            className="select w-full"
                          >
                            {provInfo?.models.map((m) => (
                              <option key={m.id} value={m.id}>{m.id}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* 自定义端点的额外字段 */}
                    {isCustom(provider) && (
                      <div className="flex gap-4 items-center pt-2 border-t border-gray-600">
                        <div className="w-40">
                          <label className="block text-sm text-gray-400 mb-1">接口格式</label>
                          <select
                            value={config.api_format || 'openai'}
                            onChange={(e) => updatePlayer(index, 'api_format', e.target.value)}
                            className="select w-full"
                          >
                            <option value="openai">openai</option>
                            <option value="anthropic">anthropic</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                          <input
                            type="text"
                            value={config.base_url || ''}
                            onChange={(e) => updatePlayer(index, 'base_url', e.target.value)}
                            placeholder="https://your-endpoint/v1"
                            className="input w-full"
                            required
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm text-gray-400 mb-1">
                            API Key <span className="text-gray-500">(可选)</span>
                          </label>
                          <input
                            type="password"
                            value={config.api_key || ''}
                            onChange={(e) => updatePlayer(index, 'api_key', e.target.value)}
                            placeholder="留空则用 key_env"
                            className="input w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
            <strong>💡 提示:</strong> 使用快速开始可一键创建预设配置。
            provider 列表来自后端 <code>config/models.yaml</code>，
            后端更新后前端自动同步。选「自定义端点」可填任意 OpenAI/Anthropic 格式的 API。
          </p>
        </div>
      </div>
    </div>
  );
}
