import { describe, expect, it } from 'vitest';
import {
  evaluatePassedLive,
  readLLMConfig,
  readTaskConfig,
  validateRunSpec,
  writeReport,
  type Gate2Report,
  type PassedLiveInput,
  type RunSpec,
} from '../../scripts/gate2-runner-core.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('gate2-runner-core: source identification', () => {
  it('accepts --mock alone', () => {
    const spec: RunSpec = {
      source: 'mock',
      mock: true,
      jsonOutPath: '/tmp/out.json',
      mdOutPath: '/tmp/out.md',
    };
    expect(validateRunSpec(spec)).toEqual({ ok: true });
  });

  it('accepts --llm-config with existing file', () => {
    const spec: RunSpec = {
      source: 'live-llm',
      llmConfigPath: 'D:/App/openClaw/projects/deepwhale/package.json', // any existing file
      jsonOutPath: '/tmp/out.json',
      mdOutPath: '/tmp/out.md',
    };
    expect(validateRunSpec(spec)).toEqual({ ok: true });
  });

  it('rejects --mock combined with --llm-config', () => {
    const spec: RunSpec = {
      source: 'mock',
      mock: true,
      llmConfigPath: 'D:/App/openClaw/projects/deepwhale/package.json',
      jsonOutPath: '/tmp/out.json',
      mdOutPath: '/tmp/out.md',
    };
    const result = validateRunSpec(spec);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/cannot combine/);
    }
  });

  it('rejects neither --mock nor --llm-config', () => {
    const spec: RunSpec = {
      source: 'mock',
      jsonOutPath: '/tmp/out.json',
      mdOutPath: '/tmp/out.md',
    };
    const result = validateRunSpec(spec);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/must provide either/);
    }
  });

  it('rejects --llm-config with non-existing file', () => {
    const spec: RunSpec = {
      source: 'live-llm',
      llmConfigPath: '/nonexistent/path/to/llm.json',
      jsonOutPath: '/tmp/out.json',
      mdOutPath: '/tmp/out.md',
    };
    const result = validateRunSpec(spec);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/llm-config file not found/);
    }
  });
});

describe('gate2-runner-core: readLLMConfig refuses to fall back to mock', () => {
  it('throws when apiKey is empty', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'llm.json');
      await writeFile(cfgPath, JSON.stringify({ apiKey: '' }), 'utf8');
      await expect(readLLMConfig(cfgPath)).rejects.toThrow(/empty or missing apiKey/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('throws when apiKey key is missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'llm.json');
      await writeFile(cfgPath, JSON.stringify({ baseUrl: 'https://example.com' }), 'utf8');
      await expect(readLLMConfig(cfgPath)).rejects.toThrow(/empty or missing apiKey/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('reads a valid config with apiKey + baseUrl + model', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'llm.json');
      await writeFile(
        cfgPath,
        JSON.stringify({ apiKey: 'sk-test', baseUrl: 'https://api.example.com', model: 'gpt-4o-mini' }),
        'utf8',
      );
      const cfg = await readLLMConfig(cfgPath);
      expect(cfg.apiKey).toBe('sk-test');
      expect(cfg.baseUrl).toBe('https://api.example.com');
      expect(cfg.model).toBe('gpt-4o-mini');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('gate2-runner-core: writeReport produces machine-readable JSON and honest MD', () => {
  it('writes JSON and MD with source + passed_live + passed_mock fields', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-out-'));
    try {
      const report: Gate2Report = {
        source: 'mock',
        passed_live: false,
        passed_mock: true,
        toolCalls: 35,
        retries: 1,
        goalDriftDetected: false,
        reviewStatus: 'unavailable',
        startedAt: '2026-06-09T00:00:00Z',
        finishedAt: '2026-06-09T00:01:00Z',
        durationMs: 60_000,
      };
      const jsonPath = join(tmp, 'out.json');
      const mdPath = join(tmp, 'out.md');
      await writeReport(report, jsonPath, mdPath);
      const jsonRaw = await readFile(jsonPath, 'utf8');
      const parsed = JSON.parse(jsonRaw) as Gate2Report;
      expect(parsed.source).toBe('mock');
      expect(parsed.passed_live).toBe(false);
      expect(parsed.passed_mock).toBe(true);

      const mdRaw = await readFile(mdPath, 'utf8');
      expect(mdRaw).toMatch(/source: `mock`/);
      expect(mdRaw).toMatch(/passed_live: `false`/);
      expect(mdRaw).toMatch(/passed_mock: `true`/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('mock report never has passed_live=true', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-out-'));
    try {
      const report: Gate2Report = {
        source: 'mock',
        passed_live: false,
        passed_mock: true,
        toolCalls: 35,
        retries: 0,
        goalDriftDetected: false,
        reviewStatus: 'unavailable',
        startedAt: '2026-06-09T00:00:00Z',
        finishedAt: '2026-06-09T00:01:00Z',
        durationMs: 60_000,
      };
      const jsonPath = join(tmp, 'out.json');
      const mdPath = join(tmp, 'out.md');
      await writeReport(report, jsonPath, mdPath);
      const jsonRaw = await readFile(jsonPath, 'utf8');
      const parsed = JSON.parse(jsonRaw) as Gate2Report;
      // Hard guarantee: source=mock implies passed_live=false
      if (parsed.source === 'mock') {
        expect(parsed.passed_live).toBe(false);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('gate2-runner-core: readTaskConfig', () => {
  it('reads a valid task config', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'task.json');
      await writeFile(
        cfgPath,
        JSON.stringify({ goal: 'fix the bug', workspacePath: '/tmp/ws', maxSteps: 35 }),
        'utf8',
      );
      const task = await readTaskConfig(cfgPath);
      expect(task.goal).toBe('fix the bug');
      expect(task.workspacePath).toBe('/tmp/ws');
      expect(task.maxSteps).toBe(35);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects empty goal', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'task.json');
      await writeFile(cfgPath, JSON.stringify({ goal: '', workspacePath: '/tmp' }), 'utf8');
      await expect(readTaskConfig(cfgPath)).rejects.toThrow(/empty or missing goal/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// D-38 strict LIVE pass rules
// ============================================================================

/** Build a PassedLiveInput that satisfies every condition (the "happy path" baseline). */
function makeLiveInput(overrides: Partial<PassedLiveInput> = {}): PassedLiveInput {
  return {
    source: 'live-llm',
    reviewStatus: 'approve',
    finalResult: 'pass',
    liveError: undefined,
    toolCalls: 42,
    goalDriftDetected: false,
    ...overrides,
  };
}

describe('gate2-runner-core: D-38 strict LIVE pass rules', () => {
  it('passes when review=approve + 42 calls + no drift + no liveError', () => {
    expect(evaluatePassedLive(makeLiveInput())).toBe(true);
  });

  it('fails when goal drift is detected (hard fail, no heuristic override)', () => {
    expect(evaluatePassedLive(makeLiveInput({ goalDriftDetected: true }))).toBe(false);
  });

  it('fails when toolCalls is below the 30-call minimum', () => {
    expect(evaluatePassedLive(makeLiveInput({ toolCalls: 29 }))).toBe(false);
    expect(evaluatePassedLive(makeLiveInput({ toolCalls: 5 }))).toBe(false);
  });

  it('fails when toolCalls is above the 50-call maximum', () => {
    expect(evaluatePassedLive(makeLiveInput({ toolCalls: 51 }))).toBe(false);
    expect(evaluatePassedLive(makeLiveInput({ toolCalls: 100 }))).toBe(false);
  });

  it('fails when review is request_changes', () => {
    expect(evaluatePassedLive(makeLiveInput({ reviewStatus: 'request_changes' }))).toBe(false);
  });

  it('fails when review is unavailable (no gates defined)', () => {
    expect(evaluatePassedLive(makeLiveInput({ reviewStatus: 'unavailable' }))).toBe(false);
  });

  it('fails when liveError is present', () => {
    expect(evaluatePassedLive(makeLiveInput({ liveError: 'LLMAuthError: 401' }))).toBe(false);
  });

  it('fails when finalResult is not "pass" (fail/limit/error/mock)', () => {
    expect(evaluatePassedLive(makeLiveInput({ finalResult: 'fail' }))).toBe(false);
    expect(evaluatePassedLive(makeLiveInput({ finalResult: 'limit' }))).toBe(false);
    expect(evaluatePassedLive(makeLiveInput({ finalResult: 'error' }))).toBe(false);
    expect(evaluatePassedLive(makeLiveInput({ finalResult: 'mock' }))).toBe(false);
  });

  it('mock source NEVER produces passed_live=true', () => {
    // Even with every other condition favorable, source='mock' is a hard fail.
    expect(
      evaluatePassedLive(
        makeLiveInput({
          source: 'mock',
          reviewStatus: 'approve',
          finalResult: 'pass',
          toolCalls: 42,
        }),
      ),
    ).toBe(false);
  });
});

// ============================================================================
// readTaskConfig: reviewGates field must round-trip from JSON
// ============================================================================

describe('gate2-runner-core: readTaskConfig reads reviewGates', () => {
  it('parses reviewGates when present', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'task.json');
      await writeFile(
        cfgPath,
        JSON.stringify({
          goal: 'fix',
          workspacePath: '/tmp/ws',
          maxSteps: 35,
          reviewGates: ['pnpm test', 'pnpm lint'],
        }),
        'utf8',
      );
      const task = await readTaskConfig(cfgPath);
      expect(task.reviewGates).toEqual(['pnpm test', 'pnpm lint']);
      expect(task.goal).toBe('fix');
      expect(task.workspacePath).toBe('/tmp/ws');
      expect(task.maxSteps).toBe(35);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('omits reviewGates when not in the file', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'task.json');
      await writeFile(
        cfgPath,
        JSON.stringify({ goal: 'fix', workspacePath: '/tmp/ws' }),
        'utf8',
      );
      const task = await readTaskConfig(cfgPath);
      expect(task.reviewGates).toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('parses fixture path and round-trips', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'task.json');
      await writeFile(
        cfgPath,
        JSON.stringify({
          goal: 'fix',
          fixture: 'gate2-live/fixture',
          maxSteps: 30,
        }),
        'utf8',
      );
      const task = await readTaskConfig(cfgPath);
      expect(task.fixture).toBe('gate2-live/fixture');
      expect(task.workspacePath).toBeUndefined();
      expect(task.goal).toBe('fix');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects task config with neither workspacePath nor fixture', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
    try {
      const cfgPath = join(tmp, 'task.json');
      await writeFile(cfgPath, JSON.stringify({ goal: 'fix' }), 'utf8');
      await expect(readTaskConfig(cfgPath)).rejects.toThrow(/workspacePath or fixture/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// D-39 Drift detector: legit workflow vs unrelated workflow
// ============================================================================

describe('gate2-runner-live: detectGoalDrift (D-39 multi-signal)', () => {
  it('legitimate calc.ts workflow is NOT drift', async () => {
    const { detectGoalDrift } = await import('../../scripts/gate2-runner-live.js');
    const goal = 'Fix the 3 bugs in src/calc.ts so the test suite passes';
    const workspacePath = 'C:/tmp/gate2-fixt-abc';
    const drift = detectGoalDrift({
      goal,
      expectedFile: 'src/calc.ts',
      workspacePath,
      toolCalls: [
        { toolName: 'bash', args: { command: 'ls' } },
        { toolName: 'read_file', args: { path: 'C:/tmp/gate2-fixt-abc/src/calc.ts' } },
        { toolName: 'read_file', args: { path: 'C:/tmp/gate2-fixt-abc/test/calc.test.ts' } },
        { toolName: 'bash', args: { command: 'pnpm test' } },
        { toolName: 'patch', args: { file: 'src/calc.ts', old: '/* BUG */', new: '' } },
      ],
      assistantContent: [
        'I will fix the bugs in src/calc.ts by reading the test file first.',
      ],
      reviewCommands: ['pnpm test'],
    });
    expect(drift).toBe(false);
  });

  it('unrelated file/task workflow IS drift', async () => {
    const { detectGoalDrift } = await import('../../scripts/gate2-runner-live.js');
    const goal = 'Fix the 3 bugs in src/calc.ts so the test suite passes';
    const drift = detectGoalDrift({
      goal,
      expectedFile: 'src/calc.ts',
      workspacePath: 'C:/tmp/gate2-fixt-abc',
      toolCalls: [
        // None of these touch workspace or expectedFile; no assistant content;
        // no review gate.
        { toolName: 'bash', args: { command: 'echo hello' } },
        { toolName: 'read_file', args: { path: 'C:/Users/butterfly443/Documents/notes.md' } },
        { toolName: 'write_file', args: { path: 'C:/Users/butterfly443/random.txt' } },
      ],
      assistantContent: ['I will check my personal notes first.'],
      reviewCommands: ['pnpm test'],
    });
    expect(drift).toBe(true);
  });

  it('goal keywords in assistant content defeat drift', async () => {
    const { detectGoalDrift } = await import('../../scripts/gate2-runner-live.js');
    const goal = 'Fix the bugs in src/calc.ts so the test suite passes';
    const drift = detectGoalDrift({
      goal,
      workspacePath: 'C:/tmp/abc',
      toolCalls: [{ toolName: 'bash', args: { command: 'ls' } }],
      assistantContent: ['I need to look at the calc.ts file carefully.'],
      reviewCommands: ['pnpm test'],
    });
    expect(drift).toBe(false);
  });

  it('running the review gate alone defeats drift', async () => {
    const { detectGoalDrift } = await import('../../scripts/gate2-runner-live.js');
    const goal = 'Fix the bugs in src/calc.ts';
    const drift = detectGoalDrift({
      goal,
      workspacePath: 'C:/tmp/abc',
      toolCalls: [{ toolName: 'bash', args: { command: 'pnpm test' } }],
      assistantContent: [],
      reviewCommands: ['pnpm test'],
    });
    expect(drift).toBe(false);
  });
});

// ============================================================================
// D-39 materializeFixture
// ============================================================================

describe('gate2-runner-live: materializeFixture (D-39)', () => {
  it('copies a relative fixture path under <pkg>/test/fixtures to a fresh temp dir', async () => {
    const { materializeFixture } = await import('../../scripts/gate2-runner-live.js');
    const tmp = await materializeFixture('gate2-live/fixture');
    try {
      // The fixture should now exist as a fresh temp dir with all files copied
      const { existsSync, statSync } = await import('node:fs');
      expect(existsSync(join(tmp, 'package.json'))).toBe(true);
      expect(existsSync(join(tmp, 'src', 'calc.ts'))).toBe(true);
      expect(existsSync(join(tmp, 'test', 'calc.test.ts'))).toBe(true);
      expect(statSync(join(tmp, 'src', 'calc.ts')).isFile()).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('throws when the fixture path does not exist anywhere', async () => {
    const { materializeFixture } = await import('../../scripts/gate2-runner-live.js');
    await expect(materializeFixture('does/not/exist/at/all')).rejects.toThrow(/fixture not found/);
  });
});
