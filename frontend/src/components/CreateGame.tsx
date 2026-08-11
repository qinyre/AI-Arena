import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type {
  BudgetTier,
  ModelConnectionTestRequest,
  PlayerConfig,
  ProvidersResponse,
  RoleId,
} from '../types/api';
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
import {
  loadLineupTemplates,
  saveLineupTemplates,
  type LineupTemplate,
} from '../utils/lineupTemplates';
import { AvatarPicker, LobeAvatar } from './LobeAvatar';

interface Props {
  onGameCreated: (gameId: string) => void;
}

// 特殊 provider 值：用户自定义端点（对应后端"用户直填"路径，绕过 yaml 白名单）
const CUSTOM_PROVIDER = '__custom__';
const PRESET_PROVIDER_PREFIX = '__preset__:';

const ROLE_OPTIONS: Array<{
  id: RoleId;
  name: string;
  faction: '狼人' | '神职' | '平民';
  max: number;
}> = [
  { id: 'werewolf', name: '狼人', faction: '狼人', max: 8 },
  { id: 'white_wolf_king', name: '白狼王', faction: '狼人', max: 1 },
  { id: 'wolf_king', name: '狼王', faction: '狼人', max: 1 },
  { id: 'wolf_beauty', name: '狼美人', faction: '狼人', max: 1 },
  { id: 'seer', name: '预言家', faction: '神职', max: 1 },
  { id: 'witch', name: '女巫', faction: '神职', max: 1 },
  { id: 'hunter', name: '猎人', faction: '神职', max: 1 },
  { id: 'idiot', name: '白痴', faction: '神职', max: 1 },
  { id: 'guard', name: '守卫', faction: '神职', max: 1 },
  { id: 'knight', name: '骑士', faction: '神职', max: 1 },
  { id: 'villager', name: '平民', faction: '平民', max: 17 },
];

const STANDARD_9P_ROLES: RoleId[] = [
  'werewolf', 'werewolf', 'werewolf',
  'seer', 'witch', 'hunter',
  'villager', 'villager', 'villager',
];

const BOARD_OPTIONS: Array<{
  id: string;
  name: string;
  count: number;
  roles: string;
  roleIds?: RoleId[];
}> = [
  { id: '5p', name: '5人极简场', count: 5, roles: '1狼 · 预言家 · 3民', roleIds: ['werewolf', 'seer', 'villager', 'villager', 'villager'] },
  { id: '9p', name: '9人标准场', count: 9, roles: '3狼 · 预言家/女巫/猎人 · 3民', roleIds: STANDARD_9P_ROLES },
  { id: '12p_idiot', name: '12人预女猎白', count: 12, roles: '4狼 · 预言家/女巫/猎人/白痴 · 4民', roleIds: ['werewolf', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager', 'villager'] },
  { id: '12p_white_wolf_guard', name: '12人白狼王守卫', count: 12, roles: '3狼+白狼王 · 预言家/女巫/猎人/守卫 · 4民', roleIds: ['werewolf', 'werewolf', 'werewolf', 'white_wolf_king', 'seer', 'witch', 'hunter', 'guard', 'villager', 'villager', 'villager', 'villager'] },
  { id: '12p_wolf_king_guard', name: '12人狼王守卫', count: 12, roles: '3狼+狼王 · 预言家/女巫/猎人/守卫 · 4民', roleIds: ['werewolf', 'werewolf', 'werewolf', 'wolf_king', 'seer', 'witch', 'hunter', 'guard', 'villager', 'villager', 'villager', 'villager'] },
  { id: '12p_wolf_beauty_knight', name: '12人狼美骑士', count: 12, roles: '3狼+狼美人 · 预言家/女巫/守卫/骑士 · 4民', roleIds: ['werewolf', 'werewolf', 'werewolf', 'wolf_beauty', 'seer', 'witch', 'guard', 'knight', 'villager', 'villager', 'villager', 'villager'] },
  { id: 'custom', name: '自定义板型', count: 9, roles: '自由组合已实现角色' },
];

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
    description: '保留完整推理与发言，适合大多数对局',
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
  const [lineupTemplates, setLineupTemplates] = useState(loadLineupTemplates);
  const [lineupName, setLineupName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([]);
  const [boardId, setBoardId] = useState('5p');
  const [customBoardName, setCustomBoardName] = useState('自定义板型');
  const [customRoles, setCustomRoles] = useState<RoleId[]>(STANDARD_9P_ROLES);
  const [customWinRule, setCustomWinRule] = useState<'parity' | 'edge'>('edge');
  const [boardValidationError, setBoardValidationError] = useState('');
  const [enableSheriff, setEnableSheriff] = useState(false);
  const [budgetTier, setBudgetTier] = useState<BudgetTier>('standard');
  const [maxRounds, setMaxRounds] = useState(20);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});
  const [connectionChecks, setConnectionChecks] = useState<Record<number, {
    ok: boolean;
    message: string;
  }>>({});
  const [connectionSummary, setConnectionSummary] = useState('');
  const [checkingConnections, setCheckingConnections] = useState(false);
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
    setConnectionChecks({});
    setConnectionSummary('');
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
    setConnectionChecks({});
    setConnectionSummary('');
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
    setConnectionChecks({});
    setConnectionSummary('');
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

  const resizePlayers = (configs: PlayerConfig[], count: number) => {
    const fallback = configs[0] ?? {
      player_id: 'AI-1',
      provider: providersData?.default_provider,
      model: providersData?.default_model ?? '',
    };
    return Array.from({ length: count }, (_, i) => (
      configs[i] ?? {
        ...fallback,
        player_id: `AI-${i + 1}`,
        avatar_id: undefined,
        personality_id: undefined,
        personality: undefined,
      }
    ));
  };

  const changeBoard = (id: string) => {
    let count = BOARD_OPTIONS.find((board) => board.id === id)?.count ?? 5;
    if (id === 'custom') {
      const sourceRoles = BOARD_OPTIONS.find((board) => board.id === boardId)?.roleIds;
      if (sourceRoles) {
        setCustomRoles([...sourceRoles]);
        count = sourceRoles.length;
      } else {
        count = customRoles.length;
      }
    }
    setBoardId(id);
    setPlayerConfigs((configs) => resizePlayers(configs, count));
    setValidationErrors({});
    setBoardValidationError('');
    setConnectionChecks({});
    setConnectionSummary('');
  };

  const setCustomRoleCount = (roleId: RoleId, count: number) => {
    const nextRoles = ROLE_OPTIONS.flatMap((option) => (
      Array.from({ length: option.id === roleId
        ? Math.max(0, Math.min(option.max, count))
        : customRoles.filter((role) => role === option.id).length }, () => option.id)
    ));
    if (nextRoles.length > 18) return;
    setCustomRoles(nextRoles);
    setPlayerConfigs((configs) => resizePlayers(configs, nextRoles.length));
    setBoardValidationError('');
    setConnectionChecks({});
    setConnectionSummary('');
  };

  const validateCustomBoard = (): string => {
    if (boardId !== 'custom') return '';
    if (!customBoardName.trim()) return '自定义板型名称不能为空';
    if (customRoles.length < 5 || customRoles.length > 18) return '自定义板型需要 5—18 名玩家';
    const wolves = customRoles.filter((role) => (
      ['werewolf', 'white_wolf_king', 'wolf_king', 'wolf_beauty'] as RoleId[]
    ).includes(role)).length;
    const gods = customRoles.filter((role) => (
      ['seer', 'witch', 'hunter', 'idiot', 'guard', 'knight'] as RoleId[]
    ).includes(role)).length;
    const villagers = customRoles.filter((role) => role === 'villager').length;
    if (wolves === 0 || wolves === customRoles.length) return '必须同时包含狼人和好人';
    if (wolves >= customRoles.length - wolves) return '开局狼人数量必须少于好人数量';
    if (customWinRule === 'edge' && (!gods || !villagers)) return '屠边规则必须同时包含神职和平民';
    return '';
  };

  const validateForm = (): boolean => {
    const errors: Record<number, string> = {};
    const customError = validateCustomBoard();
    setBoardValidationError(customError);

    playerConfigs.forEach((config, index) => {
      if (!config.player_id.trim()) {
        errors[index] = '玩家 ID 不能为空';
      } else if (!config.provider) {
        errors[index] = '请选择提供商';
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
    return Object.keys(errors).length === 0 && !customError;
  };

  const copyPlayerSettings = (sourceIndex: number) => {
    setPlayerConfigs((configs) => {
      const source = configs[sourceIndex];
      const shared: Partial<PlayerConfig> = { ...source };
      delete shared.player_id;
      delete shared.avatar_id;
      return configs.map((config, index) => (
        index === sourceIndex
          ? config
          : ({
              ...shared,
              player_id: config.player_id,
              avatar_id: config.avatar_id,
            } as PlayerConfig)
      ));
    });
    setValidationErrors({});
    setConnectionChecks({});
    setConnectionSummary('');
  };

  const saveCurrentLineup = () => {
    const name = lineupName.trim();
    if (!name) {
      setError('请先填写阵容模板名称');
      return;
    }
    if (!validateForm()) {
      setError('当前阵容配置不完整，暂不能保存模板');
      return;
    }
    const existing = lineupTemplates.find((template) => template.name === name);
    if (existing && !window.confirm(`覆盖阵容模板“${name}”？`)) return;
    const template: LineupTemplate = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      boardId,
      ...(boardId === 'custom' ? {
        customBoard: {
          name: customBoardName.trim(),
          roles: [...customRoles],
          win_rule: customWinRule,
        },
      } : {}),
      enableSheriff,
      budgetTier,
      maxRounds,
      players: playerConfigs.map((player) => ({
        ...player,
        ...(player.personality ? { personality: { ...player.personality } } : {}),
      })),
    };
    const next = existing
      ? lineupTemplates.map((item) => item.id === existing.id ? template : item)
      : [...lineupTemplates, template];
    saveLineupTemplates(next);
    setLineupTemplates(next);
    setLineupName('');
    setError(null);
  };

  const applyLineupTemplate = (template: LineupTemplate) => {
    const board = BOARD_OPTIONS.find((option) => option.id === template.boardId);
    const expectedCount = template.customBoard?.roles.length ?? board?.count;
    if (!expectedCount || template.players.length !== expectedCount) {
      setError(`阵容模板“${template.name}”的板型与席位数不一致`);
      return;
    }
    try {
      const players = template.players.map((player) => {
        if (player.provider?.startsWith(PRESET_PROVIDER_PREFIX)) {
          const presetId = player.provider.slice(PRESET_PROVIDER_PREFIX.length);
          if (!modelPresets.some((preset) => preset.id === presetId)) {
            if (!player.base_url) throw new Error(`${player.player_id} 引用的模型预设已删除`);
            return { ...player, provider: CUSTOM_PROVIDER };
          }
        } else if (
          player.provider
          && player.provider !== CUSTOM_PROVIDER
          && !providersData?.providers[player.provider]
        ) {
          throw new Error(`${player.player_id} 引用的 provider ${player.provider} 已不存在`);
        }
        if (
          player.personality_id
          && !personalityPresets.some((preset) => preset.id === player.personality_id)
        ) {
          return { ...player, personality_id: undefined };
        }
        return { ...player };
      });
      setBoardId(template.boardId);
      if (template.customBoard) {
        setCustomBoardName(template.customBoard.name);
        setCustomRoles([...template.customBoard.roles]);
        setCustomWinRule(template.customBoard.win_rule);
      }
      setEnableSheriff(template.enableSheriff);
      setBudgetTier(template.budgetTier);
      setMaxRounds(template.maxRounds || 20);
      setPlayerConfigs(players);
      setValidationErrors({});
      setBoardValidationError('');
      setConnectionChecks({});
      setConnectionSummary('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '阵容模板无法载入');
    }
  };

  const removeLineupTemplate = (template: LineupTemplate) => {
    if (!window.confirm(`删除阵容模板“${template.name}”？`)) return;
    const next = lineupTemplates.filter((item) => item.id !== template.id);
    saveLineupTemplates(next);
    setLineupTemplates(next);
  };

  const testRosterConnections = async () => {
    if (!validateForm()) {
      setError('请先修正表单，再检查模型连通性');
      return;
    }
    setError(null);
    const groups = new Map<string, {
      request: ModelConnectionTestRequest;
      indexes: number[];
    }>();
    playerConfigs.forEach((player, index) => {
      const custom = player.provider === CUSTOM_PROVIDER
        || player.provider?.startsWith(PRESET_PROVIDER_PREFIX);
      const request: ModelConnectionTestRequest = custom
        ? {
            api_format: player.api_format || 'openai',
            base_url: player.base_url,
            model: player.model,
            ...(player.api_key ? { api_key: player.api_key } : {}),
          }
        : {
            provider: player.provider,
            api_format: providersData?.providers[player.provider!]?.protocol || 'openai',
            model: player.model,
          };
      const key = JSON.stringify([
        request.provider || '',
        request.api_format,
        request.base_url?.replace(/\/+$/, '') || '',
        request.model,
        request.api_key || '',
      ]);
      const group = groups.get(key);
      if (group) group.indexes.push(index);
      else groups.set(key, { request, indexes: [index] });
    });

    setCheckingConnections(true);
    setConnectionChecks({});
    setConnectionSummary(`正在检查 ${groups.size} 个唯一模型配置…`);
    const results = await Promise.all([...groups.values()].map(async (group) => {
      try {
        const result = await apiClient.testModelConnection(group.request);
        return {
          ...group,
          ok: true,
          message: `${result.latency_ms}ms · ${result.usage.total_tokens ?? 0} tokens`,
        };
      } catch (err) {
        return {
          ...group,
          ok: false,
          message: err instanceof Error ? err.message : '连接失败',
        };
      }
    }));
    const checks: Record<number, { ok: boolean; message: string }> = {};
    results.forEach((result) => {
      result.indexes.forEach((index) => {
        checks[index] = { ok: result.ok, message: result.message };
      });
    });
    const passed = results.filter((result) => result.ok).length;
    setConnectionChecks(checks);
    setConnectionSummary(`${passed}/${results.length} 个唯一模型配置连接成功；相同配置只测试一次。`);
    setCheckingConnections(false);
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
        ...(boardId === 'custom' ? {
          custom_board: {
            name: customBoardName.trim(),
            roles: customRoles,
            win_rule: customWinRule,
          },
        } : {}),
        seed: seed || undefined,
        enable_sheriff: enableSheriff,
        budget_tier: budgetTier,
        max_rounds: maxRounds,
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
  const customRoleCounts = Object.fromEntries(
    ROLE_OPTIONS.map((option) => [
      option.id,
      customRoles.filter((role) => role === option.id).length,
    ]),
  ) as Record<RoleId, number>;
  const customFactionCounts = {
    狼人: ROLE_OPTIONS
      .filter((role) => role.faction === '狼人')
      .reduce((sum, role) => sum + customRoleCounts[role.id], 0),
    神职: ROLE_OPTIONS
      .filter((role) => role.faction === '神职')
      .reduce((sum, role) => sum + customRoleCounts[role.id], 0),
    平民: customRoleCounts.villager,
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="card">
        <div className="mb-6 border-b border-white/[0.08] pb-4">
          <p className="font-label text-[9px] tracking-[0.24em] text-antique-gold/65">OPEN A NEW CASE</p>
          <h2 className="mt-1 font-display text-2xl text-paper">创建新对局</h2>
          <p className="mt-1 text-xs text-ink-muted">选择板型、模型与性格，让整套阵容依次入场。</p>
        </div>

        <div className="mb-4 border border-white/10 bg-black/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="font-display text-sm text-paper/85">完整阵容模板</h3>
              <p className="mt-1 text-[11px] text-ink-muted">保存板型、警长、预算、模型、头像与性格；API Key 仍只明文保存在当前浏览器。</p>
            </div>
            <div className="flex w-full gap-2 lg:max-w-md">
              <input
                type="text"
                value={lineupName}
                onChange={(event) => setLineupName(event.target.value)}
                maxLength={30}
                placeholder="模板名称"
                className="input min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={saveCurrentLineup}
                className="min-h-11 shrink-0 border border-antique-gold/40 px-4 font-label text-xs text-antique-gold hover:bg-antique-gold/10"
              >保存当前阵容</button>
            </div>
          </div>
          {lineupTemplates.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {lineupTemplates.map((template) => (
                <div key={template.id} className="flex items-stretch border border-white/10 bg-stage-deep">
                  <button
                    type="button"
                    onClick={() => applyLineupTemplate(template)}
                    className="px-3 py-2 text-left hover:bg-antique-gold/[0.07]"
                  >
                    <span className="block font-label text-xs text-paper/85">{template.name}</span>
                    <span className="block text-[10px] text-ink-muted">{template.players.length} 人 · 最多 {template.maxRounds || 20} 轮</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLineupTemplate(template)}
                    aria-label={`删除阵容模板 ${template.name}`}
                    className="grid min-h-11 w-10 place-items-center border-l border-white/10 text-ink-muted hover:text-crimson"
                  >
                    <span className="material-symbols-outlined text-[17px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
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
            {boardId === 'custom' && (
              <div className="mt-3 border border-antique-gold/25 bg-black/15 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
                  <label className="text-xs text-ink-muted">
                    板型名称
                    <input
                      type="text"
                      value={customBoardName}
                      onChange={(event) => {
                        setCustomBoardName(event.target.value);
                        setBoardValidationError('');
                      }}
                      maxLength={30}
                      className="input mt-1 w-full"
                    />
                  </label>
                  <label className="text-xs text-ink-muted">
                    胜利规则
                    <select
                      value={customWinRule}
                      onChange={(event) => {
                        setCustomWinRule(event.target.value as 'parity' | 'edge');
                        setBoardValidationError('');
                      }}
                      className="select mt-1 w-full"
                    >
                      <option value="edge">屠边（屠民或屠神）</option>
                      <option value="parity">人数（狼人不少于好人）</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {ROLE_OPTIONS.map((role) => {
                    const count = customRoleCounts[role.id];
                    return (
                      <div key={role.id} className="flex min-h-11 items-center gap-2 border border-white/10 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <b className="block font-display text-sm text-paper">{role.name}</b>
                          <span className="text-[10px] text-ink-muted">{role.faction}{role.max === 1 ? ' · 唯一' : ''}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setCustomRoleCount(role.id, count - 1)}
                          disabled={count === 0}
                          aria-label={`减少${role.name}`}
                          className="grid h-8 w-8 place-items-center border border-white/15 disabled:opacity-25"
                        >−</button>
                        <span className="w-5 text-center font-label text-sm text-antique-gold">{count}</span>
                        <button
                          type="button"
                          onClick={() => setCustomRoleCount(role.id, count + 1)}
                          disabled={count >= role.max || customRoles.length >= 18}
                          aria-label={`增加${role.name}`}
                          className="grid h-8 w-8 place-items-center border border-white/15 disabled:opacity-25"
                        >+</button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>共 <b className="text-paper">{customRoles.length}</b> 人</span>
                  <span className="text-crimson">狼人 {customFactionCounts.狼人}</span>
                  <span className="text-[#c4b5fd]">神职 {customFactionCounts.神职}</span>
                  <span>平民 {customFactionCounts.平民}</span>
                </div>
                {boardValidationError && (
                  <p className="mt-3 border-l-2 border-crimson pl-3 text-xs text-red-300">{boardValidationError}</p>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              预设 9/12 人局采用屠边规则，自定义板型以所选规则为准；守卫不可连续守同一人，同守同救仍死亡。
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

          <div>
            <label htmlFor="max-rounds" className="mb-2 block text-sm font-medium text-gray-300">
              最大回合数
            </label>
            <input
              id="max-rounds"
              type="number"
              min={1}
              max={50}
              value={maxRounds}
              onChange={(event) => setMaxRounds(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
              className="input w-full sm:max-w-xs"
            />
            <p className="mt-1 text-xs text-ink-muted">达到上限仍未分胜负时，本局判为平局。</p>
          </div>

          {/* Player Configurations */}
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">玩家配置</h3>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={testRosterConnections}
                  disabled={checkingConnections}
                  className="inline-flex min-h-11 items-center gap-1.5 border border-emerald-400/25 px-3 py-1.5 font-label text-[10px] text-emerald-200/75 transition-colors hover:border-emerald-300/60 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">network_check</span>
                  {checkingConnections ? '检查中…' : '检查全阵容'}
                </button>
                <button
                  type="button"
                  onClick={() => randomizePersonalities()}
                  className="inline-flex min-h-11 items-center gap-1.5 border border-white/15 px-3 py-1.5 font-label text-[10px] text-paper/65 transition-colors hover:border-antique-gold/45 hover:text-antique-gold"
                >
                  随机分配性格
                </button>
              </div>
            </div>
            <p className="mb-3 text-[11px] text-ink-muted">
              连通性检查为手动操作：相同 provider/端点与模型只发送一次测试请求，每个唯一配置最多生成 8 tokens。
              {connectionSummary && <span className="ml-2 text-paper/75">{connectionSummary}</span>}
            </p>
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
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => copyPlayerSettings(index)}
                        className="min-h-9 border border-white/10 px-2.5 font-label text-[9px] text-ink-muted transition-colors hover:border-antique-gold/40 hover:text-antique-gold"
                      >
                        复制模型与性格到其余席位
                      </button>
                    </div>
                    {hasError && (
                      <div className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded">
                        {hasError}
                      </div>
                    )}
                    {connectionChecks[index] && (
                      <div className={`border-l-2 px-3 py-2 text-xs ${
                        connectionChecks[index].ok
                          ? 'border-emerald-400 bg-emerald-400/[0.06] text-emerald-200'
                          : 'border-crimson bg-crimson/[0.06] text-red-300'
                      }`}>
                        {connectionChecks[index].ok ? '连接成功' : '连接失败'} · {connectionChecks[index].message}
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
