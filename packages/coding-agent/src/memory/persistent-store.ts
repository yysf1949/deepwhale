/**
 * Persistent Memory — v4.0 (D-33.6.3)
 *
 * Distinct from the in-memory `MemoryStore` (Stage 3 / v2.0). The persistent
 * store keeps `user`, `project`, and `session` scopes in separate JSONL files
 * inside a single root directory. Hand-edited memories (`source: 'user_explicit'`)
 * take precedence over automatic extraction. Stale memories can be archived
 * and recovered.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export type MemoryScope = 'user' | 'project' | 'session';
export type MemorySource = 'auto_extracted' | 'user_explicit' | 'project_fact';

export interface PersistentMemoryItem {
  readonly id: string;
  readonly scope: MemoryScope;
  readonly source: MemorySource;
  readonly content: string;
  readonly importance: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived: boolean;
}

export interface PutMemoryInput {
  readonly id: string;
  readonly scope: MemoryScope;
  readonly source: MemorySource;
  readonly content: string;
  readonly importance?: number;
}

export interface PersistentMemoryStoreOptions {
  readonly root: string;
}

export class PersistentMemoryStore {
  private readonly file: string;
  private items: PersistentMemoryItem[] = [];

  constructor(opts: PersistentMemoryStoreOptions) {
    this.file = join(opts.root, 'persistent-memory.jsonl');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.items = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line) as PersistentMemoryItem);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.items = [];
        return;
      }
      throw err;
    }
  }

  async put(input: PutMemoryInput): Promise<void> {
    const now = Date.now();
    const existing = this.items.find((m) => m.id === input.id);
    if (existing) {
      // Hand-edited precedence: user_explicit always wins over auto_extracted.
      if (existing.source === 'user_explicit' && input.source !== 'user_explicit') {
        return; // silently ignore the auto update; hand edit wins
      }
      const updated = { ...existing };
      updated.content = input.content;
      updated.importance = input.importance ?? existing.importance;
      updated.source = input.source;
      updated.updatedAt = now;
      this.items = this.items.map((m) => (m.id === input.id ? updated : m));
    } else {
      const created: PersistentMemoryItem = {
        id: input.id,
        scope: input.scope,
        source: input.source,
        content: input.content,
        importance: input.importance,
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      this.items = [...this.items, created];
    }
    await this.flush();
  }

  async archive(id: string): Promise<void> {
    const found = this.items.find((m) => m.id === id);
    if (!found) return;
    this.items = this.items.map((m) =>
      m.id === id ? { ...m, archived: true, updatedAt: Date.now() } : m,
    );
    await this.flush();
  }

  async restore(id: string): Promise<void> {
    const found = this.items.find((m) => m.id === id);
    if (!found) return;
    this.items = this.items.map((m) =>
      m.id === id ? { ...m, archived: false, updatedAt: Date.now() } : m,
    );
    await this.flush();
  }

  async list(filter?: { scope?: MemoryScope; includeArchived?: boolean }): Promise<ReadonlyArray<PersistentMemoryItem>> {
    let out = this.items;
    if (filter?.scope) out = out.filter((m) => m.scope === filter.scope);
    if (!filter?.includeArchived) out = out.filter((m) => !m.archived);
    return out;
  }

  private async flush(): Promise<void> {
    await fs.mkdir(join(this.file, '..'), { recursive: true });
    const lines = this.items.map((m) => JSON.stringify(m));
    await fs.writeFile(this.file, lines.join('\n') + (lines.length ? '\n' : ''));
  }
}

export async function createPersistentMemoryStore(opts: PersistentMemoryStoreOptions): Promise<PersistentMemoryStore> {
  const store = new PersistentMemoryStore(opts);
  await store.load();
  return store;
}
