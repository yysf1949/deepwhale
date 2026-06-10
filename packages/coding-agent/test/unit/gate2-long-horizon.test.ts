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

  it('accepts the exact boundary values 30 and 50 (D-85 v3.0 inclusive range)', () => {
    // The Gate-2 spec is "30 to 50 tool calls". Boundaries are inclusive.
    // This test guards against off-by-one regressions at the spec edges.
    const atLower = evaluateGate2Transcript(
      makeGate2Transcript({ toolCalls: 30, retries: 0, goalDrift: false }),
    );
    const atUpper = evaluateGate2Transcript(
      makeGate2Transcript({ toolCalls: 50, retries: 0, goalDrift: false }),
    );

    expect(atLower.passed).toBe(true);
    expect(atLower.toolCalls).toBe(30);
    expect(atUpper.passed).toBe(true);
    expect(atUpper.toolCalls).toBe(50);
  });

  it('rejects the values just outside the boundary (29 and 51) (D-85 v3.0 exclusive off-by-one)', () => {
    // 29 is one below the lower bound; 51 is one above the upper bound.
    // Both must fail with reason='tool-calls-out-of-range'.
    const justBelow = evaluateGate2Transcript(
      makeGate2Transcript({ toolCalls: 29, retries: 0, goalDrift: false }),
    );
    const justAbove = evaluateGate2Transcript(
      makeGate2Transcript({ toolCalls: 51, retries: 0, goalDrift: false }),
    );

    expect(justBelow.passed).toBe(false);
    expect(justBelow.reason).toBe('tool-calls-out-of-range');
    expect(justAbove.passed).toBe(false);
    expect(justAbove.reason).toBe('tool-calls-out-of-range');
  });
});
