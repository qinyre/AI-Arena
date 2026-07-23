import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * className 合并工具：clsx 处理条件，tailwind-merge 解决冲突类名。
 * 例：cn('px-2', isActive && 'px-4') → 'px-4'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
