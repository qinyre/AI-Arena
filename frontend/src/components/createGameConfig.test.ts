import { describe, it, expect } from 'vitest';
import {
  BOARD_OPTIONS,
  BUDGET_OPTIONS,
  GAME_TOKEN_CAP_BY_TIER,
  QUICK_START_PRESETS,
  ROLE_OPTIONS,
  STANDARD_9P_ROLES,
} from './createGameConfig';

describe('createGameConfig', () => {
  it('板型选项覆盖全部预设与自定义', () => {
    expect(BOARD_OPTIONS.map((b) => b.id)).toEqual([
      '5p',
      '9p',
      '12p_idiot',
      '12p_white_wolf_guard',
      '12p_wolf_king_guard',
      '12p_wolf_beauty_knight',
      'custom',
    ]);
  });

  it('9 人标准场为 3 狼 3 神 3 民', () => {
    expect(STANDARD_9P_ROLES).toHaveLength(9);
    expect(STANDARD_9P_ROLES.filter((r) => r === 'werewolf')).toHaveLength(3);
    expect(STANDARD_9P_ROLES.filter((r) => r === 'villager')).toHaveLength(3);
  });

  it('预算档位覆盖 economy/standard/premium 且上限递增', () => {
    expect(BUDGET_OPTIONS.map((b) => b.id)).toEqual(['economy', 'standard', 'premium']);
    expect(GAME_TOKEN_CAP_BY_TIER.economy).toBe(240_000);
    expect(GAME_TOKEN_CAP_BY_TIER.standard).toBe(500_000);
    expect(GAME_TOKEN_CAP_BY_TIER.premium).toBe(1_500_000);
  });

  it('角色选项含全部 11 种角色', () => {
    expect(ROLE_OPTIONS).toHaveLength(11);
    expect(ROLE_OPTIONS.map((r) => r.id)).toContain('white_wolf_king');
    expect(ROLE_OPTIONS.map((r) => r.id)).toContain('wolf_beauty');
  });

  it('快速开始预设非空且模型名唯一', () => {
    expect(QUICK_START_PRESETS.length).toBeGreaterThan(0);
    const models = QUICK_START_PRESETS.map((p) => p.model);
    expect(new Set(models).size).toBe(models.length);
  });
});
