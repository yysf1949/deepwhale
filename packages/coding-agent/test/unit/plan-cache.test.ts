import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanCache } from '../../src/planner/plan-cache.js';

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'plan-cache-test-'));
  return dir;
}

describe('plan cache', () => {
  it('uses stable keys and invalidates when the goal changes', async () => {
    const root = await createTempDir();
    try {
      const cache = createPlanCache({ root });
      const firstKey = cache.keyFor({ goal: 'fix bug', repoHash: 'abc' });
      const secondKey = cache.keyFor({ goal: 'fix bug', repoHash: 'abc' });
      const changedKey = cache.keyFor({ goal: 'add feature', repoHash: 'abc' });

      expect(firstKey).toBe(secondKey);
      expect(firstKey).not.toBe(changedKey);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
