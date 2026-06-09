export interface SemanticIndexChunk {
  id: string;
  content: string;
  symbolId?: string;
}

export interface SemanticSearchOptions {
  maxResults?: number;
}

export interface SemanticIndex {
  addChunk(chunk: SemanticIndexChunk): Promise<void>;
  search(query: string, opts?: SemanticSearchOptions): Promise<Array<{ id: string; content: string; mode: string; heuristic: boolean; score: number }>>;
}

export interface CreateSemanticIndexOptions {
  embeddingProvider: unknown | null;
}

export function createSemanticIndex(_opts: CreateSemanticIndexOptions): SemanticIndex {
  const chunks = new Map<string, SemanticIndexChunk>();

  return {
    async addChunk(chunk) {
      chunks.set(chunk.id, chunk);
    },
    async search(query, searchOpts) {
      const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
      const max = searchOpts?.maxResults ?? 5;
      const scored: Array<{ chunk: SemanticIndexChunk; score: number }> = [];
      for (const chunk of chunks.values()) {
        const lower = chunk.content.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (lower.includes(t)) score += 1;
        }
        if (score > 0) scored.push({ chunk, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, max).map((s) => ({
        id: s.chunk.id,
        content: s.chunk.content,
        mode: 'lexical_fallback',
        heuristic: true,
        score: s.score,
      }));
    },
  };
}
