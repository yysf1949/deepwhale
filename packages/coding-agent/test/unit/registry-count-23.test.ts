import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.1.7 + D-31.2.6 + D-31.3.5 + D-32.1.7 + D-32.1.7 + D-32.1.7)', () => {
  it('contains 33 tools (17 + 6 + 4 research + 4 productivity + 4 code-intel + 1 cross-file)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(41);
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
