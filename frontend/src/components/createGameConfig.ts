import type { BudgetTier, RoleId } from '../types/api';

// 特殊 provider 值：用户自定义端点（对应后端"用户直填"路径，绕过 yaml 白名单）
export const CUSTOM_PROVIDER = '__custom__';
export const PRESET_PROVIDER_PREFIX = '__preset__:';
export const GAME_TOKEN_CAP_BY_TIER: Record<BudgetTier, number> = {
  economy: 240_000,
  standard: 500_000,
  premium: 1_500_000,
};

export const ROLE_OPTIONS: Array<{
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

export const STANDARD_9P_ROLES: RoleId[] = [
  'werewolf', 'werewolf', 'werewolf',
  'seer', 'witch', 'hunter',
  'villager', 'villager', 'villager',
];

export const BOARD_OPTIONS: Array<{
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

export const BUDGET_OPTIONS: Array<{
  id: BudgetTier;
  name: string;
  description: string;
  limits: string;
}> = [
  {
    id: 'economy',
    name: '节制',
    description: '优先控制长局消耗，达到上限后使用本地合法动作完成对局',
    limits: '单次 700 · 单人 8万 · 全局 24万 tokens',
  },
  {
    id: 'standard',
    name: '标准',
    description: '保留完整推理与发言，适合大多数对局',
    limits: '单次 1200 · 单人 18万 · 全局 50万 tokens',
  },
  {
    id: 'premium',
    name: '宽裕',
    description: '允许更长表达和长局博弈，消耗上限明显提高',
    limits: '单次 1800 · 单人 50万 · 全局 150万 tokens',
  },
];

// 快速开始预设（基于 2026-07 最新模型）
export const QUICK_START_PRESETS = [
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
