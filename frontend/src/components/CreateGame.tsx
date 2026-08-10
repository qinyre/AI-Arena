import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { BudgetTier, PlayerConfig, ProvidersResponse } from '../types/api';
import {
  loadModelPresets,
  requiresApiKey,
  type ModelPreset,
} from '../utils/modelPresets';
import {
  REASONING_LABELS,
  TONE_LABELS,
  loadAllPersonalityPresets,
  personalityProfile,
} from '../utils/personalityPresets';
import { AvatarPicker, LobeAvatar } from './LobeAvatar';

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
  { id: '12p_wolf_beauty_knight', name: '12人狼美骑士', count: 12, roles: '3狼+狼美人 · 预言家/女巫/守卫/骑士 · 4民' },
] as const;

const BUDGET_OPTIONS: Array<{
  id: BudgetTier;
  name: string;
  description: string;
  limits: string;
}> = [
  {
    id: 'economy',
    name: '节制',
    description: '优先控制长局消耗，达到上限后使用本地合法动作完成对局',
    limits: '单次 700 · 单人 3万 · 全局 24万 tokens',
  },
  {
    id: 'standard',
    name: '标准',
    description: '保留完整推理与发言，适合大多数 5—12 人对局',
    limits: '单次 1200 · 单人 8万 · 全局 50万 tokens',
  },
  {
    id: 'premium',
    name: '宽裕',
    description: '允许更长表达和长局博弈，消耗上限明显提高',
    limits: '单次 1800 · 单人 20万 · 全局 150万 tokens',
  },
];

// 快速开始预设（基于 2026-07 最新模型）
const QUICK_START_PRESETS = [
  {
    name: 'DeepSeek V4 Flash · 经济',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    description: '官方低价模型 $0.14/$0.28',
  },
  {
    name: 'GPT-5.6 Luna · 经济',
    provider: 'openai',
    model: 'gpt-5.6-luna',
    description: 'GPT-5.6 经济档 $0.20/$1.20',
  },
  {
    name: 'Claude Haiku 4.5 · 均衡',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    description: 'Anthropic 快速模型 $1/$5',
  },
  {
    name: 'Gemini 3.6 Flash · 长文本',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    description: '最新稳定版，1M 上下文',
  },
  {
    name: 'Qwen3.7 Flash · 经济',
    provider: 'qwen',
    model: 'qwen3.7-flash',
    description: '国内直连，适合批量对局',
  },
  {
    name: 'Kimi K2.6 · 通用',
    provider: 'kimi',
    model: 'kimi-k2.6',
    description: '多模态与推理，256K 上下文',
  },
  {
    name: 'MiMo V2.5 · 经济',
    provider: 'mimo',
    model: 'mimo-v2.5',
    description: '全模态模型 $0.14/$0.28',
  },
  {
    name: 'MiniMax M3 · 长文本',
    provider: 'minimax',
    model: 'MiniMax-M3',
    description: 'Agent 模型，1M 上下文',
  },
  {
    name: 'GLM-4.7 Flash · 免费',
    provider: 'glm',
    model: 'glm-4.7-flash',
    description: '官方免费模型，200K 上下文',
  },
];

export default function CreateGame({ onGameCreated }: Props) {
  const [providersData, setProvidersData] = useState<ProvidersResponse | null>(null);
  const [modelPresets] = useState(loadModelPresets);
  const [personalityPresets] = useState(loadAllPersonalityPresets);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([]);
  const [boardId, setBoardId] = useState('5p');
  const [enableSheriff, setEnableSheriff] = useState(false);
  const [budgetTier, setBudgetTier] = useState<BudgetTier>('standard');
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});
  const [avatarPickerIndex, setAvatarPickerIndex] = useState<number | null>(null);
  const [expandedPlayerIndex, setExpandedPlayerIndex] = useState<number | null>(0);

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
          avatar_id: newConfigs[index].avatar_id,
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
          avatar_id: newConfigs[index].avatar_id,
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
          avatar_id: newConfigs[index].avatar_id,
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
      avatar_id: playerConfigs[i]?.avatar_id,
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
      avatar_id: playerConfigs[i]?.avatar_id,
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

  const randomizePersonalities = (onlyIndex?: number) => {
    const shuffled = [...personalityPresets];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setPlayerConfigs((configs) => configs.map((config, index) => {
      if (onlyIndex !== undefined && index !== onlyIndex) return config;
      const preset = shuffled[index % shuffled.length];
      return {
        ...config,
        personality_id: preset.id,
        personality: personalityProfile(preset),
      };
    }));
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
        if (
          requiresApiKey(config.api_format, config.base_url)
          && !config.api_key?.trim()
        ) {
          errors[index] = (errors[index] || '') + (errors[index] ? '；' : '')
            + 'Anthropic 远程接口缺少 API Key，请在设置中删除并重新添加预设';
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
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid !== undefined) setExpandedPlayerIndex(Number(firstInvalid));
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
            ...(c.avatar_id ? { avatar_id: c.avatar_id } : {}),
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
          ...(c.avatar_id ? { avatar_id: c.avatar_id } : {}),
          provider: c.provider,
          model: c.model,
          ...(c.personality ? { personality: c.personality } : {}),
        };
      });

      const response = await apiClient.createGame({
        player_configs: configsToSend,
        board_id: boardId,
        seed: seed || undefined,
        enable_sheriff: enableSheriff,
        budget_tier: budgetTier,
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
    <div className="mx-auto max-w-[1400px]">
      <div className="card">
        <div className="mb-6 border-b border-white/[0.08] pb-4">
          <p className="font-label text-[9px] tracking-[0.24em] text-antique-gold/65">OPEN A NEW CASE</p>
          <h2 className="mt-1 font-display text-2xl text-paper">创建新对局</h2>
          <p className="mt-1 text-xs text-ink-muted">选择板型、模型与性格，让十二个席位各自入场。</p>
        </div>

        {modelPresets.length > 0 && (
          <div className="mb-4 border border-antique-gold/20 bg-antique-gold/[0.035] p-4">
            <h3 className="mb-3 font-display text-sm text-antique-gold">我的模型预设</h3>
            <div className="flex flex-wrap gap-2">
              {modelPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyModelPreset(preset)}
                  className="border border-white/10 bg-black/15 px-3 py-2 text-left transition-colors hover:border-antique-gold/45 hover:bg-antique-gold/[0.04]"
                >
                  <span className="block font-label text-xs text-paper/85">{preset.name}</span>
                  <span className="block text-[10px] text-ink-muted">{preset.provider} · {preset.model}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 快速开始预设 */}
        <div className="mb-6 border border-white/10 bg-black/10 p-4">
          <h3 className="mb-3 font-display text-sm text-paper/85">快速布置席位</h3>
          <div className="custom-scrollbar grid auto-cols-[minmax(175px,72vw)] grid-flow-col gap-px overflow-x-auto pb-2 sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 xl:grid-cols-5">
            {QUICK_START_PRESETS.map((preset) => (
              <button
                key={preset.model}
                type="button"
                onClick={() => applyQuickStart(preset)}
                className="snap-start bg-stage-deep px-3 py-2.5 text-left transition-colors hover:bg-antique-gold/[0.07]"
              >
                <span className="block font-label text-xs text-paper/85">{preset.name}</span>
                <span className="mt-0.5 block text-[10px] text-ink-muted">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="game-board" className="block text-sm font-medium text-gray-300 mb-2">板型</label>
            <select
              id="game-board"
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

          <label className="flex cursor-pointer items-start gap-3 border border-antique-gold/20 bg-antique-gold/[0.035] p-4">
            <input
              type="checkbox"
              checked={enableSheriff}
              onChange={(event) => setEnableSheriff(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#b99758]"
            />
            <span>
              <span className="font-display text-[16px] text-antique-gold">启用警长与警徽流</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                首日竞选警长；警长拥有 1.5 票，死亡时可移交或撕毁警徽。预言家竞选发言会安排警徽流。
                {boardId === '5p' && ' 5 人局也可开启，但额外竞选会显著增加模型调用。'}
              </span>
            </span>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-300">本局模型预算</legend>
            <div className="grid gap-2 md:grid-cols-3">
              {BUDGET_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`cursor-pointer border p-3 transition-colors ${
                    budgetTier === option.id
                      ? 'border-antique-gold/55 bg-antique-gold/[0.07]'
                      : 'border-white/10 bg-black/10 hover:border-white/20'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="budget-tier"
                      value={option.id}
                      checked={budgetTier === option.id}
                      onChange={() => setBudgetTier(option.id)}
                      className="accent-[#b99758]"
                    />
                    <strong className="font-display text-sm text-paper">{option.name}</strong>
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-ink-muted">{option.description}</span>
                  <span className="mt-2 block font-label text-[9px] text-antique-gold/65">{option.limits}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Player Configurations */}
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">玩家配置</h3>
              <button
                type="button"
                onClick={() => randomizePersonalities()}
                className="inline-flex min-h-11 items-center gap-1.5 border border-white/15 px-3 py-1.5 font-label text-[10px] text-paper/65 transition-colors hover:border-antique-gold/45 hover:text-antique-gold"
              >
                随机分配性格
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {playerConfigs.map((config, index) => {
                const provider = config.provider!;
                const provInfo = isCustom(provider)
                  ? null
                  : providersData.providers[provider];
                const hasError = validationErrors[index];
                const inputPrefix = `player-${index}`;
                return (
                  <div
                    key={index}
                    className={`space-y-3 border bg-white/[0.025] p-4 ${
                      hasError ? 'border-crimson' : 'border-white/[0.08]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedPlayerIndex((current) => current === index ? null : index)}
                      className="flex min-h-11 w-full items-center gap-3 text-left lg:hidden"
                      aria-expanded={expandedPlayerIndex === index}
                    >
                      <LobeAvatar
                        avatarId={config.avatar_id}
                        playerId={config.player_id}
                        className="h-9 w-9 rounded-md"
                      />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate font-display text-paper">{config.player_id}</b>
                        <span className="block truncate text-xs text-ink-muted">{config.model}</span>
                      </span>
                      {hasError && <span className="text-xs text-crimson">需修正</span>}
                      <span className="material-symbols-outlined text-[18px] text-ink-muted">
                        {expandedPlayerIndex === index ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    <div className={`${expandedPlayerIndex === index ? 'block' : 'hidden'} space-y-3 lg:block`}>
                    {hasError && (
                      <div className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded">
                        {hasError}
                      </div>
                    )}
                    <div className="grid items-end gap-3 sm:grid-cols-[4rem_6rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <div>
                        <span className="mb-1 block text-sm text-gray-400">头像</span>
                        <button
                          type="button"
                          onClick={() => setAvatarPickerIndex(index)}
                          className="group relative grid h-11 w-11 place-items-center border border-white/15 bg-black/20 transition-colors hover:border-antique-gold/55"
                          aria-label={`选择 ${config.player_id} 的头像`}
                          title="选择头像"
                        >
                          <LobeAvatar
                            avatarId={config.avatar_id}
                            playerId={config.player_id}
                            className="h-8 w-8 rounded-md"
                          />
                          <span className="material-symbols-outlined absolute -bottom-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-antique-gold text-[10px] text-stage-deep">
                            edit
                          </span>
                        </button>
                      </div>

                      <div>
                        <label htmlFor={`${inputPrefix}-id`} className="block text-sm text-gray-400 mb-1">玩家</label>
                        <input
                          id={`${inputPrefix}-id`}
                          type="text"
                          value={config.player_id}
                          onChange={(e) => updatePlayer(index, 'player_id', e.target.value)}
                          className="input w-full"
                          required
                        />
                      </div>

                      <div className="flex-1">
                        <label htmlFor={`${inputPrefix}-provider`} className="block text-sm text-gray-400 mb-1">提供商</label>
                        <select
                          id={`${inputPrefix}-provider`}
                          value={provider}
                          onChange={(e) => updatePlayer(index, 'provider', e.target.value)}
                          className="select w-full"
                        >
                          {providerNames.map((name) => (
                            <option key={name} value={name}>
                              {providersData.providers[name].display_name || name}
                            </option>
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
                        <label htmlFor={`${inputPrefix}-model`} className="block text-sm text-gray-400 mb-1">模型</label>
                        {isCustom(provider) ? (
                          <input
                            id={`${inputPrefix}-model`}
                            type="text"
                            value={config.model}
                            onChange={(e) => updatePlayer(index, 'model', e.target.value)}
                            placeholder="模型名称"
                            className="input w-full"
                            required
                          />
                        ) : (
                          <select
                            id={`${inputPrefix}-model`}
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
                      <div className="grid gap-3 border-t border-gray-600 pt-2 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`${inputPrefix}-format`} className="block text-sm text-gray-400 mb-1">接口格式</label>
                          <select
                            id={`${inputPrefix}-format`}
                            value={config.api_format || 'openai'}
                            onChange={(e) => updatePlayer(index, 'api_format', e.target.value)}
                            className="select w-full"
                          >
                            <option value="openai">openai</option>
                            <option value="anthropic">anthropic</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label htmlFor={`${inputPrefix}-url`} className="block text-sm text-gray-400 mb-1">Base URL</label>
                          <input
                            id={`${inputPrefix}-url`}
                            type="text"
                            value={config.base_url || ''}
                            onChange={(e) => updatePlayer(index, 'base_url', e.target.value)}
                            placeholder="https://your-endpoint/v1"
                            className="input w-full"
                            required
                          />
                        </div>
                        <div className="flex-1">
                          <label htmlFor={`${inputPrefix}-key`} className="block text-sm text-gray-400 mb-1">
                            API Key <span className="text-gray-500">(可选)</span>
                          </label>
                          <input
                            id={`${inputPrefix}-key`}
                            type="password"
                            value={config.api_key || ''}
                            onChange={(e) => updatePlayer(index, 'api_key', e.target.value)}
                            placeholder="留空则用 key_env"
                            className="input w-full"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-[6rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-t border-gray-600/70 pt-3">
                      <div>
                        <label htmlFor={`${inputPrefix}-personality`} className="block text-sm text-gray-400">玩家性格</label>
                        <span className="text-[10px] text-gray-500">影响表达与倾向</span>
                      </div>
                      <div className="min-w-0">
                        <select
                          id={`${inputPrefix}-personality`}
                          value={config.personality_id || ''}
                          onChange={(e) => applyPersonality(index, e.target.value)}
                          className="select w-full"
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
                          <p className="mt-1 truncate text-[10px] text-[#c4b5fd]">
                            {TONE_LABELS[config.personality.tone]} · {REASONING_LABELS[config.personality.reasoning_style]}
                            {' · '}风险 {config.personality.risk_tolerance} · 主导 {config.personality.assertiveness} · 表达 {config.personality.verbosity}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => randomizePersonalities(index)}
                        aria-label={`随机设置 ${config.player_id} 的性格`}
                        title="随机性格"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded border border-[#c4b5fd]/25 text-[#c4b5fd]/65 transition-colors hover:border-[#c4b5fd]/60 hover:bg-[#c4b5fd]/10 hover:text-[#e7e0ff]"
                      >
                        <span className="material-symbols-outlined text-[17px]">casino</span>
                      </button>
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {avatarPickerIndex !== null && playerConfigs[avatarPickerIndex] && (
              <AvatarPicker
                value={playerConfigs[avatarPickerIndex].avatar_id}
                playerId={playerConfigs[avatarPickerIndex].player_id}
                onSelect={(avatarId) => {
                  updatePlayer(avatarPickerIndex, 'avatar_id', avatarId);
                  setAvatarPickerIndex(null);
                }}
                onClose={() => setAvatarPickerIndex(null)}
              />
            )}
          </div>

          {/* Seed */}
          <div>
            <label htmlFor="game-seed" className="block text-sm font-medium text-gray-300 mb-2">
              随机种子（可选，用于可复现）
            </label>
            <input
              id="game-seed"
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
            {loading ? '正在创建…' : '创建对局'}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 border-l-2 border-antique-gold/30 bg-white/[0.02] px-4 py-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            <strong className="font-normal text-paper/70">配置说明：</strong>使用快速布置可一键创建预设配置。
            provider 列表来自后端 <code>config/models.yaml</code>，
            后端更新后前端自动同步。选「自定义端点」可填任意 OpenAI/Anthropic 格式的 API。
          </p>
        </div>
      </div>
    </div>
  );
}
