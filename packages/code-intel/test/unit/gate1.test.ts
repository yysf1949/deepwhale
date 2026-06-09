import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatGate1Markdown, parseGate1Args, readGate1Scenario, runGate1 } from '../../src/gate1.js';

describe('Gate-1 runner', () => {
  it('fails explicitly when the repository is below the formal LOC floor', async () => {
    const dir = await makeFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 50_000,
        preferredLoc: 100_000,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        requiredCall: { callerSymbol: 'startApp', calleeSymbol: 'createDefaultRegistry' },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      expect(result.passed).toBe(false);
      expect(result.failureReasons).toContain('loc-below-minimum: 16 < 50000');
      expect(result.locQualification).toBe('below-minimum');
      expect(result.metrics.loc).toBe(16);
      expect(result.evidence.entry?.file).toBe('src/registry.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('passes when LOC, entry, call chain, modification point, and timebox evidence are satisfied', async () => {
    const dir = await makeFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 10,
        preferredLoc: 12,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        requiredCall: { callerSymbol: 'startApp', calleeSymbol: 'createDefaultRegistry' },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      expect(result.passed).toBe(true);
      expect(result.failureReasons).toEqual([]);
      expect(result.locQualification).toBe('preferred-100k');
      expect(result.metrics.loc).toBe(16);
      expect(result.evidence.entry).toEqual(
        expect.objectContaining({ file: 'src/registry.ts', symbol: 'createDefaultRegistry' }),
      );
      expect(result.evidence.callChain).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            caller: 'src/app.ts:startApp',
            callee: 'src/registry.ts:createDefaultRegistry',
          }),
        ]),
      );
      expect(result.evidence.modificationPoint).toEqual(
        expect.objectContaining({ file: 'src/registry.ts', symbol: 'createDefaultRegistry' }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not pass when the required call reaches a same-name symbol in the wrong file', async () => {
    const dir = await makeWrongFileCallFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 10,
        preferredLoc: 12,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        entryFile: 'src/registry.ts',
        requiredCall: {
          callerSymbol: 'startApp',
          callerFile: 'src/app.ts',
          calleeSymbol: 'createDefaultRegistry',
          calleeFile: 'src/registry.ts',
        },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      expect(result.passed).toBe(false);
      expect(result.failureReasons).toContain(
        'call-chain-not-found: src/app.ts:startApp -> src/registry.ts:createDefaultRegistry',
      );
      expect(result.evidence.callChain).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails ambiguous entry symbols without an entryFile selector', async () => {
    const dir = await makeWrongFileCallFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 10,
        preferredLoc: 12,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        requiredCall: {
          callerSymbol: 'startApp',
          callerFile: 'src/app.ts',
          calleeSymbol: 'createDefaultRegistry',
          calleeFile: 'src/fake.ts',
        },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      expect(result.passed).toBe(false);
      expect(result.failureReasons).toContain(
        'entry-ambiguous: createDefaultRegistry has 2 declarations; pass entryFile',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('marks a minimum LOC pass that does not reach preferred maturity', async () => {
    const dir = await makeFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 10,
        preferredLoc: 100,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        requiredCall: { callerSymbol: 'startApp', calleeSymbol: 'createDefaultRegistry' },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      expect(result.passed).toBe(true);
      expect(result.locQualification).toBe('minimum-50k');
      expect(formatGate1Markdown(result)).toContain('LOC qualification: minimum-50k');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serializes LOC qualification into Gate-1 JSON evidence', async () => {
    const dir = await makeFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 10,
        preferredLoc: 100,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        requiredCall: { callerSymbol: 'startApp', calleeSymbol: 'createDefaultRegistry' },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      const parsed = JSON.parse(JSON.stringify(result)) as { locQualification?: string };
      expect(parsed.locQualification).toBe('minimum-50k');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renders below-minimum LOC qualification in markdown evidence', async () => {
    const dir = await makeFixtureRepo();
    try {
      const result = await runGate1({
        repoPath: dir,
        minLoc: 50_000,
        preferredLoc: 100_000,
        timeboxMs: 20 * 60 * 1000,
        entrySymbol: 'createDefaultRegistry',
        requiredCall: { callerSymbol: 'startApp', calleeSymbol: 'createDefaultRegistry' },
        modificationPoint: { file: 'src/registry.ts', symbol: 'createDefaultRegistry' },
      });

      expect(formatGate1Markdown(result)).toContain('LOC qualification: below-minimum');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads scenario JSON into Gate-1 options', async () => {
    const dir = await makeFixtureRepo();
    try {
      const scenarioPath = resolve(dir, 'gate1.scenario.json');
      await writeFile(
        scenarioPath,
        JSON.stringify(
          {
            repoPath: '.',
            minLoc: 10,
            preferredLoc: 12,
            timeboxMs: 1200000,
            maxDepth: 6,
            entrySymbol: 'createDefaultRegistry',
            entryFile: 'src/registry.ts',
            requiredCall: {
              callerSymbol: 'startApp',
              callerFile: 'src/app.ts',
              calleeSymbol: 'createDefaultRegistry',
              calleeFile: 'src/registry.ts',
            },
            modificationPoint: {
              file: 'src/registry.ts',
              symbol: 'createDefaultRegistry',
            },
          },
          null,
          2,
        ),
      );

      const options = await readGate1Scenario(scenarioPath);

      expect(options).toEqual({
        repoPath: dir,
        minLoc: 10,
        preferredLoc: 12,
        timeboxMs: 1200000,
        maxDepth: 6,
        entrySymbol: 'createDefaultRegistry',
        entryFile: 'src/registry.ts',
        requiredCall: {
          callerSymbol: 'startApp',
          callerFile: 'src/app.ts',
          calleeSymbol: 'createDefaultRegistry',
          calleeFile: 'src/registry.ts',
        },
        modificationPoint: {
          file: 'src/registry.ts',
          symbol: 'createDefaultRegistry',
        },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads scenario JSON with a UTF-8 BOM', async () => {
    const dir = await makeFixtureRepo();
    try {
      const scenarioPath = resolve(dir, 'gate1.scenario.json');
      await writeFile(
        scenarioPath,
        `\uFEFF${JSON.stringify({
          repoPath: '.',
          minLoc: 10,
          entrySymbol: 'createDefaultRegistry',
          requiredCall: {
            callerSymbol: 'startApp',
            calleeSymbol: 'createDefaultRegistry',
          },
          modificationPoint: {
            file: 'src/registry.ts',
            symbol: 'createDefaultRegistry',
          },
        })}`,
      );

      await expect(readGate1Scenario(scenarioPath)).resolves.toEqual(
        expect.objectContaining({
          repoPath: dir,
          minLoc: 10,
          entrySymbol: 'createDefaultRegistry',
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parses CLI args into Gate-1 options and output paths', () => {
    const parsed = parseGate1Args([
      '--repo',
      'C:/work/repo',
      '--entry',
      'createDefaultRegistry',
      '--entry-file',
      'packages/coding-agent/src/tools/registry.ts',
      '--caller',
      'runAgentTurn',
      '--caller-file',
      'packages/coding-agent/src/agent/tool-loop.ts',
      '--callee',
      'createDefaultRegistry',
      '--callee-file',
      'packages/coding-agent/src/tools/registry.ts',
      '--mod-file',
      'packages/coding-agent/src/tools/registry.ts',
      '--mod-symbol',
      'createDefaultRegistry',
      '--min-loc',
      '50000',
      '--preferred-loc',
      '100000',
      '--timebox-ms',
      '1200000',
      '--max-depth',
      '9',
      '--json',
      'docs/superpowers/gate.json',
      '--md',
      'docs/superpowers/gate.md',
    ]);

    expect(parsed).toEqual({
      options: {
        repoPath: resolve('C:/work/repo'),
        entrySymbol: 'createDefaultRegistry',
        entryFile: 'packages/coding-agent/src/tools/registry.ts',
        requiredCall: {
          callerSymbol: 'runAgentTurn',
          callerFile: 'packages/coding-agent/src/agent/tool-loop.ts',
          calleeSymbol: 'createDefaultRegistry',
          calleeFile: 'packages/coding-agent/src/tools/registry.ts',
        },
        modificationPoint: {
          file: 'packages/coding-agent/src/tools/registry.ts',
          symbol: 'createDefaultRegistry',
        },
        minLoc: 50000,
        preferredLoc: 100000,
        timeboxMs: 1200000,
        maxDepth: 9,
      },
      jsonOut: 'docs/superpowers/gate.json',
      mdOut: 'docs/superpowers/gate.md',
    });
  });
});

async function makeFixtureRepo(): Promise<string> {
  const dir = await mkdir(resolve(tmpdir(), `dw-gate1-${Date.now()}-${Math.random().toString(16).slice(2)}`), {
    recursive: true,
  });
  const src = resolve(dir, 'src');
  await mkdir(src, { recursive: true });
  await writeFile(
    resolve(src, 'registry.ts'),
    [
      'export function createDefaultRegistry() {',
      "  const tools = ['read_file', 'grep'];",
      "  tools.push('bash');",
      '  return tools;',
      '}',
      '',
      'export function registerProfiles() {',
      '  return createDefaultRegistry();',
      '}',
    ].join('\n'),
  );
  await writeFile(
    resolve(src, 'app.ts'),
    [
      "import { createDefaultRegistry } from './registry.js';",
      '',
      'export function startApp() {',
      '  const registry = createDefaultRegistry();',
      '  return registry.length;',
      '}',
      '',
      'export function unrelated() {',
      '  return 1;',
      '}',
    ].join('\n'),
  );
  return dir;
}

async function makeWrongFileCallFixtureRepo(): Promise<string> {
  const dir = await mkdir(resolve(tmpdir(), `dw-gate1-wrong-call-${Date.now()}-${Math.random().toString(16).slice(2)}`), {
    recursive: true,
  });
  const src = resolve(dir, 'src');
  await mkdir(src, { recursive: true });
  await writeFile(
    resolve(src, 'registry.ts'),
    [
      'export function createDefaultRegistry() {',
      "  return ['read_file'];",
      '}',
      '',
      'export function intendedCaller() {',
      '  return createDefaultRegistry();',
      '}',
    ].join('\n'),
  );
  await writeFile(
    resolve(src, 'fake.ts'),
    [
      'export function createDefaultRegistry() {',
      "  return ['fake'];",
      '}',
    ].join('\n'),
  );
  await writeFile(
    resolve(src, 'app.ts'),
    [
      "import { createDefaultRegistry } from './fake.js';",
      '',
      'export function startApp() {',
      '  return createDefaultRegistry().length;',
      '}',
    ].join('\n'),
  );
  return dir;
}
