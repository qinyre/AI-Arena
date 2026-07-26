export type PersonalityTone = 'calm' | 'direct' | 'diplomatic' | 'playful' | 'dramatic';
export type ReasoningStyle = 'evidence' | 'intuition' | 'pressure' | 'consensus';

export interface PersonalityProfile {
  name: string;
  tone: PersonalityTone;
  reasoning_style: ReasoningStyle;
  risk_tolerance: number;
  assertiveness: number;
  verbosity: number;
}

export interface PersonalityPreset extends PersonalityProfile {
  id: string;
  builtIn?: boolean;
}

export const TONE_LABELS: Record<PersonalityTone, string> = {
  calm: '冷静克制',
  direct: '直接锋利',
  diplomatic: '圆融审慎',
  playful: '轻松机敏',
  dramatic: '戏剧张力',
};

export const REASONING_LABELS: Record<ReasoningStyle, string> = {
  evidence: '证据驱动',
  intuition: '直觉观察',
  pressure: '质询施压',
  consensus: '阵营协作',
};

export const BUILT_IN_PERSONALITIES: PersonalityPreset[] = [
  {
    id: 'builtin:analyst', builtIn: true, name: '理性分析师',
    tone: 'calm', reasoning_style: 'evidence',
    risk_tolerance: 2, assertiveness: 3, verbosity: 4,
  },
  {
    id: 'builtin:leader', builtIn: true, name: '强势领袖',
    tone: 'direct', reasoning_style: 'pressure',
    risk_tolerance: 4, assertiveness: 5, verbosity: 3,
  },
  {
    id: 'builtin:observer', builtIn: true, name: '谨慎观察者',
    tone: 'calm', reasoning_style: 'evidence',
    risk_tolerance: 1, assertiveness: 2, verbosity: 2,
  },
  {
    id: 'builtin:gambler', builtIn: true, name: '直觉赌徒',
    tone: 'dramatic', reasoning_style: 'intuition',
    risk_tolerance: 5, assertiveness: 4, verbosity: 3,
  },
  {
    id: 'builtin:diplomat', builtIn: true, name: '圆滑社交家',
    tone: 'diplomatic', reasoning_style: 'consensus',
    risk_tolerance: 3, assertiveness: 3, verbosity: 4,
  },
];

const STORAGE_KEY = 'ai-arena:personality-presets';
const tones = Object.keys(TONE_LABELS);
const reasoningStyles = Object.keys(REASONING_LABELS);

function isValid(value: unknown): value is PersonalityPreset {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string'
    && typeof item.name === 'string'
    && tones.includes(String(item.tone))
    && reasoningStyles.includes(String(item.reasoning_style))
    && ['risk_tolerance', 'assertiveness', 'verbosity'].every((key) => (
      typeof item[key] === 'number'
      && Number.isInteger(item[key])
      && item[key] >= 1
      && item[key] <= 5
    ))
  );
}

export function loadCustomPersonalityPresets(): PersonalityPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(isValid) : [];
  } catch {
    return [];
  }
}

export function loadAllPersonalityPresets(): PersonalityPreset[] {
  return [...BUILT_IN_PERSONALITIES, ...loadCustomPersonalityPresets()];
}

export function saveCustomPersonalityPresets(presets: PersonalityPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.filter((item) => !item.builtIn)));
}

export function personalityProfile(preset: PersonalityPreset): PersonalityProfile {
  const { id: _id, builtIn: _builtIn, ...profile } = preset;
  return profile;
}
