# D72 Release Version Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the release/version ambiguity called out by the v1-v4 scorecard into explicit, machine-readable hygiene evidence without claiming a fresh release gate pass.

**Architecture:** Add a small release/version hygiene report under `docs/superpowers/`, then update current public status blocks and status hygiene tests to point at it. Keep historical release text below current status blocks intact, but ensure current blocks explain that package versions and historical badges are not roadmap maturity proof.

**Tech Stack:** Markdown, JSON, Vitest status-doc hygiene test, pnpm workspace verification commands.

---

## File Structure

- Create `docs/superpowers/release-version-hygiene.json`: machine-readable D72 release/version interpretation.
- Create `docs/superpowers/release-version-hygiene.md`: human-readable companion.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require the hygiene report, D72 current status, D73 next slice, and scorecard nextActions after D72.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: add report pointer, completed D72 slice, and next work D73.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: record D72 evidence and reduce the v1.0 blocker from "noisy" to "fresh release gate still not proven here".

## Task 1: RED Status Test

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Add report assertions**

Add a new test after `keeps README status aligned with machine-readable gate evidence`:

```ts
  it('keeps release/version claims quarantined by a machine-readable hygiene report', () => {
    const report = JSON.parse(readRepoFile('docs/superpowers/release-version-hygiene.json')) as {
      packageVersionLine: string;
      interpretation: {
        packageVersion: string;
        historicalReleaseBadges: string;
        currentRoadmapMaturity: string;
      };
      constraints: string[];
    };
    const reportMd = readRepoFile('docs/superpowers/release-version-hygiene.md');

    expect(report.packageVersionLine).toBe('2.2.0');
    expect(report.interpretation.packageVersion).toBe('package-line-only');
    expect(report.interpretation.historicalReleaseBadges).toBe('historical-context-only');
    expect(report.interpretation.currentRoadmapMaturity).toBe('not-production-complete');
    expect(report.constraints).toContain('Package version 2.2.0 is not roadmap v2.2 maturity proof.');
    expect(report.constraints).toContain('Historical README release badges do not override the current-status block.');
    expect(reportMd).toContain('Package Version Is Not Roadmap Maturity');

    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Release/version hygiene report: docs/superpowers/release-version-hygiene.json');
      expect(block).toContain('Package version 2.2.0 is a package line, not roadmap v2.2 maturity proof.');
    }
  });
```

- [ ] **Step 2: Advance current sprint assertions from D71 to D72**

In the final status test:

```ts
expect(block).toContain('Current sprint: D72 release/version hygiene refresh');
expect(block).toContain('D72 release/version hygiene report');
expect(block).toContain('Next implementation slice: D73 Gate-1.5 live browser task decision');
expect(block).not.toMatch(/Current sprint: D71/i);
expect(block).not.toMatch(/Next implementation slice: D72/i);
```

Update the scorecard nextActions assertions to require D73-D75 and not D72.

- [ ] **Step 3: Run focused RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because the release/version hygiene report does not exist and docs still point to D71/D72.

## Task 2: Release Hygiene Report

**Files:**
- Create: `docs/superpowers/release-version-hygiene.json`
- Create: `docs/superpowers/release-version-hygiene.md`

- [ ] **Step 1: Create JSON report**

Create `docs/superpowers/release-version-hygiene.json` with:

```json
{
  "generatedAt": "2026-06-10T00:00:00.000Z",
  "slice": "D72",
  "branch": "feature/d36-gate2-live",
  "packageVersionLine": "2.2.0",
  "sourceOfTruth": {
    "packageFile": "package.json",
    "currentStatusDocs": [
      "README.md",
      "ROADMAP.md",
      "docs/ROADMAP_DECISIONS.md"
    ],
    "scorecard": "docs/superpowers/v1-v4-evidence-scorecard.json"
  },
  "interpretation": {
    "packageVersion": "package-line-only",
    "historicalReleaseBadges": "historical-context-only",
    "currentRoadmapMaturity": "not-production-complete",
    "freshReleaseGate": "not-proven-in-this-scorecard"
  },
  "constraints": [
    "Package version 2.2.0 is not roadmap v2.2 maturity proof.",
    "Historical README release badges do not override the current-status block.",
    "Future release claims must cite a machine-readable report or verified command output.",
    "v1-v4 remain capability milestones until gate evidence proves completion."
  ],
  "nextAction": "D73: collect or explicitly defer live Gate-1.5 browser tasks before Browser enhancement work."
}
```

- [ ] **Step 2: Create Markdown companion**

Create `docs/superpowers/release-version-hygiene.md` with:

```md
# Release Version Hygiene

Generated: 2026-06-10

## Package Version Is Not Roadmap Maturity

- Package version line: 2.2.0
- Interpretation: package-line-only
- Current roadmap maturity: not-production-complete
- Fresh release gate: not proven in this scorecard

Historical README release badges and older ship notes remain historical context only. The current-status blocks and machine-readable gate reports are the source of truth for current roadmap claims.

## Constraints

- Package version 2.2.0 is not roadmap v2.2 maturity proof.
- Historical README release badges do not override the current-status block.
- Future release claims must cite a machine-readable report or verified command output.
- v1-v4 remain capability milestones until gate evidence proves completion.
```

## Task 3: Docs And Scorecard

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update public current-status blocks**

In all three public docs:

- Change current sprint to `D72 release/version hygiene refresh`.
- Add `- Release/version hygiene report: docs/superpowers/release-version-hygiene.json` near the package version or gate evidence lines.
- Add completed slice `D72 release/version hygiene report: package version and historical release badges are explicitly quarantined from roadmap maturity claims.`
- Change next implementation slice to `D73 Gate-1.5 live browser task decision`.
- Ensure each block contains `Package version 2.2.0 is a package line, not roadmap v2.2 maturity proof.`

In README only:

- Add `D72 plan: docs/superpowers/plans/2026-06-10-d72-release-version-hygiene.md`.
- Add `Release/version hygiene: docs/superpowers/release-version-hygiene.json`.
- Change `Last status hygiene sprint: D71.` to `Last status hygiene sprint: D72.`

- [ ] **Step 2: Update scorecard**

Keep aggregate `48%` and v1.0 `70%`.

Change v1.0 status to:

```json
"mostly implemented coding baseline; release/version claims are quarantined but fresh release gate is not proven here"
```

Add v1.0 evidence:

```json
"D72 release/version hygiene report distinguishes package version from roadmap maturity"
```

Replace the v1.0 blocker `release/version story remains noisy` with:

```json
"fresh release gate is not proven in this scorecard"
```

Change next actions to:

```json
[
  "D73: collect or explicitly defer live Gate-1.5 browser tasks before Browser enhancement work.",
  "D74: continue Code Intel correctness hardening only where tests prove specific behavior.",
  "D75: tighten planner, reviewer, memory, and main-loop integration evidence without expanding default tools."
]
```

Mirror those updates in the Markdown scorecard.

- [ ] **Step 3: Run focused GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 4: Full Verification And Git

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full verification**

Run:

```powershell
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
```

Expected: all commands exit 0.

- [ ] **Step 2: Stage D72 files only**

Run:

```powershell
git add packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/release-version-hygiene.json docs/superpowers/release-version-hygiene.md docs/superpowers/plans/2026-06-10-d72-release-version-hygiene.md
```

Expected: unrelated untracked plan files remain unstaged.

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "docs(D-72): quarantine release version claims"
git push
```

Expected: commit and push succeed on `feature/d36-gate2-live`.

---

## Self-Review

- Spec coverage: D72 addresses release/version hygiene and updates the scorecard without claiming a fresh release gate pass.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: New JSON fields match the status-doc hygiene test.
- Scope guard: No package version bump, no release tag, no v1-v4 completion claim, and no default Browser/Desktop/channel/tool expansion.
