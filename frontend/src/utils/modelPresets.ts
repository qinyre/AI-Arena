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

export function requiresApiKey(
  apiFormat: ModelPreset['apiFormat'] | undefined,
  baseUrl: string | undefined,
) {
  if (apiFormat !== 'anthropic') return false;
  try {
    // IPv6 地址的 hostname 带方括号（如 "[::1]"），先剥掉再比较 loopback。
    const hostname = new URL(baseUrl || '').hostname.replace(/^\[|\]$/g, '');
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

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
