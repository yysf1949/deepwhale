import { describe, expect, it } from 'vitest';
import { evaluateGate2Transcript } from '../../src/long-horizon/gate2.js';
import { makeGate2Transcript } from './_helpers/gate2-helpers.js';

describe('gate2 long horizon', () => {
  it('accepts 30 to 50 coherent tool calls and records retry recovery', () => {
    const result = evaluateGate2Transcript(makeGate2Transcript({ toolCalls: 35, retries: 1, goalDrift: false }));

    expect(result).toMatchObject({
      passed: true,
      toolCalls: 35,
      retries: 1,
      goalDriftDetected: false,
    });
  });

  it('fails when the transcript drifts from the original goal', () => {
    const result = evaluateGate2Transcript(makeGate2Transcript({ toolCalls: 35, retries: 0, goalDrift: true }));

    expect(result).toMatchObject({ passed: false, reason: 'goal-drift' });
  });

  it('fails when tool calls are below the long-horizon minimum', () => {
    const result = evaluateGate2Transcript(makeGate2Transcript({ toolCalls: 10, retries: 0, goalDrift: false }));
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('tool-calls-out-of-range');
  });

  it('fails when tool calls exceed the long-horizon maximum', () => {
    const result = evaluateGate2Transcript(makeGate2Transcript({ toolCalls: 60, retries: 0, goalDrift: false }));
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('tool-calls-out-of-range');
  });
});
