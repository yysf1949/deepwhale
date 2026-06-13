import { describe, expect, it } from 'vitest';
import {
  rankMemories,
  rankMemoriesWithScores,
  type MemoryItem,
  type RankedMemory,
} from '../../src/memory/ranking.js';

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

  it('keeps its plain MemoryItem[] return type for backward compatibility', () => {
    const ranked = rankMemories(
      [
        { id: 'a', content: 'A', importance: 0.5, lastAccessedAt: 100, scope: 'session', source: 'auto_extracted' },
        { id: 'b', content: 'B', importance: 0.5, lastAccessedAt: 100, scope: 'session', source: 'user_preference' },
      ],
      { now: 100, halfLifeMs: 100, limit: 2 },
    );
    expect(Array.isArray(ranked)).toBe(true);
    expect(ranked).toHaveLength(2);
    for (const entry of ranked) {
      const sample: MemoryItem = entry;
      expect(typeof sample.id).toBe('string');
      expect(typeof sample.content).toBe('string');
    }
    expect(ranked.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('rankMemoriesWithScores', () => {
  it('returns score factors for every memory', () => {
    const scored = rankMemoriesWithScores(
      [
        { id: 'a', content: 'alpha', importance: 0.5, lastAccessedAt: 100, scope: 'project', source: 'project_fact' },
        { id: 'b', content: 'beta', importance: 0.7, lastAccessedAt: 100, scope: 'user', source: 'user_explicit' },
      ],
      { now: 100, halfLifeMs: 100, limit: 2 },
    );
    expect(scored).toHaveLength(2);
    const first: RankedMemory = scored[0]!;
    expect(first.memory.id).toBe('b');
    expect(typeof first.score).toBe('number');
    expect(first.score).toBeGreaterThan(0);
    expect(first.reason).toContain('importance');
    expect(first.factors).toEqual(
      expect.objectContaining({
        importance: expect.any(Number),
        ageMs: expect.any(Number),
        decayScore: expect.any(Number),
        scopeWeight: expect.any(Number),
        sourceWeight: expect.any(Number),
        queryMatchScore: expect.any(Number),
      }),
    );
    expect(first.factors.ageMs).toBe(0);
    expect(first.factors.decayScore).toBeCloseTo(1, 5);
    expect(first.factors.sourceWeight).toBeGreaterThan(0);
  });

  it('ranks user_preference above weaker sources when other factors are equal', () => {
    const now = 100;
    const halfLifeMs = 100;
    const memories: MemoryItem[] = [
      { id: 'auto', content: 'same', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
      { id: 'workspace', content: 'same', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'workspace' },
      { id: 'preference', content: 'same', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'user_preference' },
    ];
    const ranked = rankMemoriesWithScores(memories, { now, halfLifeMs, limit: 3 });
    expect(ranked.map((r) => r.memory.id)).toEqual(['preference', 'workspace', 'auto']);
  });

  it('ranks query-overlapping memories above weaker non-overlapping alternatives', () => {
    const now = 100;
    const halfLifeMs = 100;
    const memories: MemoryItem[] = [
      { id: 'unrelated', content: 'unrelated body', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
      { id: 'match', content: 'status bar component', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
    ];
    const ranked = rankMemoriesWithScores(memories, {
      now,
      halfLifeMs,
      limit: 2,
      query: 'status bar',
    });
    expect(ranked.map((r) => r.memory.id)).toEqual(['match', 'unrelated']);
    const match = ranked[0]!;
    expect(match.factors.queryMatchScore).toBeGreaterThan(0);
    expect(match.reason).toContain('query');
    expect(ranked[1]!.factors.queryMatchScore).toBe(0);
  });

  it('allows source weight overrides for scenario-specific ranking', () => {
    const now = 100;
    const halfLifeMs = 100;
    const memories: MemoryItem[] = [
      { id: 'auto', content: 'same', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
      { id: 'explicit', content: 'same', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'user_explicit' },
    ];
    const ranked = rankMemoriesWithScores(memories, {
      now,
      halfLifeMs,
      limit: 2,
      sourceWeights: { auto_extracted: 10 },
    });
    expect(ranked.map((r) => r.memory.id)).toEqual(['auto', 'explicit']);
    expect(ranked[0]!.factors.sourceWeight).toBe(10);
  });

  it('tie-breaks equal scores deterministically by ascending id', () => {
    const now = 100;
    const halfLifeMs = 100;
    const memories: MemoryItem[] = [
      { id: 'c', content: 'tie', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
      { id: 'a', content: 'tie', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
      { id: 'b', content: 'tie', importance: 0.5, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
    ];
    const ranked = rankMemoriesWithScores(memories, { now, halfLifeMs, limit: 3 });
    expect(ranked.map((r) => r.memory.id)).toEqual(['a', 'b', 'c']);
    expect(ranked[0]!.score).toBe(ranked[1]!.score);
    expect(ranked[1]!.score).toBe(ranked[2]!.score);
  });

  it('respects the limit by returning the top-N entries', () => {
    const now = 100;
    const halfLifeMs = 100;
    const memories: MemoryItem[] = [
      { id: 'high', content: 'h', importance: 0.9, lastAccessedAt: now, scope: 'user', source: 'user_explicit' },
      { id: 'mid', content: 'm', importance: 0.5, lastAccessedAt: now, scope: 'project', source: 'project_fact' },
      { id: 'low', content: 'l', importance: 0.1, lastAccessedAt: now, scope: 'session', source: 'auto_extracted' },
    ];
    const ranked = rankMemoriesWithScores(memories, { now, halfLifeMs, limit: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.memory.id).toBe('high');
  });
});
