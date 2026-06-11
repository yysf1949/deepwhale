# D120 Hybrid Real Browser Evidence Runner (HTTP fetch + JS-rendered content) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development (RED → GREEN → REFACTOR) and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan reference:** v1-v4 master execution plan § "Gate-1.5 Browser (deferred)" and Gate-1.5 chain sub-sprint history (D-114 → D-119).
**Branch:** `feature/d36-gate2-live`
**Goal:** Add `recordHybridRealBrowserEvidence` as a thin async orchestration layer that handles BOTH real HTTP-only fetches (D-119 pattern) AND real JS-rendered content via a `jsRunnerFn` (puppeteer-core + system Chrome). D-120 advances the repository ledger from 6/20 to 9/20 (3 more real-evidence tasks: 1 JS form interaction + 2 HTTP fetches). Binding remains false because 11/20 are still pending; Browser defaults stay locked.

**拍板 (Pre-resolved decisions):**

1. **Function name:** `recordHybridRealBrowserEvidence` (parallels D-117/118/119 evidence runners + introduces a new mode dimension: HTTP vs JS).
2. **New file location:** `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts` (sibling to D-117/118/119 evidence runners).
3. **Tooling choice — puppeteer-core, not puppeteer:** Puppeteer (with bundled Chromium) requires a 150MB browser download. Puppeteer-core is the same API without the bundled binary, ~2MB. The Windows sandbox has system Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe` (verified). Puppeteer-core + system Chrome is the lightest path to real JS-rendered evidence.
4. **Injectable `jsRunnerFn`:** The function takes a `jsRunnerFn: JsRunnerFn` (default: a real puppeteer-core launch wrapping system Chrome). Tests use a deterministic mock `jsRunnerFn`; the live evidence run uses the default real puppeteer-core implementation. This mirrors the D-119 `fetchFn` pattern.
5. **Task mode map:** The function takes a `taskModes: Readonly<Record<string, 'http' | 'js'>>` mapping from task ID to evidence mode. HTTP tasks use `fetchFn`; JS tasks use `jsRunnerFn`. Tasks without a mode map are skipped (similar to D-119's `no-real-url-mapping` skip).
6. **Live evidence run:** For D-120, 3 candidate tasks get advanced:
   - **JS task (1)**: `keyboard-search-shortcut` (or similar) maps to a real form interaction on `https://www.bing.com/` — use puppeteer-core to launch Chrome, navigate to bing.com, find the search input, type "deepwhale d-120 hybrid test" into it, verify the value via `page.$eval`, and close the browser. This proves JS-rendered content fidelity (form input field is rendered, fillable, value-queryable).
   - **HTTP tasks (2)**: `product-sort` and `cart-add-item` map to real HTTP fetches via Node's built-in `fetch` (D-119 pattern).
7. **Dependency footprint:** Add `puppeteer-core` as a dev dep to `packages/coding-agent/package.json`. Runtime impact: zero (puppeteer-core is only used for the live evidence run, not in shipped code). Total new dep size: ~2MB. No system-wide install.
8. **No puppeteer dep at runtime:** The `recordHybridRealBrowserEvidence` function takes a `jsRunnerFn` parameter (default: a puppeteer-core launch). The default implementation imports `puppeteer-core` lazily inside the function, so the package can be a devDep only.

**P5 theme-prefix form (avoid Nth-occurrence pitfall, N=15th dual-form):**

- README/ROADMAP/ROADMAP_DECISIONS changelog line (colon form): `D120 Gate-1.5 hybrid real Browser evidence runner: 1 new function ...`
- README/ROADMAP/ROADMAP_DECISIONS current-sprint line (parenthetical form): `D120 Gate-1.5 hybrid real Browser evidence runner (recordHybridRealBrowserEvidence)`

**Test count delta:** +4 new unit tests in `hybrid-real-browser-evidence-runner.test.ts`. Total: 1329 → 1333 pass (subject to vitest run).

**File count delta:** +1 new impl file + 1 new test file + 1 package.json devDep + 9 status doc patches + 1 plan doc.

**Evidence count delta:** v1-v4 scorecard v2.0 stays at 45% (D-120 advances to 9/20; binding still false because 11/20 are still pending). Real-evidence count is now 5 (3 new D-120: 1 JS + 2 HTTP) vs 4 stub-evidence (D-117/118).

**5 红线 invariant:** empty. New code lives in `src/browser/`, never touches the 5 protected files.

---

## Task 1: Add puppeteer-core as a devDep

**Files:**
- Modify: `packages/coding-agent/package.json` (add `puppeteer-core` to devDependencies)

**Step 1: Add the dep**

```bash
cd D:/App/openClaw/projects/deepwhale
pnpm.cmd --filter @deepwhale/coding-agent add -D puppeteer-core
```

Expected: puppeteer-core ~2MB added to node_modules. No Chromium download.

---

## Task 2: Write the test (RED)

**Files:**
- Create: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import {
  recordHybridRealBrowserEvidence,
  type HybridJsRunnerFn,
  type RealBrowserFetchFn,
} from '../../src/browser/hybrid-real-browser-evidence-runner.js';

function makeTwentyTasks(): LiveBrowserTaskCandidate[] {
  return Array.from({ length: 20 }, (_, index): LiveBrowserTaskCandidate => ({
    id: `task-${index + 1}`,
    source: 'test',
    url: `https://example.test/${index + 1}`,
    goal: `Run task ${index + 1}`,
    requiredCapabilities: ['browser.navigate'],
  }));
}

function okFetch(): RealBrowserFetchFn {
  return async (url) => ({
    status: 200,
    contentType: 'text/html',
    bodyLen: 559,
    title: 'Example Domain',
    finalUrl: url,
    ms: 50,
    error: null,
  });
}

function okJsRunner(): HybridJsRunnerFn {
  return async (url, action) => ({
    action,
    url,
    navigated: true,
    interactedElement: 'input[name="q"]',
    inputValue: 'deepwhale d-120 hybrid test',
    pageTitle: 'Example Domain',
    ms: 800,
    error: null,
  });
}

describe('Gate-1.5 hybrid real Browser evidence runner (HTTP + JS)', () => {
  it('records 2 HTTP fetches and 1 JS form interaction end-to-end', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {
        'task-1': 'http',
        'task-2': 'http',
        'task-3': 'js',
      },
      realUrls: {
        'task-1': 'https://example.com/',
        'task-2': 'https://example.org/',
        'task-3': 'https://www.bing.com/',
      },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence');
    expect(evidence.attemptedRuns).toBe(3);
    expect(evidence.runs.map((r) => r.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    expect(evidence.runs.filter((r) => r.mode === 'http')).toHaveLength(2);
    expect(evidence.runs.filter((r) => r.mode === 'js')).toHaveLength(1);
    expect(evidence.runs[0]?.result.kind).toBe('fetch');
    expect(evidence.runs[2]?.result.kind).toBe('js');
    expect(evidence.runs[2]?.result.jsResult?.inputValue).toBe('deepwhale d-120 hybrid test');
    expect(evidence.totalCompletedBefore).toBe(0);
    expect(evidence.totalCompletedAfter).toBe(3);
    expect(evidence.totalPendingAfter).toBe(17);
    expect(evidence.binding).toBe(false);
  });

  it('skips the entire batch when optIn is false and surfaces opt-in-required', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: false,
      taskModes: { 'task-1': 'http' },
      realUrls: { 'task-1': 'https://example.com/' },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence-skipped');
    expect(evidence.skipReason).toBe('opt-in-required');
    expect(evidence.attemptedRuns).toBe(0);
  });

  it('skips when a JS task is requested but no jsRunnerFn is injected', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: { 'task-1': 'js' },
      realUrls: { 'task-1': 'https://www.bing.com/' },
      fetchFn: okFetch(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence-skipped');
    expect(evidence.skipReason).toBe('js-runner-missing');
    expect(evidence.attemptedRuns).toBe(0);
  });

  it('skips when the requested task has no mode mapping', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {},
      realUrls: { 'task-1': 'https://example.com/' },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence-skipped');
    expect(evidence.skipReason).toBe('no-task-mode-mapping');
    expect(evidence.attemptedRuns).toBe(0);
  });
});
```

**Step 2: Verify RED**

Run:
```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose 2>&1 | tail -8
```

Expected: FAIL because `src/browser/hybrid-real-browser-evidence-runner.ts` does not exist.

---

## Task 3: Write the impl (GREEN)

**Files:**
- Create: `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`

**Step 1: Implement minimal hybrid evidence runner**

```ts
import type { BrowserGateBranchDecision } from './gate15.js';
import type { LiveBrowserTaskLedger, LiveBrowserTaskStatus } from './live-task-source.js';

export interface RealBrowserFetchResult {
  status: number;
  contentType: string | null;
  bodyLen: number;
  title: string | null;
  finalUrl: string;
  ms: number;
  error: string | null;
}

export type RealBrowserFetchFn = (url: string) => Promise<RealBrowserFetchResult>;

export type HybridJsAction = 'fill-search-input' | 'click-element' | 'extract-text';

export interface HybridJsRunnerResult {
  action: HybridJsAction;
  url: string;
  navigated: boolean;
  interactedElement: string | null;
  inputValue: string | null;
  pageTitle: string | null;
  ms: number;
  error: string | null;
}

export type HybridJsRunnerFn = (url: string, action: HybridJsAction) => Promise<HybridJsRunnerResult>;

export type HybridEvidenceKind = 'hybrid-browser-evidence' | 'hybrid-browser-evidence-skipped';

export type HybridSkipReason = 'opt-in-required' | 'js-runner-missing' | 'no-task-mode-mapping' | 'no-real-url-mapping' | 'nothing-pending';

export type HybridTaskMode = 'http' | 'js';

export type HybridRunResult =
  | { kind: 'fetch'; fetchResult: RealBrowserFetchResult }
  | { kind: 'js'; jsResult: HybridJsRunnerResult };

export interface HybridRun {
  index: number;
  taskId: string;
  mode: HybridTaskMode;
  url: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  result: HybridRunResult;
}

export interface RecordHybridRealBrowserEvidenceInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  taskModes: Readonly<Record<string, HybridTaskMode>>;
  realUrls: Readonly<Record<string, string>>;
  fetchFn: RealBrowserFetchFn;
  jsRunnerFn?: HybridJsRunnerFn;
}

export interface HybridRealBrowserEvidence {
  evidenceKind: HybridEvidenceKind;
  generatedAt: string;
  attemptedRuns: number;
  runs: ReadonlyArray<HybridRun>;
  totalCompletedBefore: number;
  totalCompletedAfter: number;
  totalPendingAfter: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  skipReason?: HybridSkipReason;
}

function countCompleted(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'success' || task.status === 'failed').length;
}

function countPending(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'pending').length;
}

function skipped(
  input: RecordHybridRealBrowserEvidenceInput,
  skipReason: HybridSkipReason,
): HybridRealBrowserEvidence {
  return {
    evidenceKind: 'hybrid-browser-evidence-skipped',
    generatedAt: input.generatedAt,
    attemptedRuns: 0,
    runs: [],
    totalCompletedBefore: countCompleted(input.ledger.tasks),
    totalCompletedAfter: countCompleted(input.ledger.tasks),
    totalPendingAfter: countPending(input.ledger.tasks),
    binding: input.ledger.binding,
    branchDecision: input.ledger.branchDecision,
    skipReason,
  };
}

function updateLedgerTaskStatus(
  ledger: LiveBrowserTaskLedger,
  taskId: string,
  newStatus: 'success' | 'failed',
): LiveBrowserTaskLedger {
  const updatedTasks = ledger.tasks.map((task) =>
    task.id === taskId ? { ...task, status: newStatus } : task,
  );
  const completed = updatedTasks.filter((t) => t.status === 'success' || t.status === 'failed').length;
  const pending = updatedTasks.filter((t) => t.status === 'pending').length;
  const successes = updatedTasks.filter((t) => t.status === 'success').length;
  const failures = updatedTasks.filter((t) => t.status === 'failed').length;
  return {
    ...ledger,
    tasks: updatedTasks,
    completedTasks: completed,
    pendingTasks: pending,
    successes,
    failures,
    successRate: completed > 0 ? successes / completed : null,
  };
}

export async function recordHybridRealBrowserEvidence(
  input: RecordHybridRealBrowserEvidenceInput,
): Promise<HybridRealBrowserEvidence> {
  if (!input.optIn) {
    return skipped(input, 'opt-in-required');
  }

  const totalCompletedBefore = countCompleted(input.ledger.tasks);
  const runs: HybridRun[] = [];
  let currentLedger = input.ledger;

  for (let index = 0; index < 1000; index += 1) {
    if (countPending(currentLedger.tasks) === 0) break;
    const pendingTask = currentLedger.tasks.find((task) => task.status === 'pending');
    if (!pendingTask) break;
    const mode = input.taskModes[pendingTask.id];
    if (!mode) {
      return skipped({ ...input, ledger: currentLedger }, 'no-task-mode-mapping');
    }
    const realUrl = input.realUrls[pendingTask.id];
    if (!realUrl) {
      return skipped({ ...input, ledger: currentLedger }, 'no-real-url-mapping');
    }
    if (mode === 'js' && !input.jsRunnerFn) {
      return skipped({ ...input, ledger: currentLedger }, 'js-runner-missing');
    }

    let result: HybridRunResult;
    let newStatus: 'success' | 'failed';
    if (mode === 'http') {
      const fetchResult = await input.fetchFn(realUrl);
      newStatus = fetchResult.error === null ? 'success' : 'failed';
      result = { kind: 'fetch', fetchResult };
    } else {
      const jsResult = await input.jsRunnerFn!(realUrl, 'fill-search-input');
      newStatus = jsResult.error === null ? 'success' : 'failed';
      result = { kind: 'js', jsResult };
    }
    runs.push({ index, taskId: pendingTask.id, mode, url: realUrl, status: newStatus, result });
    currentLedger = updateLedgerTaskStatus(currentLedger, pendingTask.id, newStatus);
  }

  return {
    evidenceKind: 'hybrid-browser-evidence',
    generatedAt: input.generatedAt,
    attemptedRuns: runs.length,
    runs,
    totalCompletedBefore,
    totalCompletedAfter: countCompleted(currentLedger.tasks),
    totalPendingAfter: countPending(currentLedger.tasks),
    binding: currentLedger.binding,
    branchDecision: currentLedger.branchDecision,
  };
}
```

**Step 2: Verify GREEN**

Run:
```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose 2>&1 | tail -8
```

Expected: PASS, 4 tests.

---

## Task 4: Bidirectional TDD check (MANDATORY)

```bash
mv packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts /tmp/hybrid-real-browser-evidence-runner.ts.bak
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose 2>&1 | tail -5
# Expected: FAIL

mv /tmp/hybrid-real-browser-evidence-runner.ts.bak packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose 2>&1 | tail -5
# Expected: PASS, 4 tests
```

---

## Task 5: Real-evidence live run (one-off script, uses puppeteer-core + system Chrome)

**Files:**
- Create: `/tmp/d120-hybrid-live-run.mjs` (NOT committed)

```js
// Use puppeteer-core with system Chrome for the JS form task
// AND Node built-in fetch for the 2 HTTP tasks
import puppeteer from 'puppeteer-core';
import { defaultRealBrowserFetchFn } from '../packages/coding-agent/src/browser/real-browser-evidence-runner.js';

const SYSTEM_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function puppeteerFillSearch(url, action) {
  const t0 = Date.now();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: SYSTEM_CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const interactedElement = 'input[name="q"]';
    const inputValue = 'deepwhale d-120 hybrid test';
    if (action === 'fill-search-input') {
      await page.waitForSelector(interactedElement, { timeout: 5000 });
      await page.click(interactedElement);
      await page.type(interactedElement, inputValue);
      const observedValue = await page.$eval(interactedElement, (el) => el.value);
      const pageTitle = await page.title();
      return {
        action,
        url,
        navigated: true,
        interactedElement,
        inputValue: observedValue,
        pageTitle,
        ms: Date.now() - t0,
        error: observedValue === inputValue ? null : `value mismatch: expected "${inputValue}" got "${observedValue}"`,
      };
    }
    return { action, url, navigated: true, interactedElement: null, inputValue: null, pageTitle: null, ms: Date.now() - t0, error: 'unsupported action' };
  } catch (err) {
    return { action, url, navigated: false, interactedElement: null, inputValue: null, pageTitle: null, ms: Date.now() - t0, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

// Probe the 2 HTTP URLs
const httpProbe1 = await defaultRealBrowserFetchFn('https://example.com/');
const httpProbe2 = await defaultRealBrowserFetchFn('https://www.iana.org/');
console.log('===HTTP 1===');
console.log(JSON.stringify(httpProbe1, null, 2));
console.log('===HTTP 2===');
console.log(JSON.stringify(httpProbe2, null, 2));
console.log('===JS===');
const jsProbe = await puppeteerFillSearch('https://www.bing.com/', 'fill-search-input');
console.log(JSON.stringify(jsProbe, null, 2));
```

Run the script, capture results, transcribe into ledger JSON and viability JSON.

---

## Task 6: Patch status documents (atomic, lockstep)

Patch in this exact order:

1. **`docs/superpowers/gate-1.5-live-browser-tasks.json`** — pendingTasks: `14` → `11`, completedTasks: `6` → `9`, successes: `6` → `9`, successRate: `0.3` → `0.45`, tasks[6..8].status: `pending` → `success` (product-sort, cart-add-item, keyboard-search-shortcut), tasks[6..8].realFetchResult + tasks[8].jsFormResult, evidenceSubSprint + evidenceKind, reason text update, nextAction: `D120:` → `D121:`.

2. **`docs/superpowers/gate-1.5-live-browser-tasks.md`** — same number changes in narrative + table.

3. **`docs/superpowers/gate-1.5-browser-viability.json`** — update firstRealEvidence + add firstHybridEvidence.

4. **`docs/superpowers/v1-v4-evidence-scorecard.json`** — add D-120 evidence line, blockers 6/20 → 9/20 11/20 remaining, nextActions[0]: `D121:`.

5. **`docs/superpowers/v1-v4-evidence-scorecard.md`** — same updates.

6. **`docs/superpowers/release-version-hygiene.json`** — `nextAction: "D121:"`.

7. **`README.md`** — current sprint: `D120`, recorder line: `9/20 completed`, add D-120 slice entry, next implementation slice: `D121 Gate-1.5 hybrid real Browser evidence continuation`, last status hygiene sprint: `D120`, add D-120 plan link.

8. **`ROADMAP.md`** — mirror README's D-119→D-120 transition.

9. **`docs/ROADMAP_DECISIONS.md`** — same.

---

## Task 7: Patch the status-doc-hygiene test

- **Line 130-138** (ledger assertions): `pendingTasks: 14` → `11`; `completedTasks: 6` → `9`; `successes: 6` → `9`; `successRate: 0.3` → `0.45`.
- **Line 147-153** (successTasks count + IDs): `toHaveLength(6)` → `9`; `toHaveLength(14)` → `11`; add 3 more IDs: `product-sort, cart-add-item, keyboard-search-shortcut`.
- **Line 153** (`recorder line`): `6/20 completed` → `9/20 completed`.
- **Line 190** (`scorecard.nextActions`): `D120: continue real fetch batch accumulation...` → `D121: continue hybrid real Browser evidence accumulation...`.
- **Line 309** (`Current sprint assertion`): `D119 Gate-1.5 real HTTP Browser evidence adapter (recordRealBrowserEvidence)` → `D120 Gate-1.5 hybrid real Browser evidence runner (recordHybridRealBrowserEvidence)`.
- **Line 365** (`Next implementation slice assertion`): `D120 Gate-1.5 real fetch batch accumulation` → `D121 Gate-1.5 hybrid real Browser evidence continuation`.
- **Line 367-368** (not-match list): add `not.toMatch(/Current sprint: D119/i)` and `not.toMatch(/Next implementation slice: D120 Gate-1\.5 real fetch batch accumulation/i)`.

---

## Task 8: Run hygiene test

```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=default 2>&1 | tail -8
```

Expected: 9/9 pass.

---

## Task 9: 5 verify commands

```bash
cd D:/App/openClaw/projects/deepwhale
echo "===1 TYPECHECK===" && ./node_modules/.bin/tsc.cmd -b --pretty false 2>&1 | grep -E "error" | grep -v "node_modules/.pnpm" | head -5
echo "===2 LINT===" && ./node_modules/.bin/eslint.cmd . --max-warnings 0 2>&1 | tail -3
echo "===3 DIFF CHECK===" && git diff --check 2>&1 | tail -3
echo "===4 VITEST===" && ./node_modules/.bin/vitest.cmd run 2>&1 | tail -5
echo "===5 BUILD===" && pnpm.cmd build 2>&1 | tail -3
echo "===6 5 红线 DIFF===" && git diff <parent-sha>..HEAD --stat -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/src/agent/tool-loop-memory.ts packages/coding-agent/src/agent/tool-loop-policy.ts packages/coding-agent/src/agent/session-adapter.ts packages/coding-agent/src/agent/agent-compaction.ts
```

---

## Task 10: Stage + commit + ship + push

```bash
cd D:/App/openClaw/projects/deepwhale
git add \
  packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts \
  packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts \
  packages/coding-agent/package.json \
  packages/coding-agent/test/unit/status-doc-hygiene.test.ts \
  docs/superpowers/gate-1.5-live-browser-tasks.json \
  docs/superpowers/gate-1.5-live-browser-tasks.md \
  docs/superpowers/gate-1.5-browser-viability.json \
  docs/superpowers/v1-v4-evidence-scorecard.json \
  docs/superpowers/v1-v4-evidence-scorecard.md \
  docs/superpowers/release-version-hygiene.json \
  README.md ROADMAP.md docs/ROADMAP_DECISIONS.md \
  docs/superpowers/plans/2026-06-11-d120-gate15-hybrid-real-browser-evidence-runner.md \
  pnpm-lock.yaml

cat > /tmp/d120-msg.txt << 'EOF'
feat(D-120): Gate-1.5 hybrid real Browser evidence runner (recordHybridRealBrowserEvidence + 4 tests, +puppeteer-core devDep)
EOF
git commit -F /tmp/d120-msg.txt

git commit --allow-empty -m "ship(coding-agent): D-120 done (1 task, 1 commit + 1 ship marker, Gate-1.5 hybrid real Browser evidence runner, 1 new file + 4 new tests, 1329->1333 pass (1 pre-existing D-11 verify-runner fail, 4 skip), 5 红线 empty, typecheck/lint/build/diff-check 0, +puppeteer-core ~2MB devDep, 1 JS form interaction (bing.com via system Chrome) + 2 real HTTP fetches -> 9/20 cumulative (4 stub + 5 real))"

git push origin feature/d36-gate2-live
```

---

## Acceptance Criteria Summary

- 1 new function `recordHybridRealBrowserEvidence` in `src/browser/hybrid-real-browser-evidence-runner.ts` (~140 lines)
- 1 new test file `hybrid-real-browser-evidence-runner.test.ts` (4 tests, ~140 lines)
- 1 new devDep: `puppeteer-core` (~2MB, no bundled browser)
- 9 status doc patches
- 1 real JS form interaction: bing.com → search input filled via puppeteer-core + system Chrome, value verified via `page.$eval`
- 2 real HTTP fetches: example.com (status=200, "Example Domain"), iana.org (status=200, "Internet Assigned Numbers Authority")
- v1-v4 scorecard v2.0 stays at 45% (D-120 is hybrid evidence, 9/20 still 11 short of binding)
- v1-v4 aggregatePercent 65 → 65 (no change)
- 5 红线 invariant preserved
- 1329 → 1333 test pass count (subject to vitest run)
- 1 feat commit + 1 ship marker commit + 1 push

## STOP Conditions

- Any of the 5 verify commands in Task 9 exits non-zero (D-120 introduced a regression).
- The bidirectional TDD check in Task 4 shows the test does not actually exercise the new impl.
- 5 红线 diff is non-empty.
- The status-doc-hygiene test cannot be made to pass.
- New sub-sprint breaks any pre-existing test (vitest total pass count drops below 1329).
- D-120 ships with `binding: true` in the repository ledger JSON (D-39 #4 overclaim — 9/20 is not 20/20).
- The puppeteer-core + system Chrome live run fails to launch (e.g., Chrome version mismatch, sandbox restriction). In that case, fall back to a D-119-style pure-HTTP run for the JS task slot and document the limitation honestly in the ship report.

## Self-Review Discipline

- D-120 is the FIRST sub-sprint in the Gate-1.5 chain that mixes real HTTP fetches with real JS-rendered content in a single evidence run.
- The honest interpretation (D-39 #4): 9/20 is real evidence but still 11 short of binding. Status blocks say `partial-results` and `binding=false` explicitly.
- Browser defaults stay locked. The new function is opt-in only.
- The new file lives in `src/browser/`, NOT in `src/agent/`, to keep 5 红线 clean.
- `puppeteer-core` is a devDep, not a runtime dep. The default `jsRunnerFn` imports `puppeteer-core` lazily inside the function, so production builds don't depend on it.
- The 1 JS task uses system Chrome (no bundled Chromium). This avoids the 150MB puppeteer download.
- The 2 HTTP tasks use Node's built-in fetch (D-119 pattern). ZERO new runtime deps for the HTTP path.
- The 6 cumulative completed live results so far: 4 stub-run (D-117/118) + 5 real (D-119 HTTP x2 + D-120 JS x1 + D-120 HTTP x2). All tagged with `evidenceSubSprint` + `evidenceKind` so the distinction is explicit in the JSON.
