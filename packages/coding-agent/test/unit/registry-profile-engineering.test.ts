import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.1.7 + D-31.2.6 + D-31.3.5 + D-32.1.7 + D-32.1.7 + D-32.1.7)', () => {
  it('all profile contains 41 tools', () => {
    const reg = createDefaultRegistry({ profile: 'all' });
    expect(reg.size()).toBe(41);
  });

  it('engineering profile registers github_pr_workflow', () => {
    const reg = createDefaultRegistry({ profile: 'engineering' });
    expect(reg.get('github_pr_workflow')).toBeDefined();
  });

  it('engineering profile registers kanban_orchestrator', () => {
    const reg = createDefaultRegistry({ profile: 'engineering' });
    expect(reg.get('kanban_orchestrator')).toBeDefined();
  });
});
