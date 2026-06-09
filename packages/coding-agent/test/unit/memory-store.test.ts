import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
});
