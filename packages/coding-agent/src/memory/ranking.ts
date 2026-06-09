export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
  lastAccessedAt: number;
  scope: 'user' | 'project' | 'session';
  source: 'auto_extracted' | 'user_explicit' | 'project_fact';
}

export interface RankOptions {
  now: number;
  halfLifeMs: number;
  limit: number;
}

const SCOPE_WEIGHT: Record<MemoryItem['scope'], number> = {
  user: 4,
  project: 2,
  session: 1,
};

export function rankMemories(memories: ReadonlyArray<MemoryItem>, options: RankOptions): MemoryItem[] {
  const scored = memories.map((m) => {
    const ageMs = options.now - m.lastAccessedAt;
    const decay = Math.exp(-ageMs / options.halfLifeMs);
    const score = m.importance * decay * SCOPE_WEIGHT[m.scope];
    return { memory: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, options.limit).map((s) => s.memory);
}
