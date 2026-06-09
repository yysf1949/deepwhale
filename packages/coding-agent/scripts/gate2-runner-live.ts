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
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
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
    { role: 'system', content: `You are an expert coding agent working in ${task.workspacePath}. Be concise. Use shell + read + edit tools only. Avoid web/browser/MCP unless absolutely necessary.` },
    { role: 'user', content: `Goal: ${task.goal}\n\nWorkspace: ${task.workspacePath}\n\nStart by exploring the workspace, then complete the goal using shell and file tools. Use small steps. After you finish, return a short summary.` },
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
  const reviewer: Reviewer = createReviewer({ runCommand: runShellCommand });
  const recorder = makeTaskGraphRecorder(store, task.goal);
  const maxSteps = task.maxSteps ?? 35;

  const messages = buildTaskMessages(task);
  await recorder.recordGoal(task.goal);

  let liveError: string | undefined;
  let reviewStatus: ReviewStatus | undefined;
  let result: Awaited<ReturnType<typeof runToolLoopWithReview>> | undefined;
  let finalResultKind: 'pass' | 'fail' | 'limit' | 'error' = 'pass';

  try {
    result = await runToolLoopWithReview({
      client,
      messages,
      registry: createDefaultRegistry({ profile: 'all' }),
      maxSteps,
      reviewer,
      reviewGates: ['pnpm typecheck', 'pnpm lint', 'pnpm test'],
      taskGraph: recorder,
    });
  } catch (err) {
    liveError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    finalResultKind = 'error';
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
