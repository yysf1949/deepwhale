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
    // D-40: also support a top-level `fixtures/` dir at the repo root, where
    // shared long-horizon fixtures live so they don't get picked up by
    // vitest's test-discovery walk.
    const candidates = [
      resolve(process.cwd(), 'test', 'fixtures', fixturePath),
      resolve(process.cwd(), 'packages', 'coding-agent', 'test', 'fixtures', fixturePath),
      resolve(process.cwd(), 'fixtures', fixturePath),
      // Walk up the dir tree looking for known fixture roots.
      ...walkUpFor('packages/coding-agent/test/fixtures', fixturePath),
      ...walkUpFor('fixtures', fixturePath),
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
 * D-40 stricter multi-signal goal-drift detector.
 *
 * Returns true only if the agent is doing clearly unrelated work. The D-39
 * detector treated ANY single positive signal as "not drift", which let
 * drive-by `pnpm test` calls (signal 4) be enough to defeat drift detection
 * even when the agent was clearly working on something off-topic.
 *
 * New rule: at least 2 of the 4 positive signals must be present for a
 * workflow to be considered in-scope. This raises the bar so that an
 * agent has to actually be working on the right files AND talk about
 * the goal AND/OR run the review gate.
 *
 * Signals (counted; need >= 2 positive):
 *   1. WORKSPACE SCOPE: tool args reference a path inside workspacePath
 *      (or expectedFile / package.json / test dir).
 *   2. EXPECTED FILE TOUCH: tool args reference expectedFile.
 *   3. ASSISTANT CONTENT: assistant text mentions any goal keyword (len>3).
 *   4. REVIEW GATE: agent ran the configured review gate (e.g. `pnpm test`).
 *
 * D-52 hardening: when expectedFile is configured, workspace scope plus
 * review gate is not enough. The transcript must either touch expectedFile
 * or assistant text must mention the goal.
 */
export function detectGoalDrift(input: DriftInput): boolean {
  const workspaceNorm = input.workspacePath.replace(/\\/g, '/').toLowerCase();
  const expectedFile = input.expectedFile?.replace(/\\/g, '/').toLowerCase();

  const goalKeywords = Array.from(
    input.goal
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3),
  );

  const hasWorkspaceScope = input.toolCalls.some((tc) =>
    argsReferenceWorkspace(tc.args, workspaceNorm, expectedFile),
  );
  const hasExpectedFileTouch = expectedFile !== undefined &&
    input.toolCalls.some((tc) => argsReferenceFile(tc.args, expectedFile));
  const assistantMentionsGoal = input.assistantContent.some((msg) => {
    const msgLower = msg.toLowerCase();
    return goalKeywords.some((kw) => kw.length > 3 && msgLower.includes(kw));
  });
  const reviewGateInvoked = input.toolCalls.some((tc) => {
    if (tc.toolName !== 'bash') return false;
    const cmd = extractBashCommand(tc.args);
    if (cmd === undefined) return false;
    return input.reviewCommands.some((gate) => {
      const firstToken = gate.split(' ')[0]!;
      return cmd.includes(firstToken) || cmd.includes(gate);
    });
  });

  let positives = 0;
  for (const signal of [hasWorkspaceScope, hasExpectedFileTouch, assistantMentionsGoal, reviewGateInvoked]) {
    if (signal) positives++;
  }

  // Hard-fail drift: writes to a path OUTSIDE the materialized workspace
  // (e.g. trying to edit a different repo or write to /etc/passwd).
  const outsideWorkspace = input.toolCalls.some((tc) =>
    argsReferenceOutsideWorkspace(tc.args, workspaceNorm),
  );
  if (outsideWorkspace) return true;

  if (expectedFile !== undefined && !hasExpectedFileTouch && !assistantMentionsGoal) {
    return true;
  }

  // Need at least 2 of 4 positive signals to be considered in-scope.
  return positives < 2;
}

function argsReferenceOutsideWorkspace(args: unknown, workspaceNorm: string): boolean {
  // Heuristic: if a tool arg looks like an absolute path (C:/... or /...) and
  // does NOT start with the workspace path, treat it as outside-workspace.
  // The runner is not a sandbox; this is best-effort detection for obvious
  // off-target writes.
  const visit = (s: string): boolean => {
    if (s.length < 3) return false;
    for (const path of extractAbsolutePathTokens(s)) {
      const norm = path.replace(/\\/g, '/').toLowerCase();
      if (!norm.startsWith(workspaceNorm)) return true;
    }
    return false;
  };
  if (typeof args === 'string') return visit(args);
  if (Array.isArray(args)) return args.some((v) => argsReferenceOutsideWorkspace(v, workspaceNorm));
  if (args && typeof args === 'object') {
    for (const v of Object.values(args as Record<string, unknown>)) {
      if (argsReferenceOutsideWorkspace(v, workspaceNorm)) return true;
    }
  }
  return false;
}

function extractAbsolutePathTokens(value: string): string[] {
  const tokens: string[] = [];
  const windowsDrivePath = /(^|[^\w+.-])([a-zA-Z]:[\\/][^\s"'`<>|]*)/g;
  const posixAbsolutePath = /(^|[\s"'`(=])\/(?!\/)[^\s"'`<>|]*/g;
  for (const match of value.matchAll(windowsDrivePath)) {
    tokens.push(trimPathToken(match[2] ?? ''));
  }
  for (const match of value.matchAll(posixAbsolutePath)) {
    tokens.push(trimPathToken(match[0].trimStart()));
  }
  return tokens.filter((token) => token.length > 0);
}

function trimPathToken(token: string): string {
  return token.replace(/[),.;\]]+$/g, '');
}

function argsReferenceWorkspace(
  args: unknown,
  workspaceNorm: string,
  expectedFile: string | undefined,
): boolean {
  // workspaceNorm is the workspace path with `\` normalized to `/` and lowercased.
  // We do the same normalization on every string we inspect, so the comparison
  // works regardless of the platform separator the agent used.
  const norm = (s: string): string => s.replace(/\\/g, '/').toLowerCase();
  if (typeof args === 'string') {
    const lower = norm(args);
    if (lower.includes(workspaceNorm)) return true;
    if (expectedFile && lower.includes(norm(expectedFile))) return true;
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
  // targetFileNorm is already normalized to `/` and lowercased. We do the
  // same to each inspected string so the comparison works across separators.
  const norm = (s: string): string => s.replace(/\\/g, '/').toLowerCase();
  if (typeof args === 'string') {
    return norm(args).includes(targetFileNorm);
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

export function sanitizeTraceForPersistence(value: unknown): unknown {
  if (typeof value === 'string') return redactTraceString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeTraceForPersistence(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'reasoning_content') continue;
      out[key] = sanitizeTraceForPersistence(child);
    }
    return out;
  }
  return value;
}

function redactTraceString(value: string): string {
  return value
    .replace(/[a-zA-Z]:[\\/][^\s"'`<>|]*?gate2-fixt-[^\\/\s"'`<>|]*/gi, '<materialized-gate2-fixture-workspace>')
    .replace(/\/[^\s"'`<>|]*?gate2-fixt-[^/\s"'`<>|]*/g, '<materialized-gate2-fixture-workspace>')
    .replace(/[a-zA-Z]:[\\/][^\s"'`<>|]*?dw-exec-[^\\/\s"'`<>|]*/gi, '<temp-exec-workspace>')
    .replace(/\/[^\s"'`<>|]*?dw-exec-[^/\s"'`<>|]*/g, '<temp-exec-workspace>')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '<redacted-secret>')
    .replace(/\bapi_key\s*=\s*<redacted-secret>/gi, 'api_key=<redacted-secret>');
}

// ============================================================================
// Task messages + tool summarization + TaskGraph adapter
// ============================================================================

export function buildTaskMessages(task: TaskConfig, workspacePath: string): ChatMessage[] {
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

You may run tests or other verification commands when the task asks for them or when they help you diagnose the fix. When you believe the task is complete, reply with the final answer and stop calling tools.

Available coding tools: shell, read, edit, write, find, grep, ls. The review gate (${gate}) is final verification and runs automatically after you stop, so your final answer should be based on the workspace state you created.
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

export function determineLiveFinalResult(input: {
  readonly liveError?: string;
  readonly steps?: ReadonlyArray<{ readonly kind: string }>;
  readonly reviewStatus?: ReviewStatus | 'unavailable';
}): 'pass' | 'fail' | 'limit' | 'error' {
  if (input.liveError !== undefined) return 'error';
  const steps = input.steps ?? [];
  if (steps.length === 0) return 'fail';
  const lastStep = steps[steps.length - 1]!;
  if (lastStep.kind === 'limit') return 'limit';
  return input.reviewStatus === 'approve' ? 'pass' : 'fail';
}

export async function withGate2ReviewCwd<T>(workspacePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env['GATE2_REVIEW_CWD'];
  process.env['GATE2_REVIEW_CWD'] = workspacePath;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env['GATE2_REVIEW_CWD'];
    } else {
      process.env['GATE2_REVIEW_CWD'] = previous;
    }
  }
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
  const reviewer: Reviewer = createReviewer({ runCommand: runShellCommand });
  const recorder = makeTaskGraphRecorder(store, task.goal);
  const maxSteps = task.maxSteps ?? 50;

  const messages = buildTaskMessages(task, workspacePath);
  await recorder.recordGoal(task.goal);

  let liveError: string | undefined;
  let reviewStatus: ReviewStatus | undefined;
  let result: Awaited<ReturnType<typeof runToolLoopWithReview>> | undefined;

  let reviewGates: string[];
  if (task.reviewGates && task.reviewGates.length > 0) {
    reviewGates = [...task.reviewGates];
  } else {
    reviewGates = ['pnpm test'];
  }
  const registryProfile = task.registryProfile ?? 'default';
  try {
    result = await withGate2ReviewCwd(workspacePath, () =>
      runToolLoopWithReview({
        client,
        messages,
        registry: createDefaultRegistry({ profile: registryProfile }),
        maxSteps,
        reviewer,
        reviewGates,
        taskGraph: recorder,
      }),
    );
  } catch (err) {
    liveError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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

  const finalResultKind = determineLiveFinalResult({
    ...(liveError !== undefined ? { liveError } : {}),
    steps: result?.steps ?? [],
    reviewStatus: reviewStatus ?? 'unavailable',
  });

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
    registryProfile,
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
          messages: sanitizeTraceForPersistence(result?.messages ?? []),
          steps: sanitizeTraceForPersistence(result?.steps ?? []),
          review: sanitizeTraceForPersistence(result?.review),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }

  return { report };
}
