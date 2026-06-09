/**
 * Gate-2 LIVE runner (D-36).
 *
 * Replaces the D-34 mock runner. Two paths:
 *
 *   --llm-config <path>     Real LLM path. Reads {apiKey, baseUrl, model}
 *                           from a JSON file, creates a DeepSeekClient (or
 *                           any OpenAI-compatible client), and invokes
 *                           runToolLoopWithReview on a real 30-50 tool-call
 *                           coding task. Source = "live-llm".
 *
 *   --mock                  Scripted mock path. Builds a synthetic
 *                           transcript and validates it. Source = "mock".
 *                           NEVER produces passed_live=true.
 *
 * Mutual exclusion: if both flags are present, the runner errors out.
 * Missing both: also errors out.
 *
 * The runner is intentionally split into:
 *   - `gate2-runner-core.ts` (pure logic, vitest-testable, exports buildLiveRunner, buildMockRunner)
 *   - `gate2-runner.mjs` (CLI shim, reads args, calls core, writes JSON+MD)
 */
import { readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { ToolRegistryProfile } from '../src/tools/registry.js';

export type Gate2Source = 'live-llm' | 'mock';
export type Gate2ResultKind = 'live' | 'mock-validated' | 'live-blocked';

/** Range constraints for the LIVE pass tool-call count (D-38 spec). */
export const TOOL_CALLS_MIN = 30;
export const TOOL_CALLS_MAX = 50;

export interface LLMConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

export interface TaskConfig {
  goal: string;
  /**
   * Absolute path to a writable workspace. The runner creates this if missing.
   * If absent, the runner will resolve `fixture` to a temp dir.
   */
  workspacePath?: string;
  /**
   * Path to a fixture template (relative to <pkg>/test/fixtures or absolute).
   * When set (and workspacePath is absent), the runner copies this fixture
   * into a fresh temp dir and uses that as the workspace. This makes the
   * Gate-2 run reproducible across machines without hardcoded absolute paths.
   */
  fixture?: string;
  maxSteps?: number;
  expectedFile?: string;
  /** Review commands (default: ['pnpm test']). Each is run via the workspace's cwd. */
  reviewGates?: ReadonlyArray<string>;
  /** Registry profile used for the live tool loop. Defaults to the frozen default surface. */
  registryProfile: ToolRegistryProfile;
}

export interface RunSpec {
  readonly source: Gate2Source;
  readonly llmConfigPath?: string;
  readonly taskConfigPath?: string;
  readonly mock?: boolean;
  readonly jsonOutPath: string;
  readonly mdOutPath: string;
}

/** Inputs to the strict LIVE pass rule. Pure, side-effect free. */
export interface PassedLiveInput {
  readonly source: Gate2Source;
  readonly reviewStatus: 'approve' | 'request_changes' | 'unavailable' | undefined;
  readonly finalResult: 'pass' | 'fail' | 'limit' | 'error' | 'mock' | undefined;
  readonly liveError: string | undefined;
  readonly toolCalls: number;
  readonly goalDriftDetected: boolean;
}

/**
 * D-38 strict pass rules for Gate-2 LIVE. ALL conditions must hold:
 *   1. source === 'live-llm' (mock never claims live)
 *   2. reviewStatus === 'approve'
 *   3. finalResult === 'pass'
 *   4. liveError is absent
 *   5. toolCalls ∈ [TOOL_CALLS_MIN, TOOL_CALLS_MAX]
 *   6. goalDriftDetected === false (HARD FAIL — no heuristic override)
 *
 * The mock path never calls this; it has its own source='mock' report.
 */
export function evaluatePassedLive(input: PassedLiveInput): boolean {
  if (input.source !== 'live-llm') return false;
  if (input.reviewStatus !== 'approve') return false;
  if (input.finalResult !== 'pass') return false;
  if (input.liveError !== undefined) return false;
  if (input.toolCalls < TOOL_CALLS_MIN || input.toolCalls > TOOL_CALLS_MAX) return false;
  if (input.goalDriftDetected) return false;
  return true;
}

export interface Gate2Report {
  readonly source: Gate2Source;
  readonly passed_live: boolean;
  readonly passed_mock: boolean;
  readonly toolCalls: number;
  readonly retries: number;
  readonly goalDriftDetected: boolean;
  readonly reviewStatus?: 'approve' | 'request_changes' | 'unavailable';
  readonly registryProfile?: ToolRegistryProfile;
  readonly taskgraphNodes?: number;
  readonly planPath?: string;
  readonly fixture?: { goal: string; workspacePath: string };
  readonly finalResult?: 'pass' | 'fail' | 'limit' | 'error' | 'mock';
  readonly liveError?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

/** Validation: mutual exclusion of --mock and --llm-config. */
export function validateRunSpec(spec: RunSpec): { ok: true } | { ok: false; reason: string } {
  if (spec.mock && spec.llmConfigPath) {
    return { ok: false, reason: 'cannot combine --mock with --llm-config' };
  }
  if (!spec.mock && !spec.llmConfigPath) {
    return { ok: false, reason: 'must provide either --mock or --llm-config' };
  }
  if (spec.mock && !spec.taskConfigPath && !spec.jsonOutPath) {
    // mock still needs an output path; taskConfigPath is optional
    return { ok: false, reason: 'must provide --json and --md' };
  }
  if (spec.llmConfigPath && !existsSync(spec.llmConfigPath)) {
    return { ok: false, reason: `llm-config file not found: ${spec.llmConfigPath}` };
  }
  if (spec.taskConfigPath && !existsSync(spec.taskConfigPath)) {
    return { ok: false, reason: `task-config file not found: ${spec.taskConfigPath}` };
  }
  return { ok: true };
}

/** Read LLM config from JSON. Throws if apiKey is empty. */
export async function readLLMConfig(path: string): Promise<LLMConfig> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<LLMConfig>;
  if (!parsed.apiKey || parsed.apiKey.length === 0) {
    throw new Error(`llm-config at ${path} has empty or missing apiKey; refusing to fall back to mock`);
  }
  return {
    apiKey: parsed.apiKey,
    ...(parsed.baseUrl !== undefined ? { baseUrl: parsed.baseUrl } : {}),
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
  };
}

/** Read task config from JSON. */
export async function readTaskConfig(path: string): Promise<TaskConfig> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<TaskConfig>;
  if (!parsed.goal || parsed.goal.length === 0) {
    throw new Error(`task-config at ${path} has empty or missing goal`);
  }
  if ((!parsed.workspacePath || parsed.workspacePath.length === 0) && !parsed.fixture) {
    throw new Error(`task-config at ${path} must have either workspacePath or fixture`);
  }
  return {
    goal: parsed.goal,
    ...(parsed.workspacePath !== undefined ? { workspacePath: parsed.workspacePath } : {}),
    ...(parsed.fixture !== undefined ? { fixture: parsed.fixture } : {}),
    ...(parsed.maxSteps !== undefined ? { maxSteps: parsed.maxSteps } : {}),
    ...(parsed.expectedFile !== undefined ? { expectedFile: parsed.expectedFile } : {}),
    ...(parsed.reviewGates !== undefined ? { reviewGates: parsed.reviewGates } : {}),
    registryProfile: readRegistryProfile((parsed as { registryProfile?: unknown }).registryProfile),
  };
}

const VALID_REGISTRY_PROFILES: ReadonlySet<ToolRegistryProfile> = new Set([
  'default',
  'core',
  'coding',
  'code-intel',
  'web',
  'engineering',
  'research',
  'productivity',
  'media',
  'all',
]);

function readRegistryProfile(raw: unknown): ToolRegistryProfile {
  if (raw === undefined) return 'default';
  if (typeof raw !== 'string' || !VALID_REGISTRY_PROFILES.has(raw as ToolRegistryProfile)) {
    throw new Error(`task-config invalid registryProfile: ${String(raw)}`);
  }
  return raw as ToolRegistryProfile;
}

/** Write report JSON + MD. */
export async function writeReport(report: Gate2Report, jsonPath: string, mdPath: string): Promise<void> {
  await mkdir(dirname(resolve(jsonPath)), { recursive: true });
  await mkdir(dirname(resolve(mdPath)), { recursive: true });
  const persisted = sanitizeReportForPersistence(report);
  await writeFile(resolve(jsonPath), JSON.stringify(persisted, null, 2) + '\n', 'utf8');
  await writeFile(resolve(mdPath), renderMarkdown(persisted), 'utf8');
}

function sanitizeReportForPersistence(report: Gate2Report): Gate2Report {
  if (report.fixture === undefined) return report;
  return {
    ...report,
    fixture: {
      ...report.fixture,
      workspacePath: sanitizeWorkspacePath(report.fixture.workspacePath),
    },
  };
}

function sanitizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/gate2-fixt-') || normalized.includes('/appdata/local/temp/')) {
    return '<materialized-gate2-fixture-workspace>';
  }
  return path;
}

function renderMarkdown(r: Gate2Report): string {
  const lines: string[] = [];
  lines.push('# Gate-2 Run Report');
  lines.push('');
  lines.push(`- source: \`${r.source}\``);
  lines.push(`- passed_live: \`${r.passed_live}\``);
  lines.push(`- passed_mock: \`${r.passed_mock}\``);
  lines.push(`- toolCalls: ${r.toolCalls}`);
  lines.push(`- retries: ${r.retries}`);
  lines.push(`- goalDriftDetected: ${r.goalDriftDetected}`);
  if (r.reviewStatus !== undefined) lines.push(`- reviewStatus: \`${r.reviewStatus}\``);
  if (r.registryProfile !== undefined) lines.push(`- registryProfile: \`${r.registryProfile}\``);
  if (r.taskgraphNodes !== undefined) lines.push(`- taskgraphNodes: ${r.taskgraphNodes}`);
  if (r.fixture !== undefined) {
    lines.push(`- goal: \`${r.fixture.goal}\``);
    lines.push(`- workspace: \`${r.fixture.workspacePath}\``);
  }
  if (r.finalResult !== undefined) lines.push(`- finalResult: \`${r.finalResult}\``);
  if (r.liveError !== undefined) lines.push(`- liveError: ${r.liveError}`);
  lines.push(`- startedAt: ${r.startedAt}`);
  lines.push(`- finishedAt: ${r.finishedAt}`);
  lines.push(`- durationMs: ${r.durationMs}`);
  return lines.join('\n') + '\n';
}
