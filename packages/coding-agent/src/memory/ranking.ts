export type MemorySource =
  | 'auto_extracted'
  | 'user_explicit'
  | 'project_fact'
  | 'user_preference'
  | 'workspace';

export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
  lastAccessedAt: number;
  scope: 'user' | 'project' | 'session';
  source: MemorySource;
}

export interface RankOptions {
  now: number;
  halfLifeMs: number;
  limit: number;
  query?: string;
  sourceWeights?: Partial<Record<MemorySource, number>>;
}

export interface RankedMemory {
  memory: MemoryItem;
  score: number;
  reason: string;
  factors: {
    importance: number;
    ageMs: number;
    decayScore: number;
    scopeWeight: number;
    sourceWeight: number;
    queryMatchScore: number;
  };
}

const SCOPE_WEIGHT: Record<MemoryItem['scope'], number> = {
  user: 4,
  project: 2,
  session: 1,
};

const SOURCE_WEIGHT: Record<MemorySource, number> = {
  user_explicit: 3,
  user_preference: 2,
  project_fact: 1.5,
  workspace: 1,
  auto_extracted: 0.5,
};

const QUERY_TOKEN_WEIGHT = 0.5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter((token) => token.length > 0);
}

function computeQueryOverlap(content: string, query: string | undefined): number {
  if (!query) return 0;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const contentTokens = new Set(tokenize(content));
  let matched = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) matched += 1;
  }
  return matched * QUERY_TOKEN_WEIGHT;
}

function formatFactor(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(3);
}

export function scoreMemory(memory: MemoryItem, options: RankOptions): RankedMemory {
  const ageMs = Math.max(0, options.now - memory.lastAccessedAt);
  const decayScore = Math.exp(-ageMs / options.halfLifeMs);
  const scopeWeight = SCOPE_WEIGHT[memory.scope];
  const sourceWeight = options.sourceWeights?.[memory.source] ?? SOURCE_WEIGHT[memory.source];
  const queryMatchScore = computeQueryOverlap(memory.content, options.query);
  const score = memory.importance * decayScore * scopeWeight * sourceWeight + queryMatchScore;
  const reasonParts = [
    `importance=${formatFactor(memory.importance)}`,
    `ageMs=${ageMs}`,
    `decayScore=${formatFactor(decayScore)}`,
    `scope=${memory.scope}x${formatFactor(scopeWeight)}`,
    `source=${memory.source}x${formatFactor(sourceWeight)}`,
  ];
  if (queryMatchScore > 0) {
    reasonParts.push(`queryMatchScore=${formatFactor(queryMatchScore)}`);
  }
  return {
    memory,
    score,
    reason: reasonParts.join('; '),
    factors: {
      importance: memory.importance,
      ageMs,
      decayScore,
      scopeWeight,
      sourceWeight,
      queryMatchScore,
    },
  };
}

export function rankMemoriesWithScores(
  memories: ReadonlyArray<MemoryItem>,
  options: RankOptions,
): RankedMemory[] {
  const scored = memories.map((memory) => scoreMemory(memory, options));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.memory.id < b.memory.id ? -1 : a.memory.id > b.memory.id ? 1 : 0;
  });
  return scored.slice(0, options.limit);
}

export function rankMemories(memories: ReadonlyArray<MemoryItem>, options: RankOptions): MemoryItem[] {
  return rankMemoriesWithScores(memories, options).map((entry) => entry.memory);
}
