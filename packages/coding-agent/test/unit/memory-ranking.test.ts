import { describe, expect, it } from 'vitest';
import { rankMemories } from '../../src/memory/ranking.js';

describe('rankMemories', () => {
  it('orders by importance, recency decay, and scope weight', () => {
    const ranked = rankMemories(
      [
        { id: 'session-low', content: 'temp', importance: 0.2, lastAccessedAt: 100, scope: 'session', source: 'auto_extracted' },
        { id: 'project-high', content: 'decision', importance: 0.9, lastAccessedAt: 80, scope: 'project', source: 'user_explicit' },
      ],
      { now: 100, halfLifeMs: 100, limit: 2 },
    );

    expect(ranked.map((memory) => memory.id)).toEqual(['project-high', 'session-low']);
  });
});
