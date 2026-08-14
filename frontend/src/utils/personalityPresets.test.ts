import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_PERSONALITIES,
  REASONING_LABELS,
  TONE_LABELS,
  personalityProfile,
} from './personalityPresets';

describe('personalityPresets', () => {
  it('内置 5 套性格预设', () => {
    expect(BUILT_IN_PERSONALITIES).toHaveLength(5);
  });

  it('每套预设的数值维度都在 1—5 之间', () => {
    for (const preset of BUILT_IN_PERSONALITIES) {
      expect(preset.risk_tolerance).toBeGreaterThanOrEqual(1);
      expect(preset.risk_tolerance).toBeLessThanOrEqual(5);
      expect(preset.assertiveness).toBeGreaterThanOrEqual(1);
      expect(preset.assertiveness).toBeLessThanOrEqual(5);
      expect(preset.verbosity).toBeGreaterThanOrEqual(1);
      expect(preset.verbosity).toBeLessThanOrEqual(5);
    }
  });

  it('personalityProfile 剥离 id 与 builtIn 元数据', () => {
    const profile = personalityProfile(BUILT_IN_PERSONALITIES[0]);
    expect(profile).not.toHaveProperty('id');
    expect(profile).not.toHaveProperty('builtIn');
    expect(profile.name).toBe(BUILT_IN_PERSONALITIES[0].name);
    expect(profile.tone).toBe(BUILT_IN_PERSONALITIES[0].tone);
  });

  it('标签映射覆盖全部枚举值', () => {
    expect(Object.keys(TONE_LABELS)).toHaveLength(5);
    expect(Object.keys(REASONING_LABELS)).toHaveLength(4);
  });
});
