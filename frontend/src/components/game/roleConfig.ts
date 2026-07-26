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
  witch: {
    icon: '🧪', symbol: 'experiment', label: '女巫', color: '#a78bfa',
    badgeClass: 'bg-violet-500/15 text-violet-200 border border-violet-500/30',
    cardClass: '', ringClass: 'ring-violet-500/60', team: 'good',
  },
  hunter: {
    icon: '🏹', symbol: 'my_location', label: '猎人', color: '#f59e0b',
    badgeClass: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    cardClass: '', ringClass: 'ring-amber-500/60', team: 'good',
  },
  idiot: {
    icon: '🃏', symbol: 'playing_cards', label: '白痴', color: '#ec4899',
    badgeClass: 'bg-pink-500/15 text-pink-200 border border-pink-500/30',
    cardClass: '', ringClass: 'ring-pink-500/60', team: 'good',
  },
  guard: {
    icon: '🛡️', symbol: 'shield', label: '守卫', color: '#22c55e',
    badgeClass: 'bg-green-500/15 text-green-200 border border-green-500/30',
    cardClass: '', ringClass: 'ring-green-500/60', team: 'good',
  },
  white_wolf_king: {
    icon: '🐺', symbol: 'bomb', label: '白狼王', color: '#fb7185',
    badgeClass: 'bg-rose-500/15 text-rose-200 border border-rose-500/30',
    cardClass: 'active-wolf', ringClass: 'ring-rose-500/60', team: 'werewolf',
  },
  wolf_king: {
    icon: '👑', symbol: 'crown', label: '狼王', color: '#dc2626',
    badgeClass: 'bg-red-600/15 text-red-200 border border-red-600/30',
    cardClass: 'active-wolf', ringClass: 'ring-red-600/60', team: 'werewolf',
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
  if (cause === 'poison') return '被女巫毒杀';
  if (cause === 'shot') return '被死亡技能带走';
  if (cause === 'white_wolf_king') return '被白狼王带走';
  if (cause === 'self_destruct') return '自爆';
  return '已淘汰';
}

/** 身份声明(claim_role) → 标签 */
export function claimRoleLabel(claim: string): string | null {
  if (claim === 'none') return null;
  return `自称${getRoleConfig(claim).label}`;
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
