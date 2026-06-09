import { describe, expect, it } from 'vitest';
import { createSemanticIndex } from '../../src/semantic-index.js';

describe('semantic index fallback', () => {
  it('uses deterministic lexical ranking when embeddings are unavailable', async () => {
    const index = createSemanticIndex({ embeddingProvider: null });
    await index.addChunk({ id: 'auth', content: 'jwt middleware validates bearer token', symbolId: 'auth.ts:middleware' });
    await index.addChunk({ id: 'ui', content: 'renders status bar', symbolId: 'status.tsx:StatusBar' });

    const results = await index.search('bearer token auth', { maxResults: 1 });

    expect(results).toEqual([
      expect.objectContaining({ id: 'auth', mode: 'lexical_fallback', heuristic: true }),
    ]);
  });
});
