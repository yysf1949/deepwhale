import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersistentMemoryStore } from '../../src/memory/persistent-store.js';

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), 'mem-crash-'));
}

describe('persistent memory crash/reload evidence (D-78)', () => {
  it('survives a simulated partial-last-line via the load path', async () => {
    const root = freshRoot();
    try {
      const store = await createPersistentMemoryStore({ root });
      await store.put({ id: 'a', scope: 'project', source: 'user_explicit', content: 'first' });
      await store.put({ id: 'b', scope: 'project', source: 'user_explicit', content: 'second' });
      await store.put({ id: 'c', scope: 'project', source: 'user_explicit', content: 'third' });

      // Simulate a partial last line (the previous flush was interrupted mid-write).
      const file = join(root, 'persistent-memory.jsonl');
      const original = readFileSync(file, 'utf8');
      writeFileSync(file, original + '{"id":"d","scope":"proj');

      // A new store instance on the same root must load the 3 committed items
      // and skip the corrupt last line (not throw).
      const store2 = await createPersistentMemoryStore({ root });
      const items = await store2.list();
      expect(items.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses atomic write semantics: every on-disk line is parseable JSON', async () => {
    const root = freshRoot();
    try {
      // First store: writes the initial state via a successful flush.
      const store1 = await createPersistentMemoryStore({ root });
      await store1.put({ id: 'seed', scope: 'user', source: 'user_explicit', content: 'v0' });
      const file = join(root, 'persistent-memory.jsonl');
      const beforeContent = readFileSync(file, 'utf8');

      // Second store: writes a second item. Atomic write must keep the
      // destination either the previous contents OR the new contents;
      // never a partial mix.
      const store2 = await createPersistentMemoryStore({ root });
      await store2.put({ id: 'add1', scope: 'user', source: 'user_explicit', content: 'v1' });
      const afterContent = readFileSync(file, 'utf8');
      expect(afterContent).not.toBe(beforeContent);

      // The on-disk file must be a valid JSONL of complete lines (no partial trailing).
      const lines = afterContent.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
