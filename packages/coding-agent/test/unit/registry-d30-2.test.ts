/**
 * D-30.2.8: Tool registry 注入 5 新工具.
 *
 * 拍板 (D-30.2): createDefaultRegistry 装 patch / search_files / execute_code / todo / plan,
 * 跟 9 工具 1:1 同形态 (先 register, 跟现有顺序保持稳定).
 */
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('tool registry (D-30.2.8 — 5 new tools)', () => {
  it('includes 5 new tools (patch / search_files / execute_code / todo / plan)', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('patch')).toBeDefined();
    expect(registry.get('search_files')).toBeDefined();
    expect(registry.get('execute_code')).toBeDefined();
    expect(registry.get('todo')).toBeDefined();
    expect(registry.get('plan')).toBeDefined();
  });

  it('registry total size = 9 + 5 = 14', () => {
    const registry = createDefaultRegistry();
    expect(registry.size()).toBe(14);
  });

  it('5 new tools have correct risk levels', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('patch')?.risk).toBe('medium');
    expect(registry.get('search_files')?.risk).toBe('low');
    expect(registry.get('execute_code')?.risk).toBe('medium');
    expect(registry.get('todo')?.risk).toBe('low');
    expect(registry.get('plan')?.risk).toBe('low');
  });
});
