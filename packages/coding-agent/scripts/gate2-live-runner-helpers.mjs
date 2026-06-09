/**
 * Gate-2 live runner helpers (D-34).
 * Pure logic — no LLM, no IO. Imports well in vitest.
 */

export const GOAL_TOKEN_MIN_LENGTH = 3;
export const RETRY_LIMIT = 5;
export const TOOL_CALL_MIN = 30;
export const TOOL_CALL_MAX = 50;

function goalTokens(goal) {
  return new Set(
    goal.toLowerCase().split(/\W+/).filter((t) => t.length > GOAL_TOKEN_MIN_LENGTH),
  );
}

export function buildMockGate2Transcript({ toolCalls, retries, goalDrift }) {
  return {
    goal: 'fix failing registry profile test',
    steps: Array.from({ length: toolCalls }, (_, index) => ({
      index: index + 1,
      tool: 'shell',
      summary: goalDrift && index === Math.floor(toolCalls / 2)
        ? 'started unrelated browser feature'
        : 'continued registry profile fix',
      retry: index < retries,
    })),
  };
}

export function evaluateGate2Result(transcript) {
  const toolCalls = transcript.steps.length;
  const retries = transcript.steps.filter((s) => s.retry).length;
  if (toolCalls < TOOL_CALL_MIN || toolCalls > TOOL_CALL_MAX) {
    return { passed: false, toolCalls, retries, goalDriftDetected: false, reason: 'tool-calls-out-of-range' };
  }
  if (retries > RETRY_LIMIT) {
    return { passed: false, toolCalls, retries, goalDriftDetected: false, reason: 'too-many-retries' };
  }
  const tokens = goalTokens(transcript.goal);
  let drift = false;
  for (const step of transcript.steps) {
    const stepTokens = step.summary.toLowerCase().split(/\W+/).filter((t) => t.length > GOAL_TOKEN_MIN_LENGTH);
    if (stepTokens.length === 0) continue;
    const overlap = stepTokens.filter((t) => tokens.has(t)).length;
    if (overlap === 0) { drift = true; break; }
  }
  if (drift) {
    return { passed: false, toolCalls, retries, goalDriftDetected: true, reason: 'goal-drift' };
  }
  return { passed: true, toolCalls, retries, goalDriftDetected: false };
}
