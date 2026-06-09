/**
 * Shared test helper — minimal subset of the master plan A.0 helpers.
 * Uses node:os.tmpdir() so it works on Windows.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export async function createTempDir(prefix = 'dw-gate-') {
  return mkdtemp(resolve(tmpdir(), prefix));
}

export function makeGate2Transcript(input) {
  return {
    goal: 'fix failing registry profile test',
    steps: Array.from({ length: input.toolCalls }, (_, index) => ({
      index: index + 1,
      tool: 'shell',
      summary: input.goalDrift && index === Math.floor(input.toolCalls / 2)
        ? 'started unrelated browser feature'
        : 'continued registry profile fix',
      retry: index < input.retries,
    })),
  };
}
