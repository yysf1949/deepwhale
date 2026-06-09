import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry engineering profile (legacy opt-in)', () => {
  it('keeps the all profile at the explicit full surface count', () => {
    const reg = createDefaultRegistry({ profile: 'all' });
    expect(reg.size()).toBe(41);
  });

  it('registers GitHub PR workflow only when engineering is explicitly selected', () => {
    const reg = createDefaultRegistry({ profile: 'engineering' });
    expect(reg.get('github_pr_workflow')).toBeDefined();
  });

  it('registers kanban orchestration only when engineering is explicitly selected', () => {
    const reg = createDefaultRegistry({ profile: 'engineering' });
    expect(reg.get('kanban_orchestrator')).toBeDefined();
  });
});
