import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RankedMemory } from '../../src/memory/ranking.js';
import { MemoryStore } from '../../src/memory/store.js';

describe('MemoryStore (D-33.3.1)', () => {
  it('appends, lists, and archives memories', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'dw-mem-'));
    const store = new MemoryStore({ path: join(tmp, 'memories.json') });
    await store.append({ id: 'a', content: 'first', importance: 0.5, scope: 'session', source: 'auto_extracted' });
    await store.append({ id: 'b', content: 'second', importance: 0.7, scope: 'project', source: 'user_explicit' });
    const all = await store.list();
    expect(all).toHaveLength(2);
    await store.archive('a');
    const active = await store.list({ includeArchived: false });
    expect(active.map((m) => m.id)).toEqual(['b']);
    await rm(tmp, { recursive: true, force: true });
  });

  it('ranks active memories with explainable score evidence', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'dw-mem-'));
    const store = new MemoryStore({ path: join(tmp, 'memories.json') });
    const now = 1_000;

    await store.append({
      id: 'archived',
      content: 'status bar legacy note',
      importance: 0.9,
      lastAccessedAt: now,
      scope: 'user',
      source: 'user_explicit',
    });
    await store.append({
      id: 'preference',
      content: 'prefer compact status bar layout',
      importance: 0.7,
      lastAccessedAt: now,
      scope: 'user',
      source: 'user_preference',
    });
    await store.append({
      id: 'project',
      content: 'project status bar decision',
      importance: 0.7,
      lastAccessedAt: now,
      scope: 'project',
      source: 'project_fact',
    });

    await store.archive('archived');

    const ranked = await store.rank({ now, halfLifeMs: 1_000, limit: 5, query: 'status bar' });

    expect(ranked.map((entry) => entry.memory.id)).toEqual(['preference', 'project']);
    const first: RankedMemory = ranked[0]!;
    expect(first.reason).toContain('query');
    expect(first.factors.queryMatchScore).toBeGreaterThan(0);
    expect(first.factors.sourceWeight).toBeGreaterThan(0);

    await rm(tmp, { recursive: true, force: true });
  });
});
