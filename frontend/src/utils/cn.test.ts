import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('合并普通类名', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('忽略 falsy 条件类名', () => {
    expect(cn('base', false && 'hidden', null, undefined, 'visible')).toBe('base visible');
  });

  it('tailwind-merge 解决冲突类名', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', 'text-lg', 'font-bold')).toBe('text-lg font-bold');
  });
});
