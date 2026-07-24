/**
 * 角色配置:统一狼人/预言家/村民的图标、配色、标签。
 * Nocturne Stage 主题:金 = 预言家 / 绯红 = 狼人 / 蓝灰 = 村民。
 * 所有三栏/时间线组件共用,避免散落各处。
 */
import type { Role } from '../../types/api';

export interface RoleConfig {
  icon: string;
  /** Material Symbols 图标名(配合 .material-symbols-outlined) */
  symbol: string;
  label: string;
  /** 角色主题色 hex(金/绯红/蓝灰) */
  color: string;
  /** 已组合好的徽章 class */
  badgeClass: string;
  /** player-card 上的主题 class(active-wolf / active-seer / 空) */
  cardClass: string;
  /** 圆点/头像 ring 色 class */
  ringClass: string;
  team: 'werewolf' | 'good';
}

const ROLE_MAP: Record<string, RoleConfig> = {
  werewolf: {
    icon: '🐺',
    symbol: 'swords',
    label: '狼人',
    color: '#eb2445',
    badgeClass: 'bg-[#eb2445]/15 text-[#ffb3b3] border border-[#eb2445]/30',
    cardClass: 'active-wolf',
    ringClass: 'ring-[#eb2445]/60',
    team: 'werewolf',
  },
  seer: {
    icon: '🔮',
    symbol: 'visibility',
    label: '预言家',
    color: '#e9c400',
    badgeClass: 'bg-[#e9c400]/15 text-[#ffe16d] border border-[#e9c400]/30',
    cardClass: 'active-seer',
    ringClass: 'ring-[#e9c400]/60',
    team: 'good',
  },
  villager: {
    icon: '👤',
    symbol: 'person',
    label: '村民',
    color: '#64748b',
    badgeClass: 'bg-[#64748b]/15 text-[#c8c5cb] border border-[#64748b]/30',
    cardClass: '',
    ringClass: 'ring-[#64748b]/50',
    team: 'good',
  },
};

export function getRoleConfig(role: Role): RoleConfig {
  return ROLE_MAP[role] || ROLE_MAP.villager;
}

/** 死因 → 中文描述 */
export function deathCauseLabel(cause?: string): string {
  if (cause === 'werewolf_kill') return '被狼人杀害';
  if (cause === 'voted_out') return '被投票放逐';
  return '已淘汰';
}

/** 身份声明(claim_role) → 标签 */
export function claimRoleLabel(claim: string): string | null {
  if (claim === 'seer') return '自称预言家';
  if (claim === 'villager') return '自称村民';
  return null;
}

/** 玩家头像色块:基于 id 生成稳定的颜色(用于无图头像底色) */
export function avatarColor(id: string): string {
  const colors = [
    'bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-teal-500',
    'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-cyan-500',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

/** 玩家名缩写(取最后 2 个字母数字字符) */
export function playerInitial(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || id.slice(0, 2);
}
