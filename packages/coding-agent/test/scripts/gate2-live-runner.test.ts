import { describe, expect, it } from 'vitest';
import { buildMockGate2Transcript, evaluateGate2Result } from '../../scripts/gate2-live-runner-helpers.mjs';

describe('gate2-live-runner (D-34)', () => {
  it('builds a 35-step coherent transcript that passes Gate-2', () => {
    const tr = buildMockGate2Transcript({ toolCalls: 35, retries: 1, goalDrift: false });
    const result = evaluateGate2Result(tr);
    expect(result.passed).toBe(true);
    expect(result.toolCalls).toBe(35);
    expect(result.retries).toBe(1);
    expect(result.goalDriftDetected).toBe(false);
  });

  it('detects goal drift and fails Gate-2', () => {
    const tr = buildMockGate2Transcript({ toolCalls: 35, retries: 0, goalDrift: true });
    const result = evaluateGate2Result(tr);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('goal-drift');
  });

  it('rejects transcripts with tool calls below the 30-50 window', () => {
    const tr = buildMockGate2Transcript({ toolCalls: 10, retries: 0, goalDrift: false });
    const result = evaluateGate2Result(tr);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('tool-calls-out-of-range');
  });
});
