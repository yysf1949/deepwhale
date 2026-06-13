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
    expect(readme).toContain('preferred-passed');
    expect(gate1Targets.preferredTargets.length).toBeGreaterThan(0);
    expect(readme).toContain('Gate-1.5 evidence kind: live-browser');
    expect(gate15.evidenceKind).toBe('live-browser');
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
      slice: string;
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
      nextAction: string;
      fixtureReport: string;
      tasks: Array<{ id: string; status: string; evidenceSubSprint?: string }>;
    };
    const ledgerMd = readRepoFile('docs/superpowers/gate-1.5-live-browser-tasks.md');

    expect(ledger.evidenceKind).toBe('live-browser-task-sourcing-ledger');
    expect(ledger.slice).toBe('D125');
    expect(ledger.status).toBe('ready-for-binding-decision');
    expect(ledger.requiredTasks).toBe(20);
    expect(ledger.candidateTasks).toBe(20);
    expect(ledger.pendingTasks).toBe(0);
    expect(ledger.completedTasks).toBe(20);
    expect(ledger.successes).toBe(20);
    expect(ledger.failures).toBe(0);
    expect(ledger.successRate).toBe(1);
    expect(ledger.binding).toBe(true);
    expect(ledger.branchDecision).toBe('continue-browser-enhancement');
    expect(ledger.browserEnhancementUnlocked).toBe(true);
    expect(ledger.runnerStatus).toBe('opt-in-runner-available');
    expect(ledger.resultRecorderStatus).toBe('all-recorded');
    expect(ledger.reason).toContain('20 candidate live Browser tasks are queued and all 20 have been recorded as completed');
    expect(ledger.nextAction).toContain('Gate-1.5 binding achieved');
    expect(ledger.fixtureReport).toBe('docs/superpowers/gate-1.5-browser-viability.json');
    expect(ledger.tasks).toHaveLength(20);
    const successTasks = ledger.tasks.filter((task) => task.status === 'success');
    const pendingTasks = ledger.tasks.filter((task) => task.status === 'pending');
    expect(successTasks).toHaveLength(20);
    expect(pendingTasks).toHaveLength(0);
    expect(successTasks.map((t) => t.id)).toEqual([
      'docs-search-query',
      'docs-filter-results',
      'account-login-form',
      'contact-form-required-field',
      'newsletter-signup',
      'product-search',
      'product-sort',
      'cart-add-item',
      'cart-update-quantity',
      'checkout-address-validation',
      'table-filter',
      'table-pagination',
      'keyboard-search-shortcut',
      'settings-toggle',
      'profile-edit',
      'modal-open-close',
      'tabs-switch',
      'breadcrumb-navigation',
      'download-link-detection',
      'error-page-recovery',
    ]);
    expect(pendingTasks.map((t) => t.id)).toEqual([]);
    const d125Tasks = successTasks.filter((t) => t.evidenceSubSprint === 'D-125');
    expect(d125Tasks.map((t) => t.id).sort()).toEqual([
      'breadcrumb-navigation',
      'download-link-detection',
      'error-page-recovery',
      'modal-open-close',
      'profile-edit',
      'settings-toggle',
      'tabs-switch',
    ]);
    expect(ledgerMd).toContain('Live Browser Task Sourcing Queue');

    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json');
      expect(block).toContain(
        'Gate-1.5 live result recorder: 20 candidates queued, 20/20 completed; runnerStatus=opt-in-runner-available; resultRecorderStatus=all-recorded; binding=true; Browser enhancement unlocked=true.',
      );
    }
  });

  it('does not overclaim v1-v4 or default non-coding capability exposure', () => {
    const combined = DOCS.map((path) => readRepoFile(path)).join('\n');

    expect(combined).not.toMatch(/v1-v4 production complete/i);
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

    expect(scorecard.aggregatePercent).toBe(73);
    expect(scorecard.milestones.map((m) => m.id)).toEqual(['v1.0', 'v1.5', 'v2.0', 'v2.5', 'v3.0', 'v4.0']);
    expect(scorecard.caveats).toContain('Gate-2 default-profile fixture pass is not v1-v4 production completion.');
    expect(scorecard.caveats).toContain('Gate-1 preferred-100k now PASSES; Gate-1 minimum-50k evidence is a separate pass.');
    expect(scorecard.nextActions).toEqual([
      'Gate-1 preferred-100k now PASSES (D141); continue broadening Gate-1 evidence with additional 100K+ targets when available.',
      'Gate-2 multi-scenario evidence expanded to 5 scenarios (D142); keep Gate-2 production long-horizon proof as a separate future blocker rather than inferring it from replay fixtures.',
      'Agent OS orchestration now has integration tests (D143); expand orchestration evidence with broader task lifecycle scenarios.',
      'v5/v6 seed work continues on production hardening bootstrap (D-139), trace span observability (D-137), and distributed coordination (D-138) while v1-v4 completion remains gate-driven.',
    ]);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D135:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D134:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D131:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D130:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D129:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D128:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D127:/m);
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
    expect(scorecardMd).toContain('Aggregate evidence-backed progress: 73%');
    expect(scorecardMd).toContain('D67 rename_symbol exposes hashline edit hunks');
    expect(scorecardMd).toContain('D71 covers TypeScript combined default-plus-named import references');
    expect(scorecardMd).toContain('D126 implements the first Browser Tier-1 foundation slice');
    expect(scorecardMd).toContain('D127 adds explainable Memory Ranking and deterministic Code Intel semantic fallback evidence');
    expect(scorecardMd).toContain('D128 adds a machine-readable v2.0 Tier-1 precheck');
    expect(scorecardMd).toContain('D129 adds a production Browser proof recorder with an injected adapter contract');
    expect(scorecardMd).toContain('D130 closes the v2.0 Tier-2 Compaction row');
    expect(scorecardMd).toContain('D131 closes the v2.0 Tier-2 MCP Runtime row');
    expect(scorecardMd).toContain('D132 closes the v2.0 Tier-2 Automation row');
    expect(scorecardMd).toContain('D133 closes the v2.0 Tier-2 Remote TUI row');
    expect(scorecardMd).toContain('D134 adds a machine-readable v3/v4 production precheck');
    expect(scorecardMd).toContain('D135 v3 production breadth replay evidence');
    expect(scorecardMd).toContain('D136 closes the v4-cross-platform-sigkill blocker');
    expect(scorecardMd).toContain('D137 adds v5.0 observability 3rd cycle trace span seed');
    expect(scorecardMd).toContain('D138 adds v6.0 Theme 3 (distributed coordination) seed');
    expect(scorecardMd).toContain('D139 adds v5.0 production hardening bootstrap');
    expect(scorecardMd).toContain('D141 advances Gate-1 preferred-100k');
    expect(scorecardMd).toContain('D142 expands Gate-2 multi-scenario evidence');
    expect(scorecardMd).toContain('D143 adds Agent OS orchestration integration tests');
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Current v1-v4 scorecard: docs/superpowers/v1-v4-evidence-scorecard.json');
      expect(block).toContain('v2.0 Tier-1 precheck: docs/superpowers/v2-tier1-precheck.json');
      expect(block).toContain('v2.0 production Browser proof: docs/superpowers/v2-production-browser-proof.json');
      expect(block).toContain('v3/v4 production precheck: docs/superpowers/v3-v4-production-precheck.json');
      expect(block).toContain('v3 production replay evidence: docs/superpowers/v3-production-long-horizon-replay.json');
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
      phases: Array<{
        id: string;
        implementationAllowed: boolean;
        themes: string[];
        firstEvidence?: string;
        evidence?: string[];
        status?: string;
      }>;
    };
    const previewMd = readRepoFile('docs/superpowers/v5-v6-planning-preview.md');

    expect(preview.status).toMatch(/^(planning-preview-only|in-progress)$/);
    expect(preview.gates).toContain('v1-v4 evidence gaps must remain explicit while v5/v6 seed implementation proceeds');
    expect(preview.phases.map((phase) => phase.id)).toEqual(['v5.0', 'v6.0']);
    // v5.0 and v6.0 may both have seed implementation evidence, but v1-v4
    // completion gaps must remain explicit and default exposure must not expand.
    const v5Phase = preview.phases.find((p) => p.id === 'v5.0');
    const v6Phase = preview.phases.find((p) => p.id === 'v6.0');
    expect(v5Phase).toBeDefined();
    expect(v6Phase).toBeDefined();
    expect(preview.status).toBe('in-progress');
    expect(v5Phase?.implementationAllowed).toBe(true);
    expect(v5Phase?.firstEvidence).toMatch(/^D-\d+/);
    expect(v6Phase?.implementationAllowed).toBe(true);
    expect(v6Phase?.firstEvidence).toMatch(/^D-\d+/);
    expect(v6Phase?.status).toContain('seed implementation started');
    expect(v6Phase?.evidence?.join('\n')).toContain('D-113');
    expect(preview.phases[0]?.themes).toContain('production hardening');
    expect(preview.phases[1]?.themes).toContain('multi-agent safety');
    expect(preview.phases[1]?.themes).toContain('hosted/enterprise opt-in gates');
    expect(previewMd).toMatch(/Status:.*In progress/);
    expect(previewMd).toContain('v6.0 seed implementation is active');
    expect(previewMd).not.toContain('Next v5.0 sub-sprints: file-backed persistence / ToolLoopPolicy integration / CLI dump.');
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('v5/v6 seed work exists, but v1-v4 completion remains gate-driven and incomplete.');
      expect(block).not.toMatch(/v5\/v6 as planning-preview-only/i);
    }
  });

  it('keeps the current sprint and next-work pointers aligned after D136-D143', () => {
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));

      expect(block).toContain('Current sprint: D136-D143 complete');
      expect(block).not.toMatch(/v2\.0 Tier-1 implementation/i);
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
      expect(block).toContain('D110 v6.0 multi-agent safety 2nd cycle cross-bridge:');
      expect(block).toContain('D111 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed:');
      expect(block).toContain('D112 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed:');
      expect(block).toContain('D113 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed:');
      expect(block).toContain('D114 Gate-1.5 live Browser task sourcing');
      expect(block).toContain('D115 Gate-1.5 opt-in live Browser task runner');
      expect(block).toContain('D116 Gate-1.5 live Browser result recorder');
      expect(block).toContain('D120 Gate-1.5 hybrid real Browser evidence runner:');
      expect(block).toContain('D121 Gate-1.5 hybrid evidence alignment:');
      expect(block).toContain('D122 Gate-1.5 hybrid JS action mapping:');
      expect(block).toContain('D123 Gate-1.5 hybrid updated ledger accumulation:');
      expect(block).toContain('D124 Gate-1.5 hybrid live evidence batch:');
      expect(block).toContain('D125 Gate-1.5 hybrid live evidence continuation:');
      expect(block).toContain('D126 Browser Tier-1 foundation:');
      expect(block).toContain('D127 Memory Ranking and Code Intelligence enhancement:');
      expect(block).toContain('D128 v2.0 Tier-1 release-gate hardening:');
      expect(block).toContain('D129 production Browser proof:');
      expect(block).toContain('D130 v2.0 Tier-2 Compaction closure:');
      expect(block).toContain('D131 v2.0 Tier-2 MCP Runtime closure:');
      expect(block).toContain('D132 v2.0 Tier-2 Automation closure:');
      expect(block).toContain('D133 v2.0 Tier-2 Remote TUI closure:');
      expect(block).toContain('D134 v3/v4 production precheck:');
      expect(block).toContain('D135 v3 production replay evidence:');
      expect(block).toContain('D136 v4 cross-platform SIGKILL/restore evidence:');
      expect(block).toContain('D137 v5.0 observability 3rd cycle trace span seed:');
      expect(block).toContain('D138 v6.0 Theme 3 distributed coordination seed:');
      expect(block).toContain('D139 v5.0 production hardening bootstrap:');
      expect(block).toContain('D141 Gate-1 preferred-100k pass:');
      expect(block).toContain('D142 Gate-2 multi-scenario evidence:');
      expect(block).toContain('D143 Agent OS orchestration integration tests:');
      expect(block).toContain('Gate-1.5 evidence kind: live-browser');
      expect(block).toContain('Gate-1.5 binding: true');
      expect(block).toContain('Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json');
      expect(block).toContain('v2.0 Tier-1 precheck: docs/superpowers/v2-tier1-precheck.json');
      expect(block).toContain('v2.0 production Browser proof: docs/superpowers/v2-production-browser-proof.json');
      expect(block).toContain('v3/v4 production precheck: docs/superpowers/v3-v4-production-precheck.json');
      expect(block).toContain('v3 production replay evidence: docs/superpowers/v3-production-long-horizon-replay.json');
      expect(block).toContain('v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json');
      expect(block).not.toMatch(/^-\s*Current sprint: D134/im);
      expect(block).not.toMatch(/Next implementation slice: D135 record/i);
      expect(block).not.toMatch(/Current sprint: D133/i);
      expect(block).not.toMatch(/Next implementation slice: D134 advance/i);
      expect(block).not.toMatch(/Current sprint: D132/i);
      expect(block).not.toMatch(/Next implementation slice: D133 close/i);
      expect(block).not.toMatch(/Current sprint: D131/i);
      expect(block).not.toMatch(/Next implementation slice: D132 close another/i);
      expect(block).not.toMatch(/Current sprint: D130/i);
      expect(block).not.toMatch(/Next implementation slice: D131/i);
      expect(block).not.toMatch(/Current sprint: D129/i);
      expect(block).not.toMatch(/Next implementation slice: D130/i);
      expect(block).not.toMatch(/Current sprint: D128/i);
      expect(block).not.toMatch(/Next implementation slice: D129/i);
      expect(block).not.toMatch(/Current sprint: D127/i);
      expect(block).not.toMatch(/Next implementation slice: D128/i);
      expect(block).not.toMatch(/Current sprint: D126/i);
      expect(block).not.toMatch(/Next implementation slice: D127/i);
      expect(block).not.toMatch(/Current sprint: D125/i);
      expect(block).not.toMatch(/Next implementation slice: D126/i);
      expect(block).not.toMatch(/Current sprint: D124/i);
      expect(block).not.toMatch(/Next implementation slice: D125/i);
      expect(block).not.toMatch(/Current sprint: D123/i);
      expect(block).not.toMatch(/Next implementation slice: D124/i);
      expect(block).not.toMatch(/Current sprint: D122/i);
      expect(block).not.toMatch(/Next implementation slice: D123/i);
      expect(block).not.toMatch(/Current sprint: D120/i);
      expect(block).not.toMatch(/Next implementation slice: D121/i);
      expect(block).not.toMatch(/Current sprint: D119/i);
      expect(block).not.toMatch(/Next implementation slice: D120 Gate-1\.5 real fetch batch accumulation/i);
      expect(block).not.toMatch(/Current sprint: D118/i);
      expect(block).not.toMatch(/Next implementation slice: D119 Gate-1\.5 opt-in batch accumulation continuation/i);
      expect(block).not.toMatch(/Current sprint: D117/i);
      expect(block).not.toMatch(/Next implementation slice: D118 Gate-1\.5 opt-in evidence run continuation/i);
      expect(block).not.toMatch(/Current sprint: D116/i);
      expect(block).not.toMatch(/Next implementation slice: D117 Gate-1\.5 opt-in live Browser evidence run/i);
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
