/**
 * Gate-2 Long-Horizon Harness — v3.0 (D-33.5.5)
 *
 * Pure report logic. Takes a transcript (goal + steps) and reports:
 *   - toolCalls: number of tool invocations
 *   - retries: number of step that was a retry
 *   - goalDriftDetected: whether any step's summary diverged from the goal
 *   - passed: true iff 30 <= toolCalls <= 50, no drift, retries <= 5
 *
 * The harness is fixture-based in this sub-sprint; a real 30-50 tool-call
 * task is run in v4.0 (per master plan §"Gate-2" / Stage 5.6).
 */

export interface Gate2Step {
  readonly index: number;
  readonly tool: string;
  readonly summary: string;
  readonly retry: boolean;
}

export interface Gate2Transcript {
  readonly goal: string;
  readonly steps: ReadonlyArray<Gate2Step>;
}

export interface Gate2Evaluation {
  readonly passed: boolean;
  readonly toolCalls: number;
  readonly retries: number;
  readonly goalDriftDetected: boolean;
  readonly reason?: 'tool-calls-out-of-range' | 'goal-drift' | 'too-many-retries';
}

const GOAL_TOKEN_MIN_LENGTH = 3;
const RETRY_LIMIT = 5;
const TOOL_CALL_MIN = 30;
const TOOL_CALL_MAX = 50;

function goalTokens(goal: string): Set<string> {
  return new Set(
    goal
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > GOAL_TOKEN_MIN_LENGTH),
  );
}

export function evaluateGate2Transcript(transcript: Gate2Transcript): Gate2Evaluation {
  const toolCalls = transcript.steps.length;
  const retries = transcript.steps.filter((step) => step.retry).length;

  if (toolCalls < TOOL_CALL_MIN || toolCalls > TOOL_CALL_MAX) {
    return { passed: false, toolCalls, retries, goalDriftDetected: false, reason: 'tool-calls-out-of-range' };
  }
  if (retries > RETRY_LIMIT) {
    return { passed: false, toolCalls, retries, goalDriftDetected: false, reason: 'too-many-retries' };
  }

  const tokens = goalTokens(transcript.goal);
  let drift = false;
  for (const step of transcript.steps) {
    const stepTokens = step.summary
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > GOAL_TOKEN_MIN_LENGTH);
    if (stepTokens.length === 0) continue;
    const overlap = stepTokens.filter((token) => tokens.has(token)).length;
    if (overlap === 0) {
      drift = true;
      break;
    }
  }

  if (drift) {
    return { passed: false, toolCalls, retries, goalDriftDetected: true, reason: 'goal-drift' };
  }

  return { passed: true, toolCalls, retries, goalDriftDetected: false };
}
