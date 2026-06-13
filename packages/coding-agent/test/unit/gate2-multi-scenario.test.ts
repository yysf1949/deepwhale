import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateGate2Transcript, type Gate2Transcript } from '../../src/long-horizon/gate2.js';

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/gate2');

function loadPassingFixtures(): Array<{ name: string; transcript: Gate2Transcript }> {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
  return files
    .map((file) => ({
      name: file.replace('.json', ''),
      transcript: JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), 'utf8')) as Gate2Transcript,
    }))
    .filter((f) => f.transcript.steps.length >= 30);
}

describe('gate2 multi-scenario transcript evaluation', () => {
  const fixtures = loadPassingFixtures();

  it('loads multiple passing gate2 fixtures (>= 30 steps)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
  });

  for (const fixture of fixtures) {
    it(`fixture "${fixture.name}" passes Gate-2 evaluation`, () => {
      const result = evaluateGate2Transcript(fixture.transcript);

      expect(result.passed).toBe(true);
      expect(result.toolCalls).toBeGreaterThanOrEqual(30);
      expect(result.toolCalls).toBeLessThanOrEqual(50);
      expect(result.goalDriftDetected).toBe(false);
      expect(result.retries).toBeLessThanOrEqual(5);
    });
  }

  it('reports a summary of all evaluated scenarios', () => {
    const results = fixtures.map((fixture) => ({
      name: fixture.name,
      result: evaluateGate2Transcript(fixture.transcript),
    }));

    const totalScenarios = results.length;
    const passCount = results.filter((r) => r.result.passed).length;

    expect(passCount).toBe(totalScenarios);

    for (const r of results) {
      expect(r.result.toolCalls).toBeGreaterThanOrEqual(30);
      expect(r.result.toolCalls).toBeLessThanOrEqual(50);
      expect(r.result.retries).toBeLessThanOrEqual(5);
    }
  });
});
