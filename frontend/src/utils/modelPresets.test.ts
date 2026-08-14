import { describe, it, expect } from 'vitest';
import { requiresApiKey } from './modelPresets';

describe('requiresApiKey', () => {
  it('非 anthropic 格式不需要 API key', () => {
    expect(requiresApiKey('openai', 'https://api.openai.com')).toBe(false);
    expect(requiresApiKey(undefined, undefined)).toBe(false);
  });

  it('anthropic 远程端点需要 API key', () => {
    expect(requiresApiKey('anthropic', 'https://api.anthropic.com')).toBe(true);
  });

  it('anthropic 本地代理(loopback)不需要 API key', () => {
    expect(requiresApiKey('anthropic', 'http://localhost:8080')).toBe(false);
    expect(requiresApiKey('anthropic', 'http://127.0.0.1:8080')).toBe(false);
    expect(requiresApiKey('anthropic', 'http://[::1]:8080')).toBe(false);
  });

  it('无效 base URL 视为需要 API key', () => {
    expect(requiresApiKey('anthropic', 'not-a-url')).toBe(true);
  });
});
