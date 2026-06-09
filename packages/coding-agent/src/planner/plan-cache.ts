/**
 * Plan Cache (D-33.4.3) — append-only JSONL plan cache for cross-session plan reuse.
 *
 * Contract (master plan §A.13):
 *   - Stable keys derived from { goal, repoHash } via SHA-256 (truncated to 16 hex chars)
 *   - Records stored as JSONL append-only (matches the session JSONL discipline)
 *   - Cache invalidates on goal change (different key = cache miss)
 *   - Supports cross-session read
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface PlanCacheKeyInput {
  goal: string;
  repoHash: string;
}

export interface PlanCacheRecord {
  key: string;
  goal: string;
  repoHash: string;
  createdAt: number;
  plan: {
    tasks: ReadonlyArray<{ id: string; goal: string; dependsOn: ReadonlyArray<string> }>;
  };
}

export interface PlanCache {
  keyFor(input: PlanCacheKeyInput): string;
  get(key: string): Promise<PlanCacheRecord | undefined>;
  put(record: PlanCacheRecord): Promise<void>;
}

export function createPlanCache(opts: { root: string }): PlanCache {
  const file = join(opts.root, 'plan-cache.jsonl');

  async function loadAll(): Promise<PlanCacheRecord[]> {
    try {
      const raw = await fs.readFile(file, 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as PlanCacheRecord);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  return {
    keyFor(input) {
      const h = createHash('sha256');
      h.update(JSON.stringify({ goal: input.goal, repoHash: input.repoHash }));
      return h.digest('hex').slice(0, 16);
    },
    async get(key) {
      const all = await loadAll();
      return all.find((r) => r.key === key);
    },
    async put(record) {
      const all = await loadAll();
      all.push(record);
      await fs.mkdir(opts.root, { recursive: true });
      await fs.writeFile(file, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
    },
  };
}
