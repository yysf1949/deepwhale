import { describe, expect, it } from 'vitest';
import { createPlanner } from '../../src/planner/planner.js';

describe('planner executor boundary', () => {
  it('lets planner create tasks but denies tool calls', async () => {
    const planner = createPlanner();
    const plan = await planner.plan({ goal: 'rename a symbol safely' });

    expect(plan.tasks.length).toBeGreaterThan(0);
    await expect(planner.callTool('read_file', { path: 'README.md' })).rejects.toThrow(/planner cannot call tools/);
  });
});
