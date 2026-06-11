import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS = ['README.md', 'ROADMAP.md', 'docs/ROADMAP_DECISIONS.md'] as const;
const MOJIBAKE_MARKERS = ['鈥', '锛', '馃', '涓', '寮€', '褰', '鐨', '浠'];

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function currentStatusBlock(text: string): string {
  const match = text.match(/<!-- status:current:start -->([\s\S]*?)<!-- status:current:end -->/);
  if (!match) return '';
  return match[1] ?? '';
}

function isAsciiText(value: string): boolean {
  return Array.from(value).every((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  });
}

describe('status documentation hygiene (D-56)', () => {
  it('keeps public docs anchored by a plain current-status block', () => {
    for (const path of DOCS) {
      const text = readRepoFile(path);
      const block = currentStatusBlock(text);

      expect(block, `${path} missing current status block`).toContain('Current Status');
      expect(isAsciiText(block), `${path} status block should be ASCII-only`).toBe(true);
      const firstScreen = text.split(/\r?\n/).slice(0, 80).join('\n');
      for (const marker of MOJIBAKE_MARKERS) {
        expect(block, `${path} status block contains mojibake marker ${marker}`).not.toContain(marker);
        expect(firstScreen, `${path} first 80 lines contain mojibake marker ${marker}`).not.toContain(marker);
      }
    }
  });

  it('keeps README status aligned with machine-readable gate evidence', () => {
    const readme = currentStatusBlock(readRepoFile('README.md'));
    const gate2 = JSON.parse(readRepoFile('docs/superpowers/gate-2-long-horizon-live.json')) as {
      passed_live: boolean;
      registryProfile?: string;
      toolCalls: number;
    };
    const gate1Targets = JSON.parse(readRepoFile('docs/superpowers/gate-1-preferred-targets.json')) as {
      status: string;
      preferredLoc: number;
      preferredTargets: unknown[];
      bestAvailable?: { name: string; loc: number };
      blocker?: string;
    };
    const gate15 = JSON.parse(readRepoFile('docs/superpowers/gate-1.5-browser-viability.json')) as {
      evidenceKind: string;
      binding: boolean;
      branchDecision: string;
      decision: string;
    };

    expect(readme).toContain('Branch: feature/d36-gate2-live');
    expect(readme).toContain('Package version line: 2.3.0');
    expect(readme).toContain(`Gate-2 live evidence: passed_live=${String(gate2.passed_live)}`);
    expect(readme).toContain(`registryProfile=${gate2.registryProfile ?? 'unknown'}`);
    expect(readme).toContain(`toolCalls=${gate2.toolCalls}`);
    expect(readme).toContain(`Gate-1 preferred status: ${gate1Targets.status}`);
    expect(readme).toContain('preferred-100k is blocked');
    expect(gate1Targets.preferredTargets).toHaveLength(0);
    expect(gate1Targets.blocker).toContain(`preferred ${gate1Targets.preferredLoc} LOC`);
    expect(gate1Targets.blocker).toContain(
      `best local target is ${gate1Targets.bestAvailable?.name ?? 'unknown'} with ${gate1Targets.bestAvailable?.loc ?? 0} LOC`,
    );
    expect(readme).toContain('Gate-1.5 evidence kind: opt-in-first-run-recorded');
    expect(gate15.evidenceKind).toBe('fixture-dry-run');
    expect(readme).toContain(`Gate-1.5 algorithmic decision: ${gate15.decision}`);
    expect(readme).toContain(`Gate-1.5 binding: ${String(gate15.binding)}`);
    expect(readme).toContain(`Gate-1.5 binding branch decision: ${gate15.branchDecision}`);
  });

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

    expect(report.packageVersionLine).toBe('2.3.0');
    expect(report.interpretation.packageVersion).toBe('package-line-only');
    expect(report.interpretation.historicalReleaseBadges).toBe('historical-context-only');
    expect(report.interpretation.currentRoadmapMaturity).toBe('not-production-complete');
    expect(report.constraints).toContain('Package version 2.3.0 is not roadmap v2.3 maturity proof.');
    expect(report.constraints).toContain('Historical README release badges do not override the current-status block.');
    expect(reportMd).toContain('Package Version Is Not Roadmap Maturity');

    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Release/version hygiene report: docs/superpowers/release-version-hygiene.json');
      expect(block).toContain('Package version 2.3.0 is a package line, not roadmap v2.3 maturity proof.');
    }
  });

  it('keeps Gate-1.5 live Browser task evidence deferred until 20 live tasks exist', () => {
    const ledger = JSON.parse(readRepoFile('docs/superpowers/gate-1.5-live-browser-tasks.json')) as {
      evidenceKind: string;
      status: string;
      requiredTasks: number;
      candidateTasks: number;
      pendingTasks: number;
      completedTasks: number;
      successes: number;
      failures: number;
      successRate: number | null;
      binding: boolean;
      branchDecision: string;
      browserEnhancementUnlocked: boolean;
      runnerStatus: string;
      resultRecorderStatus: string;
      reason: string;
      fixtureReport: string;
      tasks: Array<{ id: string; status: string }>;
    };
    const ledgerMd = readRepoFile('docs/superpowers/gate-1.5-live-browser-tasks.md');

    expect(ledger.evidenceKind).toBe('live-browser-task-sourcing-ledger');
    expect(ledger.status).toBe('partial-results');
    expect(ledger.requiredTasks).toBe(20);
    expect(ledger.candidateTasks).toBe(20);
    expect(ledger.pendingTasks).toBe(19);
    expect(ledger.completedTasks).toBe(1);
    expect(ledger.successes).toBe(1);
    expect(ledger.failures).toBe(0);
    expect(ledger.successRate).toBe(0.05);
    expect(ledger.binding).toBe(false);
    expect(ledger.branchDecision).toBe('defer-live-evidence');
    expect(ledger.browserEnhancementUnlocked).toBe(false);
    expect(ledger.runnerStatus).toBe('opt-in-runner-available');
    expect(ledger.resultRecorderStatus).toBe('first-result-recorded');
    expect(ledger.reason).toContain('20 candidate live Browser tasks are queued and an opt-in runner boundary exists');
    expect(ledger.fixtureReport).toBe('docs/superpowers/gate-1.5-browser-viability.json');
    expect(ledger.tasks).toHaveLength(20);
    const successTasks = ledger.tasks.filter((task) => task.status === 'success');
    const pendingTasks = ledger.tasks.filter((task) => task.status === 'pending');
    expect(successTasks).toHaveLength(1);
    expect(pendingTasks).toHaveLength(19);
    expect(successTasks[0]?.id).toBe('docs-search-query');
    expect(ledgerMd).toContain('Live Browser Task Sourcing Queue');

    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json');
      expect(block).toContain(
        'Gate-1.5 live result recorder: 20 candidates queued, 1/20 completed; runnerStatus=opt-in-runner-available; resultRecorderStatus=first-result-recorded; binding=false; Browser enhancement unlocked=false.',
      );
    }
  });

  it('does not overclaim v1-v4 or default non-coding capability exposure', () => {
    const combined = DOCS.map((path) => readRepoFile(path)).join('\n');

    expect(combined).not.toMatch(/v1-v4 production complete/i);
    expect(combined).not.toMatch(/preferred-100k[^.\n]*passed/i);
    expect(combined).not.toMatch(/Browser[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/Desktop[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/Channel[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/media[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/productivity[^.\n]*(is|are) default-enabled/i);
    expect(currentStatusBlock(readRepoFile('README.md'))).toContain(
      'Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.',
    );
    expect(currentStatusBlock(readRepoFile('README.md'))).toContain(
      'v1-v4 are capability milestones, not a production-complete claim.',
    );
  });

  it('keeps the v1-v4 evidence scorecard machine-readable and caveated', () => {
    const scorecard = JSON.parse(readRepoFile('docs/superpowers/v1-v4-evidence-scorecard.json')) as {
      aggregatePercent: number;
      milestones: Array<{ id: string; percent: number; status: string }>;
      caveats: string[];
      nextActions: string[];
    };
    const scorecardMd = readRepoFile('docs/superpowers/v1-v4-evidence-scorecard.md');

    expect(scorecard.aggregatePercent).toBe(65);
    expect(scorecard.milestones.map((m) => m.id)).toEqual(['v1.0', 'v1.5', 'v2.0', 'v2.5', 'v3.0', 'v4.0']);
    expect(scorecard.caveats).toContain('Gate-2 default-profile fixture pass is not v1-v4 production completion.');
    expect(scorecard.caveats).toContain('Gate-1 minimum-50k evidence is not preferred-100k evidence.');
    expect(scorecard.nextActions).toEqual([
      'D118: continue opt-in evidence run to accumulate completed results without unlocking Browser defaults until 20 completed live task results exist.',
      'Continue preferred-100k Gate-1 search only when a local 100K+ target is available.',
      'Keep Gate-2 production, cross-platform Desktop, and cross-platform SIGKILL evidence as separate future blockers rather than inferring them from unit fixtures.',
    ]);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D113:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D96:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D95:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D94:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D93:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D92:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D91:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D90:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D89:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D88:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D87:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D86:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D85:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D84:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D83:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D82:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D81:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D80:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D78:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D77:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D75:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D73:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D72:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D71:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D70:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D68:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D69:/m);
    expect(scorecardMd).toContain('Aggregate evidence-backed progress: 65%');
    expect(scorecardMd).toContain('D67 rename_symbol exposes hashline edit hunks');
    expect(scorecardMd).toContain('D71 covers TypeScript combined default-plus-named import references');
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Current v1-v4 scorecard: docs/superpowers/v1-v4-evidence-scorecard.json');
    }
  });

  it('keeps v1.0 fresh release gate evidence present and machine-readable (D-79)', () => {
    const gate = JSON.parse(readRepoFile('docs/superpowers/v1.0-fresh-release-gate.json')) as {
      subSprint: string;
      packageVersionAfter: string;
      verificationMatrix: {
        typecheck: { exitCode: number; result: string };
        lint: { exitCode: number; result: string };
        test: { exitCode: number; passingTests: number; failingTests: number; result: string };
        build: { exitCode: number; result: string };
        diffCheck: { exitCode: number; result: string };
      };
      fiveRedLines: { preserved: boolean };
      caveats: string[];
    };
    const gateMd = readRepoFile('docs/superpowers/v1.0-fresh-release-gate.md');

    expect(gate.subSprint).toBe('D-79 v1.0 fresh release gate proof');
    expect(gate.packageVersionAfter).toBe('2.3.0');
    expect(gate.verificationMatrix.typecheck.exitCode).toBe(0);
    expect(gate.verificationMatrix.typecheck.result).toBe('pass');
    expect(gate.verificationMatrix.lint.exitCode).toBe(0);
    expect(gate.verificationMatrix.lint.result).toBe('pass');
    expect(gate.verificationMatrix.test.exitCode).toBe(0);
    expect(gate.verificationMatrix.test.passingTests).toBe(1200);
    expect(gate.verificationMatrix.test.failingTests).toBe(1);
    expect(gate.verificationMatrix.build.exitCode).toBe(0);
    expect(gate.verificationMatrix.diffCheck.exitCode).toBe(0);
    expect(gate.fiveRedLines.preserved).toBe(true);
    expect(gate.caveats.some((c) => c.includes('not roadmap v2.3 maturity'))).toBe(true);

    expect(gateMd).toContain('V1.0 Fresh Release Gate Evidence');
    expect(gateMd).toContain('Package version 2.3.0');
    expect(gateMd).toContain('5 红线 Preservation');
    for (const path of DOCS) {
      const text = readRepoFile(path);
      expect(text, `${path} should reference the v1.0 fresh release gate evidence`).toContain(
        'v1.0 fresh release gate: docs/superpowers/v1.0-fresh-release-gate.json',
      );
    }
  });

  it('keeps v5/v6 planning preview gated and machine-readable', () => {
    const preview = JSON.parse(readRepoFile('docs/superpowers/v5-v6-planning-preview.json')) as {
      status: string;
      gates: string[];
      phases: Array<{ id: string; implementationAllowed: boolean; themes: string[] }>;
    };
    const previewMd = readRepoFile('docs/superpowers/v5-v6-planning-preview.md');

    expect(preview.status).toMatch(/^(planning-preview-only|in-progress)$/);
    expect(preview.gates).toContain('v1-v4 evidence gaps must remain explicit before v5/v6 implementation starts');
    expect(preview.phases.map((phase) => phase.id)).toEqual(['v5.0', 'v6.0']);
    // v5.0 implementationAllowed reflects the actual D-87 status (true if first
    // evidence recorded, false if still planning-only). v6.0 remains gated on
    // v5 completion. We assert the invariant "v6.0 cannot start before v5.0".
    const v5Phase = preview.phases.find((p) => p.id === 'v5.0');
    const v6Phase = preview.phases.find((p) => p.id === 'v6.0');
    expect(v5Phase).toBeDefined();
    expect(v6Phase).toBeDefined();
    if (v5Phase?.implementationAllowed === true) {
      // v5.0 ACTIVE: v6.0 must still be gated (entry criteria on v5 completion).
      expect(v6Phase?.implementationAllowed).toBe(false);
      expect(preview.status).toBe('in-progress');
      // firstEvidence must be present.
      expect((v5Phase as { firstEvidence?: string }).firstEvidence).toMatch(/^D-\d+/);
    } else {
      // v5.0 still PLANNING-ONLY: every phase must be gated.
      expect(preview.phases.every((phase) => phase.implementationAllowed === false)).toBe(true);
      expect(preview.status).toBe('planning-preview-only');
    }
    expect(preview.phases[0]?.themes).toContain('production hardening');
    expect(preview.phases[1]?.themes).toContain('collaborative multi-agent operations');
    expect(previewMd).toMatch(/Status:.*(Planning preview only|In progress)/);
  });

  it('keeps the current sprint and next-work pointers aligned after D116', () => {
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));

      expect(block).toContain('Current sprint: D117 Gate-1.5 opt-in live Browser evidence runner (recordOptInLiveBrowserEvidence)');
      expect(block).toContain('D60 rename scanner truthfulness');
      expect(block).toContain('D61 Gate-2 drift prompt hardening');
      expect(block).toContain('D63 Code Intel heuristic metadata');
      expect(block).toContain('D64 registry opt-in loading isolation');
      expect(block).toContain('D65 Code Intel truthfulness metadata');
      expect(block).toContain('D67 rename edit hunks');
      expect(block).toContain('D68 status and v5/v6 planning preview');
      expect(block).toContain('D69 Gate-1 preferred blocker refresh');
      expect(block).toContain('D70 Gate-1.5 Browser decision hygiene');
      expect(block).toContain('D71 Code Intel combined import correctness');
      expect(block).toContain('D72 release/version hygiene report');
      expect(block).toContain('D73 Gate-1.5 live browser task ledger');
      expect(block).toContain('D74 Code Intel default re-export call graph correctness');
      expect(block).toContain('D75 TaskGraph goal recording integration evidence');
      expect(block).toContain('D77 planner main-loop evidence fixture');
      expect(block).toContain('D78 cross-session memory crash/reload evidence');
      expect(block).toContain('D79 v1.0 fresh release gate proof + version bump');
      expect(block).toContain('D80 TaskGraph cross-session persistence evidence');
      expect(block).toContain('D81 v2.5 multi-scenario planner evidence');
      expect(block).toContain('D82 v2.5 investigate-goal scenario fixture');
      expect(block).toContain('D83 v1.0 default registry invariant fixture');
      expect(block).toContain('D84 v1.5 Code Intel re-export chain call graph fixture');
      expect(block).toContain('D85 v3.0 Gate-2 long-horizon boundary fixture');
      expect(block).toContain('D86 v4.0 cross-session multi-hop handoff fixture');
      expect(block).toContain('D87 v5.0 observability+auditability minimal seed');
      expect(block).toContain('D88 v5.0 observability+auditability tool-loop integration');
      expect(block).toContain('D89 v5.0 observability+auditability file-backed persistence');
      expect(block).toContain('D90 v5.0 observability+auditability query side');
      expect(block).toContain('D91 v5.0 plugin governance minimal seed');
      expect(block).toContain('D92 v5.0 plugin governance 2nd evidence');
      expect(block).toContain('D93 v5.0 plugin governance 3rd evidence:');
      expect(block).toContain('D94 v5.0 distribution/upgrade flow 1st evidence:');
      expect(block).toContain('D95 v5.0 distribution/upgrade flow 2nd evidence:');
      expect(block).toContain('D96 v5.0 production hardening 1st evidence:');
      expect(block).toContain('D97 v5.0 production hardening 2nd evidence:');
      expect(block).toContain('D98 v5.0 production hardening 3rd evidence:');
      expect(block).toContain('D99 v5.0 production hardening 4th evidence:');
      expect(block).toContain('D100 v5.0 plugin governance 2nd cycle:');
      expect(block).toContain('D101 v5.0 distribution/upgrade flow 2nd cycle:');
      expect(block).toContain('D102 v5.0 observability+auditability 2nd cycle:');
      expect(block).toContain('D103 v5.0 plugin governance 2nd cycle:');
      expect(block).toContain('D104 v5.0 production hardening 5th evidence:');
      expect(block).toContain('D105 v5.0 cross-theme bridge:');
      expect(block).toContain('D106 v6.0 master plan:');
      expect(block).toContain('D107 v6.0 multi-agent safety seed:');
      expect(block).toContain('D108 v6.0 multi-agent safety seed:');
      expect(block).toContain('D109 v6.0 multi-agent safety seed:');
      expect(block).toContain('D112 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed:');
      expect(block).toContain('D113 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed:');
      expect(block).toContain('D114 Gate-1.5 live Browser task sourcing');
      expect(block).toContain('D115 Gate-1.5 opt-in live Browser task runner');
      expect(block).toContain('D116 Gate-1.5 live Browser result recorder');
      expect(block).toContain('Gate-1.5 evidence kind: opt-in-first-run-recorded');
      expect(block).toContain('Gate-1.5 binding branch decision: defer-live-evidence');
      expect(block).toContain('Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json');
      expect(block).toContain('Next implementation slice: D118 Gate-1.5 opt-in evidence run continuation');
      expect(block).toContain('v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json');
      expect(block).not.toMatch(/Current sprint: D116/i);
      expect(block).not.toMatch(/Next implementation slice: D117 Gate-1\.5 opt-in live Browser evidence run/i);
      expect(block).not.toMatch(/Current sprint: D115/i);
      expect(block).not.toMatch(/Next implementation slice: D116/i);
      expect(block).not.toMatch(/Current sprint: D114/i);
      expect(block).not.toMatch(/Current sprint: D113/i);
      expect(block).not.toMatch(/Next implementation slice: D114 v6\.0/i);
      expect(block).not.toMatch(/Current sprint: D112/i);
      expect(block).not.toMatch(/Next implementation slice: D113/i);
      expect(block).not.toMatch(/Current sprint: D85/i);
      expect(block).not.toMatch(/Next implementation slice: D86/i);
      expect(block).not.toMatch(/Current sprint: D73/i);
      expect(block).not.toMatch(/Next implementation slice: D74/i);
      expect(block).not.toMatch(/Current sprint: D72/i);
      expect(block).not.toMatch(/Next implementation slice: D73/i);
      expect(block).not.toMatch(/Current sprint: D71/i);
      expect(block).not.toMatch(/Next implementation slice: D72/i);
      expect(block).not.toMatch(/Current sprint: D70/i);
      expect(block).not.toMatch(/Next implementation slice: D71/i);
      expect(block).not.toMatch(/Current sprint: D69/i);
      expect(block).not.toMatch(/Next implementation slice: D70/i);
      expect(block).not.toMatch(/Current sprint: D68/i);
      expect(block).not.toMatch(/Next implementation slice: D69/i);
      expect(block).not.toMatch(/Current sprint: D66/i);
      expect(block).not.toMatch(/Next implementation slice: D67/i);
      expect(block).not.toMatch(/Current sprint: D62/i);
      expect(block).not.toMatch(/Next implementation slice: D63/i);
      expect(block).not.toMatch(/Current sprint: D56/i);
      expect(block).not.toMatch(/Next (Work|Roadmap Work|Decisions Needed)[\s\S]*D57:/);
      expect(block).not.toMatch(/Next (Work|Roadmap Work|Decisions Needed)[\s\S]*D58:/);
      expect(block).not.toMatch(/Next (Work|Roadmap Work|Decisions Needed)[\s\S]*D59:/);
    }
  });
});
