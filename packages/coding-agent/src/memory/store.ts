import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { rankMemoriesWithScores, type MemoryItem, type RankOptions, type RankedMemory } from './ranking.js';

export interface MemoryStoreOptions {
  path: string;
}

type StoredMemory = MemoryItem & { archived: boolean };

export class MemoryStore {
  private readonly path: string;
  constructor(opts: MemoryStoreOptions) {
    this.path = opts.path;
  }

  async append(memory: MemoryItem): Promise<void> {
    const all = await this.loadAll();
    all.push({ ...memory, archived: false });
    await this.writeAll(all);
  }

  async archive(id: string): Promise<void> {
    const all = await this.loadAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const target = all[idx];
    if (!target) return;
    target.archived = true;
    await this.writeAll(all);
  }

  async list(filter?: { includeArchived?: boolean }): Promise<MemoryItem[]> {
    const all = await this.loadAll();
    if (filter?.includeArchived) return all;
    return all.filter((m) => !m.archived);
  }

  async rank(options: RankOptions): Promise<RankedMemory[]> {
    const active = await this.list({ includeArchived: false });
    return rankMemoriesWithScores(active, options);
  }

  private async loadAll(): Promise<StoredMemory[]> {
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  private async writeAll(items: StoredMemory[]): Promise<void> {
    await fs.mkdir(join(this.path, '..'), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(items, null, 2));
  }
}
