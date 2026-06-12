export interface SemanticIndexChunk {
  id: string;
  content: string;
  symbolId?: string;
}

export interface SemanticSearchOptions {
  maxResults?: number;
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  mode: 'lexical_fallback';
  heuristic: true;
  score: number;
  symbolId?: string;
  matchedTokens?: string[];
  coverage?: number;
  reason?: string;
}

export interface SemanticIndex {
  addChunk(chunk: SemanticIndexChunk): Promise<void>;
  search(query: string, opts?: SemanticSearchOptions): Promise<SemanticSearchResult[]>;
}

export interface CreateSemanticIndexOptions {
  embeddingProvider: unknown | null;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

export function createSemanticIndex(_opts: CreateSemanticIndexOptions): SemanticIndex {
  const chunks = new Map<string, SemanticIndexChunk>();

  return {
    async addChunk(chunk) {
      chunks.set(chunk.id, chunk);
    },
    async search(query, searchOpts) {
      const queryTokens = tokenize(query);
      const max = searchOpts?.maxResults ?? 5;
      const scored: Array<{ chunk: SemanticIndexChunk; score: number; matchedTokens: string[] }> = [];

      for (const chunk of chunks.values()) {
        const contentTokens = new Set(tokenize(chunk.content));
        const matchedTokens: string[] = [];
        const seen = new Set<string>();
        for (const token of queryTokens) {
          if (seen.has(token)) continue;
          if (contentTokens.has(token)) {
            matchedTokens.push(token);
            seen.add(token);
          }
        }
        if (matchedTokens.length > 0) {
          scored.push({ chunk, score: matchedTokens.length, matchedTokens });
        }
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.chunk.id < b.chunk.id) return -1;
        if (a.chunk.id > b.chunk.id) return 1;
        return 0;
      });

      const coverageDenominator = queryTokens.length > 0 ? queryTokens.length : 1;

      return scored.slice(0, max).map((s) => {
        const result: SemanticSearchResult = {
          id: s.chunk.id,
          content: s.chunk.content,
          mode: 'lexical_fallback',
          heuristic: true,
          score: s.score,
          matchedTokens: s.matchedTokens,
          coverage: s.matchedTokens.length / coverageDenominator,
          reason: `matched ${s.matchedTokens.join(', ')}`,
        };
        if (s.chunk.symbolId !== undefined) {
          result.symbolId = s.chunk.symbolId;
        }
        return result;
      });
    },
  };
}
