import type { Role } from '../../types/api';

export interface RoleConfig {
  icon: string;
  symbol: string;
  label: string;
  color: string;
  badgeClass: string;
  cardClass: string;
  ringClass: string;
  team: 'werewolf' | 'good';
}

const ROLE_MAP: Record<string, RoleConfig> = {
  werewolf: {
    icon: '狼',
    symbol: 'swords',
    label: '狼人',
    color: '#b8463d',
    badgeClass: 'bg-[#b8463d]/12 text-[#d28c85] border border-[#b8463d]/30',
    cardClass: 'active-wolf',
    ringClass: 'ring-[#b8463d]/55',
    team: 'werewolf',
  },
  seer: {
    icon: '预',
    symbol: 'visibility',
    label: '预言家',
    color: '#b99758',
    badgeClass: 'bg-[#b99758]/12 text-[#d7bd8b] border border-[#b99758]/30',
    cardClass: 'active-seer',
    ringClass: 'ring-[#b99758]/55',
    team: 'good',
  },
  witch: {
    icon: '巫',
    symbol: 'experiment',
    label: '女巫',
    color: '#9870a8',
    badgeClass: 'bg-[#9870a8]/12 text-[#c4a7cf] border border-[#9870a8]/30',
    cardClass: '',
    ringClass: 'ring-[#9870a8]/55',
    team: 'good',
  },
  hunter: {
    icon: '猎',
    symbol: 'my_location',
    label: '猎人',
    color: '#bc8d50',
    badgeClass: 'bg-[#bc8d50]/12 text-[#d4b27e] border border-[#bc8d50]/30',
    cardClass: '',
    ringClass: 'ring-[#bc8d50]/55',
    team: 'good',
  },
  idiot: {
    icon: '愚',
    symbol: 'playing_cards',
    label: '白痴',
    color: '#b77979',
    badgeClass: 'bg-[#b77979]/12 text-[#d2a2a2] border border-[#b77979]/30',
    cardClass: '',
    ringClass: 'ring-[#b77979]/55',
    team: 'good',
  },
  guard: {
    icon: '守',
    symbol: 'shield',
    label: '守卫',
    color: '#6f9ca5',
    badgeClass: 'bg-[#6f9ca5]/12 text-[#9fc0c5] border border-[#6f9ca5]/30',
    cardClass: '',
    ringClass: 'ring-[#6f9ca5]/55',
    team: 'good',
  },
  white_wolf_king: {
    icon: '白',
    symbol: 'bomb',
    label: '白狼王',
    color: '#d7c8b1',
    badgeClass: 'bg-[#d7c8b1]/10 text-[#e3d8c7] border border-[#d7c8b1]/28',
    cardClass: 'active-wolf',
    ringClass: 'ring-[#d7c8b1]/55',
    team: 'werewolf',
  },
  wolf_king: {
    icon: '王',
    symbol: 'crown',
    label: '狼王',
    color: '#a63b35',
    badgeClass: 'bg-[#a63b35]/12 text-[#d08c86] border border-[#a63b35]/30',
    cardClass: 'active-wolf',
    ringClass: 'ring-[#a63b35]/55',
    team: 'werewolf',
  },
  wolf_beauty: {
    icon: '美',
    symbol: 'connect_without_contact',
    label: '狼美人',
    color: '#a84f72',
    badgeClass: 'bg-[#a84f72]/12 text-[#d49ab2] border border-[#a84f72]/30',
    cardClass: 'active-wolf',
    ringClass: 'ring-[#a84f72]/55',
    team: 'werewolf',
  },
  knight: {
    icon: '骑',
    symbol: 'swords',
    label: '骑士',
    color: '#9c906e',
    badgeClass: 'bg-[#9c906e]/12 text-[#cfc29a] border border-[#9c906e]/30',
    cardClass: '',
    ringClass: 'ring-[#9c906e]/55',
    team: 'good',
  },
  villager: {
    icon: '民',
    symbol: 'person',
    label: '村民',
    color: '#6f7c83',
    badgeClass: 'bg-[#6f7c83]/12 text-[#abb3b6] border border-[#6f7c83]/28',
    cardClass: '',
    ringClass: 'ring-[#6f7c83]/45',
    team: 'good',
  },
};

export function getRoleConfig(role: Role | string): RoleConfig {
  return ROLE_MAP[role] || ROLE_MAP.villager;
}

export function deathCauseLabel(cause?: string): string {
  if (cause === 'werewolf_kill') return '被狼人杀害';
  if (cause === 'voted_out') return '被投票放逐';
  if (cause === 'poison') return '被女巫毒杀';
  if (cause === 'night_death') return '在夜间死亡';
  if (cause === 'hunter_shot') return '被猎人开枪带走';
  if (cause === 'wolf_king_shot') return '被狼王带走';
  if (cause === 'white_wolf_king') return '被白狼王带走';
  if (cause === 'self_destruct') return '自爆';
  if (cause === 'wolf_beauty_charm') return '被狼美人殉情带走';
  if (cause === 'knight_duel') return '在骑士决斗中落败';
  if (cause === 'knight_failed') return '发动决斗失败';
  return '已淘汰';
}

export function claimRoleLabel(claim: string): string | null {
  if (claim === 'none') return null;
  return `自称${getRoleConfig(claim).label}`;
}

export function avatarColor(id: string): string {
  const colors = [
    'bg-[#27323a]',
    'bg-[#3a3035]',
    'bg-[#343329]',
    'bg-[#273735]',
    'bg-[#383026]',
    'bg-[#302d39]',
    'bg-[#2f3729]',
    'bg-[#29363a]',
  ];
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return colors[hash % colors.length];
}

export function playerInitial(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(-2) || id.slice(0, 2);
}
