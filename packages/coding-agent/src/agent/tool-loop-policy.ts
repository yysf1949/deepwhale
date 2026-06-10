/**
 * Tool-loop policy integration — D-33.7 follow-up
 *
 * Wraps the existing `runToolLoop` (which is in 5 红线-adjacent path) with
 * post-loop hooks that wire in the Stage 5 Reviewer and Stage 6 TaskGraph
 * modules. The wrapper does NOT modify `runToolLoop`; it sits on top of it
 * so the v1.0 contract and the 5 红线 guarantees are preserved.
 *
 * Self-contained: the Reviewer / TaskGraph / Persistent Memory runtime
 * modules are referenced by their intended public API. When PR #8 (Reviewer)
 * and PR #9 (TaskGraph / Persistent Memory) merge, callers can switch to
 * importing them from the canonical locations.
 */

import { runToolLoop, type ToolLoopOptions, type ToolLoopResult } from './tool-loop.js';
import type { ChatMessage, ChatResult, LLMClient } from '@deepwhale/llm';

export type ReviewStatus = 'approve' | 'request_changes';

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Reviewer {
  review(input: { commands: ReadonlyArray<string> }): Promise<{ status: ReviewStatus; details: ReadonlyArray<CommandResult> }>;
}

export interface TaskGraphRecorder {
  recordToolCall(input: { toolName: string; argsDigest: string; success: boolean; durationMs: number }): Promise<void>;
  recordGoal(goal: string): Promise<void>;
}

export interface RunCommandWithReviewOptions extends Omit<ToolLoopOptions, 'registry' | 'maxSteps'> {
  readonly client: LLMClient;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly registry?: ToolLoopOptions['registry'];
  readonly maxSteps?: number;
  readonly reviewer?: Reviewer;
  readonly reviewGates?: ReadonlyArray<string>;
  readonly taskGraph?: TaskGraphRecorder;
}

export interface RunCommandWithReviewResult extends ToolLoopResult {
  readonly review?: { status: ReviewStatus; details: ReadonlyArray<CommandResult> };
  readonly toolCallsRecorded: number;
}

const DEFAULT_REVIEW_GATES: ReadonlyArray<string> = [
  'pnpm typecheck',
  'pnpm lint',
  'pnpm test',
];

function latestUserGoal(messages: ReadonlyArray<ChatMessage>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user' || typeof message.content !== 'string') continue;
    const goal = message.content.trim();
    if (goal.length > 0) return goal;
  }
  return undefined;
}

/**
 * Run a tool loop and (optionally) wire Reviewer / TaskGraph into the result.
 *
 * This is a thin post-loop wrapper. It does NOT modify runToolLoop and does
 * NOT add new lifecycle hooks. To extend the tool loop further, add a new
 * wrapper here that composes this one.
 */
export async function runToolLoopWithReview(options: RunCommandWithReviewOptions): Promise<RunCommandWithReviewResult> {
  const { client, messages, reviewer, reviewGates, taskGraph, ...loopOptions } = options;
  const loopOptionsClean: ToolLoopOptions = {};
  if (loopOptions.registry !== undefined) loopOptionsClean.registry = loopOptions.registry;
  if (loopOptions.maxSteps !== undefined) loopOptionsClean.maxSteps = loopOptions.maxSteps;
  if (loopOptions.toolTimeoutMs !== undefined) loopOptionsClean.toolTimeoutMs = loopOptions.toolTimeoutMs;
  if (loopOptions.onChunk !== undefined) loopOptionsClean.onChunk = loopOptions.onChunk;
  if (loopOptions.signal !== undefined) loopOptionsClean.signal = loopOptions.signal;
  if (loopOptions.policy !== undefined) loopOptionsClean.policy = loopOptions.policy;
  if (loopOptions.isInteractive !== undefined) loopOptionsClean.isInteractive = loopOptions.isInteractive;
  if (loopOptions.yes !== undefined) loopOptionsClean.yes = loopOptions.yes;
  if (loopOptions.writer !== undefined) loopOptionsClean.writer = loopOptions.writer;
  if (taskGraph) {
    const goal = latestUserGoal(messages);
    if (goal) await taskGraph.recordGoal(goal);
  }
  let result: Awaited<ReturnType<typeof runToolLoop>>;
  try {
    result = await runToolLoop(client, messages, loopOptionsClean);
  } catch (err) {
    // If the tool loop hit max-steps, build a partial result from the
    // partialSteps attached to the error (see tool-loop.ts:5). This lets
    // callers see the actual tool-call count rather than a synthetic 0.
    if (err && typeof err === 'object' && (err as { isToolLoopError?: unknown }).isToolLoopError === true) {
      const e = err as { lastResult?: ChatResult; partialSteps?: ReadonlyArray<unknown> };
      const partialSteps = Array.isArray(e.partialSteps)
        ? (e.partialSteps as Awaited<ReturnType<typeof runToolLoop>>['steps'])
        : [];
      // For the fallback, force finish_reason to 'length' (which is a real
      // ChatResult variant) so the type is happy. The 'limit' state is
      // already captured by the 'limit' step at the end of partialSteps.
      const fallback: ChatResult = e.lastResult
        ? { ...e.lastResult, finish_reason: 'length' as const }
        : { model: 'unknown' as ChatResult['model'], content: '', finish_reason: 'length' as const };
      result = {
        messages: [],
        final: e.lastResult ?? fallback,
        steps: partialSteps,
      };
    } else {
      throw err;
    }
  }
  let toolCallsRecorded = 0;
  if (taskGraph) {
    for (const step of result.steps) {
      if (step.kind === 'tool') {
        await taskGraph.recordToolCall({
          toolName: step.tool_call.name,
          argsDigest: JSON.stringify(step.tool_call.args ?? {}),
          success: step.result.success,
          durationMs: step.duration_ms,
        });
        toolCallsRecorded += 1;
      }
    }
  }
  let review: { status: ReviewStatus; details: ReadonlyArray<CommandResult> } | undefined;
  if (reviewer) {
    const gates = reviewGates ?? DEFAULT_REVIEW_GATES;
    review = await reviewer.review({ commands: gates });
  }
  return {
    ...result,
    ...(review ? { review } : {}),
    toolCallsRecorded,
  };
}
