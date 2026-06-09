/**
 * Gate-2 LIVE runner (D-36/D-37/D-38/D-39) — live path.
 *
 * Real LLM path: reads --llm-config + --task-config, creates a DeepSeekClient
 * (or any OpenAI-compatible client) and a Reviewer + TaskGraphStore, then
 * runs the LLM through runToolLoopWithReview (D-33.7 wrapper).
 *
 * D-39 additions:
 *   - Resolves task.fixture (relative to test/fixtures or absolute) to a
 *     fresh temp workspace via materializeFixture, so runs are reproducible
 *     across machines without hardcoded user paths.
 *   - Replaces the legacy single-signal token-overlap drift detector with
 *     a multi-signal detector (workspace scope + expectedFile + assistant
 *     content + review-gate invocation).
 *
 * Companion to gate2-runner-core.ts which provides shared types and helpers.
 */
import { mkdir, writeFile, rm, cp, mkdtemp } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  evaluatePassedLive,
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

// ============================================================================
// D-39 Fixture materialization
// ============================================================================

/**
 * Resolve a fixture path to a fresh temp dir with the fixture files copied in.
 * Fixture paths can be:
 *   - absolute (used directly)
 *   - relative to <pkg>/test/fixtures (e.g. "gate2-live/fixture")
 *   - relative to cwd
 *
 * Returns the absolute path of the temp dir. Each call creates a unique dir.
 */
export async function materializeFixture(fixturePath: string): Promise<string> {
  const absolute = resolve(fixturePath);
  let sourceDir: string;
  if (existsSync(absolute)) {
    sourceDir = absolute;
  } else {
    // Try under this package's test/fixtures dir. We probe several candidate
    // roots to handle test runners whose cwd is the repo root (e.g. vitest
    // when run from the workspace root) or the package dir (e.g. tsx).
    const candidates = [
      resolve(process.cwd(), 'test', 'fixtures', fixturePath),
      resolve(process.cwd(), 'packages', 'coding-agent', 'test', 'fixtures', fixturePath),
      // Walk up the dir tree until we find a packages/coding-agent/test/fixtures match.
      ...walkUpFor('packages/coding-agent/test/fixtures', fixturePath),
    ];
    const found = candidates.find((c) => existsSync(c));
    if (found) {
      sourceDir = found;
    } else {
      throw new Error(`materializeFixture: fixture not found at ${fixturePath}`);
    }
  }
  const tmp = await mkdtemp(join(tmpdir(), 'gate2-fixt-'));
  await cp(sourceDir, tmp, { recursive: true });
  return tmp;
}

function walkUpFor(marker: string, fixturePath: string): string[] {
  const out: string[] = [];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    out.push(resolve(dir, marker, fixturePath));
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

// ============================================================================
// D-39 Multi-signal goal-drift detector
// ============================================================================

export interface DriftInput {
  readonly goal: string;
  readonly expectedFile?: string;
  readonly workspacePath: string;
  readonly toolCalls: ReadonlyArray<{ toolName: string; args: unknown }>;
  readonly assistantContent: ReadonlyArray<string>;
  readonly reviewCommands: ReadonlyArray<string>;
}

/**
 * D-39 multi-signal goal-drift detector. Returns true only if the agent is
 * doing clearly unrelated work. The D-37/D-38 legacy detector flagged
 * legitimate `bash ls <workspace>` / `read_file <expectedFile>` as drift
 * because tool-summary tokens never contain goal words.
 *
 * Signals (any positive => no drift):
 *   1. WORKSPACE SCOPE: tool args reference a path inside workspacePath
 *      (or expectedFile / package.json / test dir).
 *   2. EXPECTED FILE TOUCH: tool args reference expectedFile.
 *   3. ASSISTANT CONTENT: assistant text mentions any goal keyword (len>3).
 *   4. REVIEW GATE: agent ran the configured review gate (e.g. `pnpm test`).
 */
export function detectGoalDrift(input: DriftInput): boolean {
  const workspaceNorm = input.workspacePath.replace(/\\/g, '/').toLowerCase();
  const expectedFile = input.expectedFile?.replace(/\\/g, '/').toLowerCase();

  // Signal 1: workspace scope
  const anyInWorkspace = input.toolCalls.some((tc) =>
    argsReferenceWorkspace(tc.args, workspaceNorm, expectedFile),
  );
  if (anyInWorkspace) return false;

  // Signal 2: expected file touch (only if not already caught by signal 1)
  if (expectedFile) {
    const anyTouchExpected = input.toolCalls.some((tc) =>
      argsReferenceFile(tc.args, expectedFile),
    );
    if (anyTouchExpected) return false;
  }

  // Signal 3: assistant content
  const goalKeywords = Array.from(
    input.goal
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3),
  );
  const anyContentMatch = input.assistantContent.some((msg) => {
    const msgLower = msg.toLowerCase();
    for (const kw of goalKeywords) {
      if (kw.length > 3 && msgLower.includes(kw)) return true;
    }
    return false;
  });
  if (anyContentMatch) return false;

  // Signal 4: review gate was invoked
  const anyReviewRan = input.toolCalls.some((tc) => {
    if (tc.toolName !== 'bash') return false;
    const cmd = extractBashCommand(tc.args);
    if (cmd === undefined) return false;
    return input.reviewCommands.some((gate) => cmd.includes(gate.split(' ')[0]!));
  });
  if (anyReviewRan) return false;

  return true;
}

function argsReferenceWorkspace(
  args: unknown,
  workspaceNorm: string,
  expectedFile: string | undefined,
): boolean {
  if (typeof args === 'string') {
    const lower = args.toLowerCase();
    if (lower.includes(workspaceNorm)) return true;
    if (expectedFile && lower.includes(expectedFile)) return true;
    return false;
  }
  if (Array.isArray(args)) {
    return args.some((v) => argsReferenceWorkspace(v, workspaceNorm, expectedFile));
  }
  if (args && typeof args === 'object') {
    for (const v of Object.values(args as Record<string, unknown>)) {
      if (argsReferenceWorkspace(v, workspaceNorm, expectedFile)) return true;
    }
  }
  return false;
}

function argsReferenceFile(args: unknown, targetFileNorm: string): boolean {
  if (typeof args === 'string') {
    return args.toLowerCase().includes(targetFileNorm);
  }
  if (Array.isArray(args)) {
    return args.some((v) => argsReferenceFile(v, targetFileNorm));
  }
  if (args && typeof args === 'object') {
    for (const v of Object.values(args as Record<string, unknown>)) {
      if (argsReferenceFile(v, targetFileNorm)) return true;
    }
  }
  return false;
}

function extractBashCommand(args: unknown): string | undefined {
  if (args && typeof args === 'object' && 'command' in args) {
    const c = (args as { command: unknown }).command;
    if (typeof c === 'string') return c;
  }
  return undefined;
}

// ============================================================================
// Task messages + tool summarization + TaskGraph adapter
// ============================================================================

function buildTaskMessages(task: TaskConfig, workspacePath: string): ChatMessage[] {
  // Tell the LLM exactly what the expected file is, what the review gate is,
  // and to STOP cleanly once the review gate passes. This is the D-39 system
  // prompt tuned so the LLM naturally converges within maxSteps instead of
  // hitting the limit.
  const expected = task.expectedFile ? `Primary file to edit: ${task.expectedFile}` : 'No specific expected file is configured; the review gate decides success.';
  const gate = (task.reviewGates && task.reviewGates.length > 0)
    ? task.reviewGates.join(' AND ')
    : 'pnpm test';
  return [
    {
      role: 'system',
      content: `You are an expert coding agent working in a sandbox workspace at: ${workspacePath}

Your task: ${task.goal}

${expected}

When you are DONE (all review gates pass), reply with the final answer and stop calling tools. Do not re-run the test after it passes — just stop.

Available coding tools: shell, read, edit, write, find, grep, ls. The review gate (${gate}) is run automatically when you stop; you do not need to run it yourself.
`,
    },
  ];
}

function summarizeToolCall(toolCall: { name: string; args: Record<string, unknown> }): string {
  const args = JSON.stringify(toolCall.args);
  const trimmed = args.length > 80 ? args.slice(0, 77) + '...' : args;
  return `${toolCall.name}(${trimmed})`;
}

function makeTaskGraphRecorder(store: TaskGraphStore, _goal: string): TaskGraphRecorder & { nodeCount: () => number } {
  const nodeIds = new Map<string, string>();
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

  const llmConfig = await readLLMConfig(spec.llmConfigPath);
  const task = await readTaskConfig(spec.taskConfigPath);

  const client: LLMClient = new DeepSeekClient({
    apiKey: llmConfig.apiKey,
    ...(llmConfig.baseUrl !== undefined ? { baseUrl: llmConfig.baseUrl } : {}),
    ...(llmConfig.model !== undefined ? { model: llmConfig.model } : {}),
  });

  // Resolve workspace
  let workspacePath: string;
  if (task.workspacePath) {
    workspacePath = task.workspacePath;
  } else if (task.fixture) {
    workspacePath = await materializeFixture(task.fixture);
  } else {
    throw new Error('runLive: task must have either workspacePath or fixture');
  }

  if (!existsSync(workspacePath)) {
    await mkdir(workspacePath, { recursive: true });
  }
  const taskgraphRoot = `${workspacePath}/.deepwhale/taskgraph`;
  await rm(taskgraphRoot, { recursive: true, force: true });
  const store = await createTaskGraphStore({ root: taskgraphRoot });
  process.env['GATE2_REVIEW_CWD'] = workspacePath;
  const reviewer: Reviewer = createReviewer({ runCommand: runShellCommand });
  const recorder = makeTaskGraphRecorder(store, task.goal);
  const maxSteps = task.maxSteps ?? 50;

  const messages = buildTaskMessages(task, workspacePath);
  await recorder.recordGoal(task.goal);

  let liveError: string | undefined;
  let reviewStatus: ReviewStatus | undefined;
  let result: Awaited<ReturnType<typeof runToolLoopWithReview>> | undefined;
  let finalResultKind: 'pass' | 'fail' | 'limit' | 'error' = 'pass';

  let reviewGates: string[];
  if (task.reviewGates && task.reviewGates.length > 0) {
    reviewGates = [...task.reviewGates];
  } else {
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
    finalResultKind = 'error';
  }

  // Determine review status from result. If the tool loop returned a review
  // result, use it. Otherwise (error/limit), no review ran → 'unavailable'.
  if (result && result.review) {
    reviewStatus = result.review.status;
  }

  // Extract tool calls and assistant content for drift detection.
  const toolCalls: Array<{ toolName: string; args: unknown }> = [];
  const assistantContent: string[] = [];
  for (const step of result?.steps ?? []) {
    if (step.kind === 'tool' && step.tool_call) {
      toolCalls.push({ toolName: step.tool_call.name, args: step.tool_call.args });
    } else if (step.kind === 'assistant') {
      // ChatMessage is OpenAI-compatible; content may be string or content-block array.
      const m = step.message as unknown as { content?: unknown };
      const c = m.content;
      if (typeof c === 'string' && c.length > 0) {
        assistantContent.push(c);
      } else if (Array.isArray(c)) {
        const text = c
          .map((block) => {
            if (block && typeof block === 'object' && 'text' in block) {
              return String((block as { text?: unknown }).text ?? '');
            }
            return '';
          })
          .join(' ');
        if (text.trim().length > 0) assistantContent.push(text);
      }
    }
  }

  const toolCallsCount = toolCalls.length;
  // toolSummaries is currently unused (drift detector uses toolCalls + assistantContent directly).
  // Kept available for future debug logging.
  const _toolSummaries = toolCalls.map((tc) =>
    summarizeToolCall({ name: tc.toolName, args: (tc.args ?? {}) as Record<string, unknown> }),
  );
  void _toolSummaries;

  // D-39 multi-signal drift detector
  const goalDriftDetected = detectGoalDrift({
    goal: task.goal,
    ...(task.expectedFile !== undefined ? { expectedFile: task.expectedFile } : {}),
    workspacePath,
    toolCalls,
    assistantContent,
    reviewCommands: reviewGates,
  });
  const nodeCount = recorder.nodeCount();

  // Determine finalResultKind from the actual tool-loop outcome
  if (finalResultKind !== 'error' && result) {
    if (result.steps.length > 0) {
      const lastStep = result.steps[result.steps.length - 1]!;
      if (lastStep.kind === 'limit') {
        finalResultKind = 'limit';
      } else {
        finalResultKind = 'pass';
      }
    } else {
      finalResultKind = 'fail';
    }
  }

  const passedLive = evaluatePassedLive({
    source: 'live-llm',
    reviewStatus,
    finalResult: finalResultKind,
    liveError,
    toolCalls: toolCallsCount,
    goalDriftDetected,
  });

  const finishedAt = new Date();
  const report: Gate2Report = {
    source: 'live-llm',
    passed_live: passedLive,
    passed_mock: false,
    toolCalls: toolCallsCount,
    retries: 0,
    goalDriftDetected,
    ...(reviewStatus !== undefined ? { reviewStatus } : { reviewStatus: 'unavailable' }),
    taskgraphNodes: nodeCount,
    fixture: { goal: task.goal, workspacePath },
    finalResult: finalResultKind,
    ...(liveError !== undefined ? { liveError } : {}),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };

  await writeReport(report, spec.jsonOutPath, spec.mdOutPath);

  if (spec.jsonOutPath) {
    const tracePath = resolve(dirname(spec.jsonOutPath), 'gate2-live-trace.json');
    await writeFile(
      tracePath,
      JSON.stringify(
        {
          messages: result?.messages ?? [],
          steps: result?.steps ?? [],
          review: result?.review,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }

  return { report };
}
