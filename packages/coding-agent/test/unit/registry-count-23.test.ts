import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.1.7)', () => {
  it('contains 23 tools (17 + 6 engineering automation)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(23);
  });

  it('registers github_pr_workflow', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('github_pr_workflow')).toBeDefined();
  });

  it('registers kanban_orchestrator', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('kanban_orchestrator')).toBeDefined();
  });
});
