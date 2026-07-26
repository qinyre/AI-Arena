export interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiFormat: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
}

const STORAGE_KEY = 'ai-arena:model-presets';

export function loadModelPresets(): ModelPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveModelPresets(presets: ModelPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
