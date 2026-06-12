import { describe, expect, it } from 'vitest';
import { createRegistryForProfile } from '../../src/tools/registry.js';

describe('registry engineering profile (legacy opt-in)', () => {
  it('keeps the all profile at the explicit full surface count', async () => {
    const reg = await createRegistryForProfile({ profile: 'all' });
    expect(reg.size()).toBe(43);
  });

  it('registers GitHub PR workflow only when engineering is explicitly selected', async () => {
    const reg = await createRegistryForProfile({ profile: 'engineering' });
    expect(reg.get('github_pr_workflow')).toBeDefined();
  });

  it('registers kanban orchestration only when engineering is explicitly selected', async () => {
    const reg = await createRegistryForProfile({ profile: 'engineering' });
    expect(reg.get('kanban_orchestrator')).toBeDefined();
  });
});
