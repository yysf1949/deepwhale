/**
 * D-30.2.8: Tool registry æ³¨å…¥ 5 æ–°å·¥å…?+ D-30.3.5 åŠ?delegate_task.
 *           + D-30.4.6 åŠ?vision_analyze + text_to_speech.
 *
 * æ‹æ¿ (D-30.2): createDefaultRegistry è£?patch / search_files / execute_code / todo / plan,
 * è·?9 å·¥å…· 1:1 åŒå½¢æ€?(å…?register, è·ŸçŽ°æœ‰é¡ºåºä¿æŒç¨³å®?.
 * æ‹æ¿ (D-30.3): 14 â†?15, åŠ?delegate_task (subagent å¹¶è¡Œ max 5, medium).
 * æ‹æ¿ (D-30.4): 15 â†?17, åŠ?vision_analyze + text_to_speech (2 new tools).
 */
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry, createRegistryForProfile } from '../../src/tools/registry.js';

describe('tool registry (D-30.2.8 â€?5 new tools, D-30.3.5 â€?1 subagent, D-30.4.6 â€?2 vision+tts)', () => {
  it('includes 5 new tools (patch / search_files / execute_code / todo / plan)', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('patch')).toBeDefined();
    expect(registry.get('search_files')).toBeDefined();
    expect(registry.get('execute_code')).toBeDefined();
    expect(registry.get('todo')).toBeDefined();
    expect(registry.get('plan')).toBeDefined();
  });

  it('includes delegate_task (D-30.3.5)', async () => {
    const registry = await createRegistryForProfile({ profile: 'all' });
    expect(registry.get('delegate_task')).toBeDefined();
  });

  it('includes vision_analyze + text_to_speech (D-30.4.6)', async () => {
    const registry = await createRegistryForProfile({ profile: 'all' });
    expect(registry.get('vision_analyze')).toBeDefined();
    expect(registry.get('text_to_speech')).toBeDefined();
  });

  it('all profile total size = 41 (explicit opt-in)', async () => {
    const registry = await createRegistryForProfile({ profile: 'all' });
    expect(registry.size()).toBe(42);
  });

  it('5 new tools have correct risk levels', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('patch')?.risk).toBe('medium');
    expect(registry.get('search_files')?.risk).toBe('low');
    expect(registry.get('execute_code')?.risk).toBe('medium');
    expect(registry.get('todo')?.risk).toBe('low');
    expect(registry.get('plan')?.risk).toBe('low');
  });

  it('delegate_task has risk=medium', async () => {
    const registry = await createRegistryForProfile({ profile: 'all' });
    expect(registry.get('delegate_task')?.risk).toBe('medium');
  });

  it('vision_analyze + text_to_speech have risk=medium (D-30.4.6)', async () => {
    const registry = await createRegistryForProfile({ profile: 'all' });
    expect(registry.get('vision_analyze')?.risk).toBe('medium');
    expect(registry.get('text_to_speech')?.risk).toBe('medium');
  });
});
