/**
 * Gate-2 LIVE runner (D-36) — mock path.
 *
 * Scripted mock path: builds a synthetic 35-step transcript and validates it.
 * Source = "mock". NEVER produces passed_live=true.
 *
 * This is the only path that uses the synthetic-transcript builder. The live
 * path (gate2-runner-live.ts) uses a real LLM client and runToolLoopWithReview.
 */
import {
  validateRunSpec,
  writeReport,
  type Gate2Report,
  type RunSpec,
} from './gate2-runner-core.js';

const GOAL_TOKEN_MIN_LENGTH = 3;
const RETRY_LIMIT = 5;
const TOOL_CALL_MIN = 30;
const TOOL_CALL_MAX = 50;

function goalTokens(goal: string): Set<string> {
  return new Set(
    goal.toLowerCase().split(/\W+/).filter((t) => t.length > GOAL_TOKEN_MIN_LENGTH),
  );
}

/** Build a synthetic N-step transcript (self-validation, NOT a real Gate-2 pass). */
function buildMockGate2Transcript(input: { toolCalls: number; retries: number; goalDrift: boolean }): {
  goal: string;
  steps: ReadonlyArray<{ index: number; tool: string; summary: string; retry: boolean }>;
} {
  return {
    goal: 'fix failing registry profile test',
    steps: Array.from({ length: input.toolCalls }, (_, index) => ({
      index: index + 1,
      tool: 'shell',
      summary:
        input.goalDrift && index === Math.floor(input.toolCalls / 2)
          ? 'started unrelated browser feature'
          : 'continued registry profile fix',
      retry: index < input.retries,
    })),
  };
}

/** Validate a synthetic transcript against the Gate-2 fixture rules. */
function evaluateGate2Result(transcript: { goal: string; steps: ReadonlyArray<{ retry: boolean; summary: string }> }): {
  passed: boolean;
  toolCalls: number;
  retries: number;
  goalDriftDetected: boolean;
  reason?: string;
} {
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

export interface RunMockResult {
  readonly report: Gate2Report;
}

export async function runMock(spec: RunSpec): Promise<RunMockResult> {
  const validation = validateRunSpec(spec);
  if (validation.ok === false) {
    throw new Error(`invalid mock spec: ${validation.reason}`);
  }
  const startedAt = new Date();

  // Build a synthetic 35-step transcript (1 retry, no drift). The evaluate
  // step is a self-validation of the fixture, not a real Gate-2 pass.
  const transcript = buildMockGate2Transcript({ toolCalls: 35, retries: 1, goalDrift: false });
  const evalResult = evaluateGate2Result(transcript);

  const finishedAt = new Date();
  const report: Gate2Report = {
    source: 'mock',
    passed_live: false, // Hard guarantee: mock NEVER produces passed_live=true
    passed_mock: evalResult.passed,
    toolCalls: evalResult.toolCalls,
    retries: evalResult.retries,
    goalDriftDetected: evalResult.goalDriftDetected,
    reviewStatus: 'unavailable', // No reviewer in mock path
    finalResult: 'mock',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };

  await writeReport(report, spec.jsonOutPath, spec.mdOutPath);
  return { report };
}
