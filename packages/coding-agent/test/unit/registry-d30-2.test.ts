/**
 * D-30.2.8: Tool registry 注入 5 新工具 + D-30.3.5 加 delegate_task.
 *           + D-30.4.6 加 vision_analyze + text_to_speech.
 *
 * 拍板 (D-30.2): createDefaultRegistry 装 patch / search_files / execute_code / todo / plan,
 * 跟 9 工具 1:1 同形态 (先 register, 跟现有顺序保持稳定).
 * 拍板 (D-30.3): 14 → 15, 加 delegate_task (subagent 并行 max 5, medium).
 * 拍板 (D-30.4): 15 → 17, 加 vision_analyze + text_to_speech (2 new tools).
 */
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('tool registry (D-30.2.8 — 5 new tools, D-30.3.5 — 1 subagent, D-30.4.6 — 2 vision+tts)', () => {
  it('includes 5 new tools (patch / search_files / execute_code / todo / plan)', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('patch')).toBeDefined();
    expect(registry.get('search_files')).toBeDefined();
    expect(registry.get('execute_code')).toBeDefined();
    expect(registry.get('todo')).toBeDefined();
    expect(registry.get('plan')).toBeDefined();
  });

  it('includes delegate_task (D-30.3.5)', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('delegate_task')).toBeDefined();
  });

  it('includes vision_analyze + text_to_speech (D-30.4.6)', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('vision_analyze')).toBeDefined();
    expect(registry.get('text_to_speech')).toBeDefined();
  });

  it('registry total size = 15 + 2 = 17', () => {
    const registry = createDefaultRegistry();
    expect(registry.size()).toBe(17);
  });

  it('5 new tools have correct risk levels', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('patch')?.risk).toBe('medium');
    expect(registry.get('search_files')?.risk).toBe('low');
    expect(registry.get('execute_code')?.risk).toBe('medium');
    expect(registry.get('todo')?.risk).toBe('low');
    expect(registry.get('plan')?.risk).toBe('low');
  });

  it('delegate_task has risk=medium', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('delegate_task')?.risk).toBe('medium');
  });

  it('vision_analyze + text_to_speech have risk=medium (D-30.4.6)', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('vision_analyze')?.risk).toBe('medium');
    expect(registry.get('text_to_speech')?.risk).toBe('medium');
  });
});
