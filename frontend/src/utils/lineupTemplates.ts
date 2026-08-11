import type {
  BudgetTier,
  CustomBoardConfig,
  PlayerConfig,
} from '../types/api';

export interface LineupTemplate {
  id: string;
  name: string;
  boardId: string;
  customBoard?: CustomBoardConfig;
  enableSheriff: boolean;
  budgetTier: BudgetTier;
  maxRounds: number;
  players: PlayerConfig[];
}

const STORAGE_KEY = 'ai-arena:lineup-templates';

export function loadLineupTemplates(): LineupTemplate[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((item) => item?.id && item?.name && Array.isArray(item?.players))
      : [];
  } catch {
    return [];
  }
}

export function saveLineupTemplates(templates: LineupTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}
