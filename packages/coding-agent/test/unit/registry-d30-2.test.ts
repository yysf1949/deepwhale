/**
 * D-30 registry expansion coverage: coding tools stay in the default surface,
 * while delegate_task, vision_analyze, and text_to_speech remain explicit
 * opt-in through the all profile.
 */
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry, createRegistryForProfile } from '../../src/tools/registry.js';

describe('tool registry D-30 expansion coverage', () => {
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

  it('all profile total size = 43 (explicit opt-in)', async () => {
    const registry = await createRegistryForProfile({ profile: 'all' });
    expect(registry.size()).toBe(43);
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
