# D49 Gate1 Symbol Identity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Gate-1 from passing on same-name false positives by binding entry, caller, callee, and modification evidence to concrete file-qualified symbol identities.

**Architecture:** Keep the existing Gate-1 runner shape and add optional file selectors instead of replacing the CLI. Unique-symbol scenarios remain compatible. Ambiguous symbols without explicit file selectors fail with machine-readable failure reasons, and refreshed Gate-1 evidence must pass with file selectors.

**Tech Stack:** TypeScript, Vitest, `tsx`, `@deepwhale/code-intel`, PowerShell on Windows.

---

## Current Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*` and the untracked master plan unless intentionally adopted in a separate documentation slice.
- Do not alter LOC thresholds, Gate-1 pass rules, or Gate-2 hard conditions to make evidence pass.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or other non-coding tools to the default registry.
- Use TDD for all behavior changes.

## Files

- Modify: `packages/code-intel/src/gate1.ts`
  - Add file selectors to `Gate1Options`.
  - Require selectors when Gate-1 symbols are ambiguous.
  - Match call-chain evidence by file-qualified symbol ids when selectors are present.
  - Include symbol ids in `Gate1SymbolEvidence`.
- Modify: `packages/code-intel/test/unit/gate1.test.ts`
  - Add false-positive RED tests for same-name entry and wrong-file call chains.
  - Update CLI/scenario parsing tests for selector fields.
- Modify: `packages/code-intel/scripts/gate1-current-workspace.mjs`
  - Add default `entryFile`, `callerFile`, and `calleeFile` so current-workspace Gate-1 does not rely on names only.
- Potentially modify: `docs/superpowers/gate-1-vite-result.json`
- Potentially modify: `docs/superpowers/gate-1-vite-result.md`
  - Refresh Vite minimum-50K evidence with file selectors after code is green.
- Create: `docs/superpowers/plans/2026-06-10-d49-gate1-symbol-identity-hardening.md`

## Task 1: RED Tests For Same-Name False Passes

- [x] **Step 1: Add a wrong-file call-chain fixture helper**

Modify `packages/code-intel/test/unit/gate1.test.ts` by adding this helper near `makeFixtureRepo()`:

```ts
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
```

- [x] **Step 2: Add a RED test that refuses a wrong-file callee**

Add this test to `packages/code-intel/test/unit/gate1.test.ts`:

```ts
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
```

- [x] **Step 3: Add a RED test that requires an entry file for ambiguous symbols**

Add this test:

```ts
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
```

- [x] **Step 4: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1.test.ts
```

Expected before implementation: TypeScript or test failure because `entryFile`, `callerFile`, and `calleeFile` are not supported yet, or because the wrong-file call still passes by name.

Execution note: RED verified. `.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1.test.ts` failed with 2 failing tests; both new cases received `result.passed === true`, proving Gate-1 still passed by symbol name despite same-name wrong-file evidence.

## Task 2: Implement File-Qualified Gate-1 Selectors

- [x] **Step 1: Extend option types**

Modify `packages/code-intel/src/gate1.ts`:

```ts
export interface Gate1Options {
  repoPath: string;
  minLoc?: number;
  preferredLoc?: number;
  timeboxMs?: number;
  maxDepth?: number;
  entrySymbol: string;
  entryFile?: string;
  requiredCall: {
    callerSymbol: string;
    callerFile?: string;
    calleeSymbol: string;
    calleeFile?: string;
  };
  modificationPoint: {
    file: string;
    symbol: string;
  };
}

export interface Gate1SymbolEvidence {
  id: string;
  file: string;
  symbol: string;
  line: number;
  col: number;
  kind: Reference['kind'];
}
```

- [x] **Step 2: Add selector helpers**

Add helpers in `packages/code-intel/src/gate1.ts`:

```ts
interface Gate1SymbolSelector {
  symbol: string;
  file?: string;
}

function normalizeGateFile(file: string | undefined): string | undefined {
  return file?.split(/[\\/]+/).join('/');
}

function declarationIdsForSymbol(graph: Awaited<ReturnType<typeof buildSymbolGraph>>, symbol: string): string[] {
  const ids: string[] = [];
  for (const [filePath, fileSym] of graph.files) {
    for (const s of fileSym.symbols) {
      if (s.name === symbol) ids.push(`${filePath}:${s.scope ? `${s.scope}.` : ''}${s.name}`);
    }
  }
  return ids;
}

function symbolIdFile(id: string): string {
  return id.split(':')[0] ?? '';
}

function symbolIdMatches(id: string, selector: Gate1SymbolSelector): boolean {
  if (symbolIdName(id) !== selector.symbol) return false;
  const file = normalizeGateFile(selector.file);
  return file === undefined || symbolIdFile(id) === file;
}
```

- [x] **Step 3: Replace name-only entry selection**

Replace `firstSymbolEvidence()` with selector-aware logic:

```ts
function selectSymbolEvidence(
  graph: Awaited<ReturnType<typeof buildSymbolGraph>>,
  refs: Reference[] | undefined,
  selector: Gate1SymbolSelector,
  label: string,
): { evidence?: Gate1SymbolEvidence; failureReason?: string } {
  const declarations = (refs ?? []).filter((candidate) => candidate.kind === 'declaration');
  const file = normalizeGateFile(selector.file);
  const matches = file === undefined ? declarations : declarations.filter((candidate) => candidate.file === file);
  if (matches.length === 0) {
    const target = file ? `${file}:${selector.symbol}` : selector.symbol;
    return { failureReason: `${label}-not-found: ${target}` };
  }
  if (file === undefined && matches.length > 1) {
    return { failureReason: `${label}-ambiguous: ${selector.symbol} has ${matches.length} declarations; pass ${label}File` };
  }
  const ref = matches[0]!;
  return {
    evidence: {
      id: `${ref.file}:${ref.scope ? `${ref.scope}.` : ''}${selector.symbol}`,
      file: ref.file,
      symbol: selector.symbol,
      line: ref.line,
      col: ref.col,
      kind: ref.kind,
    },
  };
}
```

- [x] **Step 4: Match call-chain edges by selector**

In `runGate1()`, build selectors and filter edges with `symbolIdMatches()`:

```ts
const entrySelector = { symbol: options.entrySymbol, file: options.entryFile };
const callerSelector = { symbol: options.requiredCall.callerSymbol, file: options.requiredCall.callerFile };
const calleeSelector = { symbol: options.requiredCall.calleeSymbol, file: options.requiredCall.calleeFile };

const entrySelection = selectSymbolEvidence(graph, graph.byName.get(options.entrySymbol), entrySelector, 'entry');
const callSelectorFailures = validateRequiredCallSelectors(graph, callerSelector, calleeSelector);
const callChain = callSelectorFailures.length > 0
  ? []
  : callGraph.edges.filter((edge) => symbolIdMatches(edge.caller, callerSelector) && symbolIdMatches(edge.callee, calleeSelector));
```

Add `validateRequiredCallSelectors()`:

```ts
function validateRequiredCallSelectors(
  graph: Awaited<ReturnType<typeof buildSymbolGraph>>,
  caller: Gate1SymbolSelector,
  callee: Gate1SymbolSelector,
): string[] {
  const failures: string[] = [];
  for (const [label, selector] of [['required-call-caller', caller], ['required-call-callee', callee]] as const) {
    const ids = declarationIdsForSymbol(graph, selector.symbol).filter((id) => symbolIdMatches(id, selector));
    if (ids.length === 0) {
      const file = normalizeGateFile(selector.file);
      failures.push(`${label}-not-found: ${file ? `${file}:` : ''}${selector.symbol}`);
    } else if (selector.file === undefined && ids.length > 1) {
      failures.push(`${label}-ambiguous: ${selector.symbol} has ${ids.length} declarations; pass ${label === 'required-call-caller' ? 'callerFile' : 'calleeFile'}`);
    }
  }
  return failures;
}
```

- [x] **Step 5: Update failure reasons**

In `runGate1()`, add selector failures before the existing call-chain failure:

```ts
if (entrySelection.failureReason) failureReasons.push(entrySelection.failureReason);
for (const reason of callSelectorFailures) failureReasons.push(reason);
if (callSelectorFailures.length === 0 && callChain.length === 0) {
  failureReasons.push(`call-chain-not-found: ${formatSelector(callerSelector)} -> ${formatSelector(calleeSelector)}`);
}
```

Add:

```ts
function formatSelector(selector: Gate1SymbolSelector): string {
  const file = normalizeGateFile(selector.file);
  return file ? `${file}:${selector.symbol}` : selector.symbol;
}
```

- [x] **Step 6: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1.test.ts
```

Expected: all Gate-1 unit tests pass.

Execution note: GREEN verified. `.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1.test.ts` passed with 1 file and 10 tests. `.\node_modules\.bin\tsc.cmd -b packages/code-intel` also passed.

## Task 3: CLI And Scenario Selector Support

- [x] **Step 1: Add scenario parsing tests**

Update the existing `reads scenario JSON into Gate-1 options` test to include:

```ts
entryFile: 'src/registry.ts',
requiredCall: {
  callerSymbol: 'startApp',
  callerFile: 'src/app.ts',
  calleeSymbol: 'createDefaultRegistry',
  calleeFile: 'src/registry.ts',
},
```

Update the expected object to include those fields.

- [x] **Step 2: Add CLI parsing tests**

Update the existing `parses CLI args into Gate-1 options and output paths` test by adding flags:

```ts
'--entry-file',
'packages/coding-agent/src/tools/registry.ts',
'--caller-file',
'packages/coding-agent/src/agent/tool-loop.ts',
'--callee-file',
'packages/coding-agent/src/tools/registry.ts',
```

Update the expected `parsed.options` object to include:

```ts
entryFile: 'packages/coding-agent/src/tools/registry.ts',
requiredCall: {
  callerSymbol: 'runAgentTurn',
  callerFile: 'packages/coding-agent/src/agent/tool-loop.ts',
  calleeSymbol: 'createDefaultRegistry',
  calleeFile: 'packages/coding-agent/src/tools/registry.ts',
},
```

- [x] **Step 3: Implement parser support**

Modify `readGate1Scenario()`:

```ts
entryFile: optionalString(scenario, 'entryFile'),
requiredCall: {
  callerSymbol: requiredString(asRecord(scenario.requiredCall, 'requiredCall'), 'callerSymbol'),
  callerFile: optionalString(asRecord(scenario.requiredCall, 'requiredCall'), 'callerFile'),
  calleeSymbol: requiredString(asRecord(scenario.requiredCall, 'requiredCall'), 'calleeSymbol'),
  calleeFile: optionalString(asRecord(scenario.requiredCall, 'requiredCall'), 'calleeFile'),
},
```

Modify `parseGate1Args()` to read `entry-file`, `caller-file`, and `callee-file`, then include them only when provided.

Add:

```ts
function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`gate1-scenario-invalid-string: ${key}`);
  }
  return value;
}
```

- [x] **Step 4: Update default current-workspace Gate-1 command**

Modify `packages/code-intel/scripts/gate1-current-workspace.mjs`:

```js
entryFile: 'packages/coding-agent/src/tools/registry.ts',
requiredCall: {
  callerSymbol: 'runAgentTurn',
  callerFile: 'packages/coding-agent/src/agent/tool-loop.ts',
  calleeSymbol: 'createDefaultRegistry',
  calleeFile: 'packages/coding-agent/src/tools/registry.ts',
},
```

- [x] **Step 5: Run tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts
```

Expected: pass.

Execution note: selector parser/default command tests passed as part of `gate1.test.ts`; wider Gate-1 target suite passed with 3 files and 15 tests.

## Task 4: Refresh Gate-1 Evidence

- [x] **Step 1: Refresh Vite Gate-1 minimum evidence with selectors**

Run:

```powershell
.\node_modules\.bin\tsx.cmd packages/code-intel/scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --entry-file packages/vite/src/node/server/index.ts --caller createServer --caller-file packages/vite/src/node/server/index.ts --callee _createServer --callee-file packages/vite/src/node/server/index.ts --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md
```

Expected: exit code `0`; JSON has `"passed": true`, `"locQualification": "minimum-50k"`, and call-chain evidence with caller/callee ids in `packages/vite/src/node/server/index.ts`.

Execution note: Vite Gate-1 evidence refreshed with file selectors. Result: `passed=true`, LOC `86216`, `locQualification=minimum-50k`, call chain `packages/vite/src/node/server/index.ts:createServer -> packages/vite/src/node/server/index.ts:_createServer`.

- [x] **Step 2: Verify preferred-100K status remains honest**

Run:

```powershell
.\node_modules\.bin\tsx.cmd packages/code-intel/scripts/gate1-target-inventory.mjs --targets-root .gate-targets --json docs/superpowers/gate-1-preferred-targets.json --md docs/superpowers/gate-1-preferred-targets.md
```

Expected: exit code `0`; current status remains `minimum-only` unless a 100K+ target has been added outside this task.

Execution note: target inventory stayed honest: `status=minimum-only`, `preferredTargets=0`.

## Task 5: Verification, Commit, Push

- [x] **Step 1: Run targeted verification**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts packages/code-intel/test/unit/gate1-targets.test.ts
```

Expected: pass.

Execution note: targeted verification passed with 3 files and 15 tests.

- [x] **Step 2: Run repository verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
git status --short --branch
```

Expected: typecheck, lint, tests, and diff check pass. If `pnpm.cmd test` fails in sandbox with a fetch/network error, rerun the same command with approval and record both outputs.

Execution notes:

- `.\node_modules\.bin\tsc.cmd -b`: passed.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: passed.
- `git diff --check`: clean.
- `pnpm.cmd test` in sandbox: failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of `pnpm.cmd test`: passed with 194 test files (193 passed, 1 skipped) and 1156 tests (1152 passed, 4 skipped).

- [ ] **Step 3: Stage only D49 files**

Run:

```powershell
git add docs/superpowers/plans/2026-06-10-d49-gate1-symbol-identity-hardening.md packages/code-intel/src/gate1.ts packages/code-intel/test/unit/gate1.test.ts packages/code-intel/scripts/gate1-current-workspace.mjs docs/superpowers/gate-1-vite-result.json docs/superpowers/gate-1-vite-result.md docs/superpowers/gate-1-preferred-targets.json docs/superpowers/gate-1-preferred-targets.md
```

- [ ] **Step 4: Commit and push**

Run:

```powershell
git commit -m "fix(D-49): harden Gate-1 symbol identity"
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- This plan does not claim preferred-100K Gate-1 pass.
- This plan does not unlock Browser, Desktop, Channel, media, productivity, or marketplace tools.
- This plan preserves unique-symbol backwards compatibility while making ambiguous Gate-1 evidence fail until selectors are provided.
- This plan strengthens evidence quality instead of adjusting thresholds.
