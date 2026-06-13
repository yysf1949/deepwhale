import { describe, expect, it } from 'vitest';
import { createSemanticIndex } from '../../src/semantic-index.js';

describe('semantic index fallback', () => {
  it('uses deterministic lexical ranking when embeddings are unavailable', async () => {
    const index = createSemanticIndex({ embeddingProvider: null });
    await index.addChunk({ id: 'auth', content: 'jwt middleware validates bearer token', symbolId: 'auth.ts:middleware' });
    await index.addChunk({ id: 'ui', content: 'renders status bar', symbolId: 'status.tsx:StatusBar' });

    const results = await index.search('bearer token auth', { maxResults: 1 });

    expect(results).toEqual([
      expect.objectContaining({
        id: 'auth',
        mode: 'lexical_fallback',
        heuristic: true,
        symbolId: 'auth.ts:middleware',
        matchedTokens: ['bearer', 'token'],
        coverage: 2 / 3,
      }),
    ]);
    expect(results[0]!.reason).toContain('matched bearer, token');
  });

  it('tie-breaks equal semantic scores by ascending id', async () => {
    const index = createSemanticIndex({ embeddingProvider: null });
    await index.addChunk({ id: 'b-symbol', content: 'status bar renders', symbolId: 'b.ts:StatusBar' });
    await index.addChunk({ id: 'a-symbol', content: 'status bar renders', symbolId: 'a.ts:StatusBar' });

    const results = await index.search('status bar', { maxResults: 2 });

    expect(results.map((result) => result.id)).toEqual(['a-symbol', 'b-symbol']);
    expect(results[0]!.matchedTokens).toEqual(['status', 'bar']);
    expect(results[0]!.coverage).toBe(1);
  });
});
