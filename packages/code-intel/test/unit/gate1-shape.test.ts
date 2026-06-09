import { describe, expect, it } from 'vitest';
import { toPlanShape } from '../../src/gate1-shape.js';
import type { Gate1Result } from '../../src/gate1.js';

describe('gate-1 evidence shape adapter (D-33.2.5)', () => {
  it('maps runGate1 output to the master-plan expected field names', () => {
    // Build a minimal Gate1Result fixture
    const result: Gate1Result = {
      passed: true,
      failureReasons: [],
      repoPath: '/tmp/repo',
      metrics: {
        loc: 50000,
        supportedFiles: 100,
        filesIndexed: 100,
        symbolsIndexed: 1000,
        referencesIndexed: 5000,
        callEdges: 200,
        elapsedMs: 1000,
        graphBuildMs: 500,
        callGraphMs: 100,
        minLoc: 50000,
        preferredLoc: 100000,
        timeboxMs: 1200000,
      },
      evidence: {
        entry: { file: 'src/main.ts', symbol: 'main', line: 1, col: 1, kind: 'declaration' },
        callChain: [
          { caller: 'src/main.ts:main', callee: 'src/util.ts:helper', line: 2, file: 'src/main.ts' },
        ],
        modificationPoint: { file: 'src/util.ts', symbol: 'helper', line: 10, col: 1, kind: 'declaration' },
      },
    };

    const shaped = toPlanShape(result);

    expect(shaped).toMatchObject({
      repoRoot: '/tmp/repo',
      loc: 50000,
      supportedFiles: 100,
      symbols: 1000,
      references: 5000,
      callEdges: 200,
      elapsedMs: 1000,
      entry: { symbol: 'main' },
      callChain: [{ caller: 'src/main.ts:main', callee: 'src/util.ts:helper' }],
      modificationPoint: { symbol: 'helper' },
      passed: true,
    });
  });

  it('throws when entry or modificationPoint is missing (plan shape requires them)', () => {
    const result: Gate1Result = {
      passed: false,
      failureReasons: ['entry-not-found'],
      repoPath: '/tmp/repo',
      metrics: {
        loc: 100,
        supportedFiles: 1,
        filesIndexed: 1,
        symbolsIndexed: 0,
        referencesIndexed: 0,
        callEdges: 0,
        elapsedMs: 10,
        graphBuildMs: 5,
        callGraphMs: 1,
        minLoc: 50_000,
        preferredLoc: 100_000,
        timeboxMs: 1_200_000,
      },
      evidence: {
        callChain: [],
      },
    };

    expect(() => toPlanShape(result)).toThrow(/gate1-shape:.*entry/);
  });
});
