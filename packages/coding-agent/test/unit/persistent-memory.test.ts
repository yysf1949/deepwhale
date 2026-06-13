import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createPersistentMemoryStore } from '../../src/memory/persistent-store.js';

async function createTempDir(prefix = 'dw-persistent-mem-'): Promise<string> {
  return mkdtemp(resolve(tmpdir(), prefix));
}

describe('persistent memory', () => {
  it('keeps user project and session scopes separate', async () => {
    const root = await createTempDir();
    const store = await createPersistentMemoryStore({ root });
    await store.put({ id: 'u', scope: 'user', source: 'user_explicit', content: 'prefers Chinese' });
    await store.put({ id: 'p', scope: 'project', source: 'project_fact', content: 'uses pnpm' });
    await store.put({ id: 's', scope: 'session', source: 'auto_extracted', content: 'temporary' });

    expect((await store.list({ scope: 'project' })).map((m) => m.id)).toEqual(['p']);
  });

  it('keeps hand edits over automatic extraction and archives stale memories', async () => {
    const root = await createTempDir();
    const store = await createPersistentMemoryStore({ root });
    await store.put({ id: 'decision', scope: 'project', source: 'auto_extracted', content: 'old' });
    await store.put({ id: 'decision', scope: 'project', source: 'user_explicit', content: 'hand edited' });
    await store.archive('decision');

    const active = await store.list({ includeArchived: false });
    expect(active.find((m) => m.id === 'decision')).toBeUndefined();
    const all = await store.list({ includeArchived: true });
    const archived = all.find((m) => m.id === 'decision');
    expect(archived?.content).toBe('hand edited');
    expect(archived?.source).toBe('user_explicit');
    expect(archived?.archived).toBe(true);
  });

  it('preserves hand-edited content when an automatic update arrives after', async () => {
    const root = await createTempDir();
    const store = await createPersistentMemoryStore({ root });
    await store.put({ id: 'k', scope: 'user', source: 'user_explicit', content: 'handwritten' });
    await store.put({ id: 'k', scope: 'user', source: 'auto_extracted', content: 'auto overwrites?' });
    const all = await store.list();
    expect(all.find((m) => m.id === 'k')?.content).toBe('handwritten');
  });
});
