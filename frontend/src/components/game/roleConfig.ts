/**
 * 角色配置：统一狼人/预言家/村民的图标、配色、标签。
 * 所有三栏组件共用，避免散落各处。
 */
import type { Role } from '../../types/api';

export interface RoleConfig {
  icon: string;
  label: string;
  /** 角色主题色 class 前缀用法：text-{key} / bg-{key} 等，配合 tailwind.config 的语义色 */
  color: string; // tailwind 色名，如 'red' / 'amber' / 'emerald'
  badgeClass: string; // 已组合好的徽章 class
  team: 'werewolf' | 'good';
}

const ROLE_MAP: Record<string, RoleConfig> = {
  werewolf: {
    icon: '🐺',
    label: '狼人',
    color: 'red',
    badgeClass: 'bg-red-500/15 text-red-300 border border-red-500/30',
    team: 'werewolf',
  },
  seer: {
    icon: '🔮',
    label: '预言家',
    color: 'amber',
    badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    team: 'good',
  },
  villager: {
    icon: '👤',
    label: '村民',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
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

/** 玩家头像色块：基于 id 生成稳定的颜色 */
export function avatarColor(id: string): string {
  const colors = [
    'bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-teal-500',
    'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-cyan-500',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}
