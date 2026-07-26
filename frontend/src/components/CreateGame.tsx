import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { PlayerConfig, ProvidersResponse } from '../types/api';
import { loadModelPresets, type ModelPreset } from '../utils/modelPresets';
import {
  REASONING_LABELS,
  TONE_LABELS,
  loadAllPersonalityPresets,
  personalityProfile,
} from '../utils/personalityPresets';

interface Props {
  onGameCreated: (gameId: string) => void;
}

// 特殊 provider 值：用户自定义端点（对应后端"用户直填"路径，绕过 yaml 白名单）
const CUSTOM_PROVIDER = '__custom__';
const PRESET_PROVIDER_PREFIX = '__preset__:';

const BOARD_OPTIONS = [
  { id: '5p', name: '5人极简场', count: 5, roles: '1狼 · 预言家 · 3民' },
  { id: '9p', name: '9人标准场', count: 9, roles: '3狼 · 预言家/女巫/猎人 · 3民' },
  { id: '12p_idiot', name: '12人预女猎白', count: 12, roles: '4狼 · 预言家/女巫/猎人/白痴 · 4民' },
  { id: '12p_white_wolf_guard', name: '12人白狼王守卫', count: 12, roles: '3狼+白狼王 · 预言家/女巫/猎人/守卫 · 4民' },
  { id: '12p_wolf_king_guard', name: '12人狼王守卫', count: 12, roles: '3狼+狼王 · 预言家/女巫/猎人/守卫 · 4民' },
] as const;

// 快速开始预设（基于 2026-07 最新模型）
const QUICK_START_PRESETS = [
  {
    name: '全员 DeepSeek V4 Flash（推荐 💰）',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    description: '极低成本 $0.28/1M，国内直连',
  },
  {
    name: '全员 GPT-5 Nano（快速 ⚡）',
    provider: 'openai',
    model: 'gpt-5-nano',
    description: 'OpenAI 最快模型 $0.05/1M',
  },
  {
    name: '全员 Claude Haiku 4.5（智能 🧠）',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    description: 'Anthropic 快速模型 $0.8/1M',
  },
  {
    name: '全员 Gemini 3.6 Flash（长文本 📄）',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    description: '1M 上下文 $0.3/1M',
  },
  {
    name: '全员 Ollama DeepSeek-R1（本地 🏠）',
    provider: 'ollama',
    model: 'deepseek-r1',
    description: '完全免费，需本地运行 Ollama',
  },
];

export default function CreateGame({ onGameCreated }: Props) {
  const [providersData, setProvidersData] = useState<ProvidersResponse | null>(null);
  const [modelPresets] = useState(loadModelPresets);
  const [personalityPresets] = useState(loadAllPersonalityPresets);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([]);
  const [boardId, setBoardId] = useState('5p');
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
      const preset = value.startsWith(PRESET_PROVIDER_PREFIX)
        ? modelPresets.find((item) => item.id === value.slice(PRESET_PROVIDER_PREFIX.length))
        : undefined;
      if (preset) {
        newConfigs[index] = {
          player_id: newConfigs[index].player_id,
          personality_id: newConfigs[index].personality_id,
          personality: newConfigs[index].personality,
          provider: value,
          model: preset.model,
          api_format: preset.apiFormat,
          base_url: preset.baseUrl,
          api_key: preset.apiKey,
        };
      } else if (value === CUSTOM_PROVIDER) {
        newConfigs[index] = {
          player_id: newConfigs[index].player_id,
          personality_id: newConfigs[index].personality_id,
          personality: newConfigs[index].personality,
          provider: CUSTOM_PROVIDER,
          model: '',
          api_format: 'openai',
          base_url: '',
        };
      } else {
        const models = providersData?.providers[value]?.models ?? [];
        newConfigs[index] = {
          player_id: newConfigs[index].player_id,
          personality_id: newConfigs[index].personality_id,
          personality: newConfigs[index].personality,
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
    const newConfigs = Array.from({ length: playerConfigs.length }, (_, i) => ({
      player_id: `AI-${i + 1}`,
      personality_id: playerConfigs[i]?.personality_id,
      personality: playerConfigs[i]?.personality,
      provider: preset.provider,
      model: preset.model,
    }));
    setPlayerConfigs(newConfigs);
    setValidationErrors({});
    setError(null);
  };

  const applyModelPreset = (preset: ModelPreset) => {
    setPlayerConfigs(Array.from({ length: playerConfigs.length }, (_, i) => ({
      player_id: `AI-${i + 1}`,
      personality_id: playerConfigs[i]?.personality_id,
      personality: playerConfigs[i]?.personality,
      provider: `${PRESET_PROVIDER_PREFIX}${preset.id}`,
      model: preset.model,
      api_format: preset.apiFormat,
      base_url: preset.baseUrl,
      api_key: preset.apiKey,
    })));
    setValidationErrors({});
    setError(null);
  };

  const applyPersonality = (index: number, presetId: string) => {
    const preset = personalityPresets.find((item) => item.id === presetId);
    setPlayerConfigs((configs) => configs.map((config, configIndex) => (
      configIndex === index
        ? {
            ...config,
            personality_id: preset?.id,
            personality: preset ? personalityProfile(preset) : undefined,
          }
        : config
    )));
  };

  const changeBoard = (id: string) => {
    const count = BOARD_OPTIONS.find((board) => board.id === id)?.count ?? 5;
    const fallback = playerConfigs[0] ?? {
      player_id: 'AI-1',
      provider: providersData?.default_provider,
      model: providersData?.default_model ?? '',
    };
    setBoardId(id);
    setPlayerConfigs(Array.from({ length: count }, (_, i) => (
      playerConfigs[i] ?? {
        ...fallback,
        player_id: `AI-${i + 1}`,
        personality_id: undefined,
        personality: undefined,
      }
    )));
    setValidationErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<number, string> = {};

    playerConfigs.forEach((config, index) => {
      if (!config.player_id.trim()) {
        errors[index] = '玩家 ID 不能为空';
      } else if (
        config.provider === CUSTOM_PROVIDER
        || config.provider?.startsWith(PRESET_PROVIDER_PREFIX)
      ) {
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
        if (c.provider === CUSTOM_PROVIDER || c.provider?.startsWith(PRESET_PROVIDER_PREFIX)) {
          return {
            player_id: c.player_id,
            api_format: c.api_format,
            base_url: c.base_url,
            model: c.model,
            ...(c.api_key ? { api_key: c.api_key } : {}),
            ...(c.key_env ? { key_env: c.key_env } : {}),
            ...(c.personality ? { personality: c.personality } : {}),
          };
        }
        return {
          player_id: c.player_id,
          provider: c.provider,
          model: c.model,
          ...(c.personality ? { personality: c.personality } : {}),
        };
      });

      const response = await apiClient.createGame({
        player_configs: configsToSend,
        board_id: boardId,
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
  const isCustom = (p: string) => (
    p === CUSTOM_PROVIDER || p.startsWith(PRESET_PROVIDER_PREFIX)
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">创建新游戏</h2>

        {modelPresets.length > 0 && (
          <div className="mb-4 rounded-lg border border-[#e9c400]/35 bg-[#e9c400]/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[#ffe16d]">
              <span className="material-symbols-outlined text-[17px]">memory</span>
              我的模型预设
            </h3>
            <div className="flex flex-wrap gap-2">
              {modelPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyModelPreset(preset)}
                  className="rounded border border-[#e9c400]/30 bg-[#102034] px-3 py-2 text-left transition-colors hover:border-[#e9c400]/70 hover:bg-[#1b2b3f]"
                >
                  <span className="block font-label text-xs text-[#d3e4fe]">{preset.name}</span>
                  <span className="block text-[10px] text-[#c8c5cb]/50">{preset.provider} · {preset.model}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">板型</label>
            <select
              value={boardId}
              onChange={(e) => changeBoard(e.target.value)}
              className="select w-full"
            >
              {BOARD_OPTIONS.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}（{board.roles}）
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-400">
              9/12 人局采用屠边规则；守卫不可连续守同一人，同守同救仍死亡。
            </p>
          </div>

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
                          {modelPresets.length > 0 && (
                            <optgroup label="我的预设">
                              {modelPresets.map((preset) => (
                                <option
                                  key={preset.id}
                                  value={`${PRESET_PROVIDER_PREFIX}${preset.id}`}
                                >
                                  {preset.name} · {preset.model}
                                </option>
                              ))}
                            </optgroup>
                          )}
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

                    <div className="flex items-center gap-4 border-t border-gray-600/70 pt-3">
                      <div className="w-24 shrink-0">
                        <span className="block text-sm text-gray-400">玩家性格</span>
                        <span className="text-[10px] text-gray-500">影响表达与倾向</span>
                      </div>
                      <select
                        value={config.personality_id || ''}
                        onChange={(e) => applyPersonality(index, e.target.value)}
                        className="select min-w-0 flex-1"
                        aria-label={`${config.player_id} 的性格`}
                      >
                        <option value="">标准平衡</option>
                        <optgroup label="内置性格">
                          {personalityPresets.filter((item) => item.builtIn).map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.name}</option>
                          ))}
                        </optgroup>
                        {personalityPresets.some((item) => !item.builtIn) && (
                          <optgroup label="我的性格">
                            {personalityPresets.filter((item) => !item.builtIn).map((preset) => (
                              <option key={preset.id} value={preset.id}>{preset.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {config.personality && (
                        <div className="hidden min-w-[180px] text-right sm:block">
                          <p className="text-xs text-[#c4b5fd]">
                            {TONE_LABELS[config.personality.tone]} · {REASONING_LABELS[config.personality.reasoning_style]}
                          </p>
                          <p className="font-label text-[9px] text-gray-500">
                            风险 {config.personality.risk_tolerance} · 主导 {config.personality.assertiveness} · 表达 {config.personality.verbosity}
                          </p>
                        </div>
                      )}
                    </div>
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
