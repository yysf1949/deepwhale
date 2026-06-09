/**
 * Gate-2 LIVE runner (D-36) — live path.
 *
 * Real LLM path: reads --llm-config + --task-config, creates a DeepSeekClient
 * (or any OpenAI-compatible client) and a Reviewer + TaskGraphStore, then
 * invokes runToolLoopWithReview. Collects tool calls, retries, review status,
 * goal drift. NEVER falls back to mock if apiKey is empty.
 *
 * Companion to gate2-runner-core.ts which provides shared types and helpers.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  readLLMConfig,
  readTaskConfig,
  writeReport,
  type Gate2Report,
  type RunSpec,
  type TaskConfig,
} from './gate2-runner-core.js';
import { DeepSeekClient } from '@deepwhale/llm';
import { runToolLoopWithReview, type Reviewer, type TaskGraphRecorder } from '../src/agent/tool-loop-policy.js';
import { createReviewer, type ReviewStatus } from '../src/reviewer/reviewer.js';
import { createTaskGraphStore, type TaskGraphStore } from '../src/taskgraph/taskgraph.js';
import { createDefaultRegistry } from '../src/tools/registry.js';
import { existsSync } from 'node:fs';
import type { ChatMessage, LLMClient } from '@deepwhale/llm';

function runShellCommand(command: string): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
  // Pin the reviewer's cwd to the task workspace so that `pnpm typecheck`,
  // `pnpm lint`, and `pnpm test` operate on the agent's working files, not
  // the runner's host repo.
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd: process.env.GATE2_REVIEW_CWD });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (exitCode) => {
      resolve({ command, exitCode: exitCode ?? 0, stdout, stderr });
    });
  });
}

function detectGoalDrift(goal: string, toolSummaries: ReadonlyArray<string>): boolean {
  const tokens = new Set(
    goal
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3),
  );
  for (const summary of toolSummaries) {
    const summaryTokens = summary
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3);
    if (summaryTokens.length === 0) continue;
    const overlap = summaryTokens.filter((t) => tokens.has(t)).length;
    if (overlap === 0) return true;
  }
  return false;
}

function buildTaskMessages(task: TaskConfig): ChatMessage[] {
  return [
    { role: 'system', content: `You are an expert coding agent. Your task: ${task.goal}\n\nWorkspace: ${task.workspacePath}\n\nYou have shell, read, edit, write, and other coding tools available. Use them.\n\nApproach:\n1. List the workspace contents to see the project structure.\n2. Read the relevant source files.\n3. Run the test suite to see what's failing.\n4. Fix the bugs by editing source files.\n5. Run the test suite again to verify.\n6. Repeat until all tests pass.\n\nStart now. Use the shell tool to run \`ls\`, \`cat\`, and \`node --test test/\`. Use the edit tool to modify source files. Keep going until the goal is met.` },
  ];
}

function summarizeToolCall(toolCall: { name: string; args: Record<string, unknown> }): string {
  // Take a short digest of args to keep summaries small
  const args = JSON.stringify(toolCall.args);
  const trimmed = args.length > 80 ? args.slice(0, 77) + '...' : args;
  return `${toolCall.name}(${trimmed})`;
}

/**
 * Adapter: the policy wrapper expects a `TaskGraphRecorder` (recordToolCall
 * + recordGoal). The actual store uses `append` + `update`. This adapter
 * bridges the two by maintaining an in-memory counter for unique node IDs.
 */
function makeTaskGraphRecorder(store: TaskGraphStore, _goal: string): TaskGraphRecorder & { nodeCount: () => number } {
  const nodeIds = new Map<string, string>(); // argsDigest -> nodeId
  let counter = 0;

  return {
    async recordGoal(g) {
      const id = `goal-${counter++}`;
      await store.append({ id, goal: g, dependsOn: [], status: 'ready', source: 'user_explicit' });
    },
    async recordToolCall({ toolName, argsDigest, success, durationMs }) {
      const key = `${toolName}:${argsDigest}`;
      let id = nodeIds.get(key);
      if (id === undefined) {
        id = `tc-${counter++}`;
        nodeIds.set(key, id);
        await store.append({ id, goal: `${toolName} call`, dependsOn: [], status: success ? 'done' : 'failed', source: 'auto' });
      } else {
        const change: { status: 'done' | 'failed' | 'running'; updatedAt: number; retryCount?: number } = {
          status: success ? 'done' : 'failed',
          updatedAt: Date.now(),
        };
        await store.update(id, change);
      }
      // durationMs is recorded into the node log via the JSONL store;
      // the policy's signature is loose so we ignore it for now.
      void durationMs;
    },
    nodeCount() {
      return nodeIds.size;
    },
  };
}

export interface RunLiveResult {
  readonly report: Gate2Report;
}

export async function runLive(spec: RunSpec): Promise<RunLiveResult> {
  const startedAt = new Date();
  if (!spec.llmConfigPath) throw new Error('runLive requires llmConfigPath');
  if (!spec.taskConfigPath) throw new Error('runLive requires taskConfigPath');

  const llmConfig = await readLLMConfig(spec.llmConfigPath); // throws if apiKey empty
  const task = await readTaskConfig(spec.taskConfigPath); // throws if goal/workspace empty

  // Create the LLM client. DeepSeekClient is OpenAI-compatible so it works
  // with any baseUrl that speaks the OpenAI chat/completions protocol.
  const client: LLMClient = new DeepSeekClient({
    apiKey: llmConfig.apiKey,
    ...(llmConfig.baseUrl !== undefined ? { baseUrl: llmConfig.baseUrl } : {}),
    ...(llmConfig.model !== undefined ? { model: llmConfig.model } : {}),
  });

  if (!existsSync(task.workspacePath)) {
    await mkdir(task.workspacePath, { recursive: true });
  }
  // Wipe any stale taskgraph from a prior run. Each run is a fresh TaskGraph.
  const taskgraphRoot = `${task.workspacePath}/.deepwhale/taskgraph`;
  await rm(taskgraphRoot, { recursive: true, force: true });
  const store = await createTaskGraphStore({ root: taskgraphRoot });
  // Pin reviewer cwd to the workspace so its gates run against the agent's work.
  process.env['GATE2_REVIEW_CWD'] = task.workspacePath;
  const reviewer: Reviewer = createReviewer({ runCommand: runShellCommand });
  const recorder = makeTaskGraphRecorder(store, task.goal);
  const maxSteps = task.maxSteps ?? 35;

  const messages = buildTaskMessages(task);
  await recorder.recordGoal(task.goal);

  let liveError: string | undefined;
  let reviewStatus: ReviewStatus | undefined;
  let result: Awaited<ReturnType<typeof runToolLoopWithReview>> | undefined;
  let finalResultKind: 'pass' | 'fail' | 'limit' | 'error' = 'pass';

  let reviewGates: string[];
  if (task.reviewGates && task.reviewGates.length > 0) {
    reviewGates = task.reviewGates;
  } else {
    // Default: just run the test suite. pnpm typecheck / pnpm lint require
    // a fully-configured project (tsconfig, eslint config, etc.) which a
    // minimal fixture workspace doesn't have. Override via task.reviewGates
    // for production projects.
    reviewGates = ['pnpm test'];
  }
  try {
    result = await runToolLoopWithReview({
      client,
      messages,
      registry: createDefaultRegistry({ profile: 'all' }),
      maxSteps,
      reviewer,
      reviewGates,
      taskGraph: recorder,
    });
  } catch (err) {
    liveError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    // ToolLoopLimitError → 'limit'; everything else → 'error'.
    if (err && typeof err === 'object' && (err as { isToolLoopError?: unknown }).isToolLoopError === true) {
      finalResultKind = 'limit';
    } else {
      finalResultKind = 'error';
    }
    // Best-effort: if the error carries a lastResult, expose the last assistant step
    // so the report shows *some* signal that the LLM was responding.
    const e = err as { lastResult?: unknown };
    if (e.lastResult !== undefined) {
      // Build a synthetic result-like object with one assistant step so the
      // trace file isn't empty and toolCalls/lastAssistantContent are populated.
      result = {
        messages,
        final: e.lastResult as { content: string; model: string; finish_reason: string },
        steps: [{ kind: 'limit', ts: Date.now(), steps: maxSteps, lastResult: e.lastResult as { content: string; model: string; finish_reason: string } }],
      } as Awaited<ReturnType<typeof runToolLoopWithReview>>;
    }
  }

  // Derive finalResultKind from the actual step kinds.
  if (result) {
    if (result.steps.some((s) => s.kind === 'error')) finalResultKind = 'error';
    else if (result.steps.some((s) => s.kind === 'limit')) finalResultKind = 'limit';
    else if (result.review?.status === 'request_changes') finalResultKind = 'fail';
    else finalResultKind = 'pass';
    reviewStatus = result.review?.status;
  }

  // Compute metrics from the actual tool-loop result (not a synthetic transcript).
  const toolSteps = (result?.steps ?? []).filter((s) => s.kind === 'tool');
  const toolSummaries = toolSteps.map((s) => (s.kind === 'tool' ? summarizeToolCall(s.tool_call) : ''));
  const toolCalls = toolSteps.length;
  // Live tool loop does not model explicit retries in the same way as the
  // synthetic transcript; we record 0 and document the gap.
  const retries = 0;
  const goalDriftDetected = detectGoalDrift(task.goal, toolSummaries);
  const nodeCount = recorder.nodeCount();

  const passedLive = Boolean(
    result &&
      toolCalls >= 30 &&
      toolCalls <= 50 &&
      !goalDriftDetected &&
      (reviewStatus === undefined || reviewStatus === 'approve') &&
      finalResultKind !== 'error',
  );

  const finishedAt = new Date();
  const report: Gate2Report = {
    source: 'live-llm',
    passed_live: passedLive,
    passed_mock: false,
    toolCalls,
    retries,
    goalDriftDetected,
    ...(reviewStatus !== undefined ? { reviewStatus } : { reviewStatus: 'unavailable' }),
    taskgraphNodes: nodeCount,
    fixture: { goal: task.goal, workspacePath: task.workspacePath },
    finalResult: finalResultKind,
    ...(liveError !== undefined ? { liveError } : {}),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };

  await writeReport(report, spec.jsonOutPath, spec.mdOutPath);

  // Write the runToolLoopWithReview steps to a side file for forensic review.
  if (spec.jsonOutPath) {
    const tracePath = resolve(dirname(spec.jsonOutPath), 'gate2-live-trace.json');
    await writeFile(tracePath, JSON.stringify({
      messages: result?.messages ?? [],
      steps: result?.steps ?? [],
      review: result?.review,
    }, null, 2) + '\n', 'utf8');
  }

  return { report };
}
