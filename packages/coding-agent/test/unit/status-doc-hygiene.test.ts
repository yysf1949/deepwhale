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
    expect(readme).toContain('Package version line: 2.2.0');
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
    expect(readme).toContain(`Gate-1.5 evidence kind: ${gate15.evidenceKind}`);
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

    expect(scorecard.aggregatePercent).toBe(48);
    expect(scorecard.milestones.map((m) => m.id)).toEqual(['v1.0', 'v1.5', 'v2.0', 'v2.5', 'v3.0', 'v4.0']);
    expect(scorecard.caveats).toContain('Gate-2 default-profile fixture pass is not v1-v4 production completion.');
    expect(scorecard.caveats).toContain('Gate-1 minimum-50k evidence is not preferred-100k evidence.');
    expect(scorecard.nextActions).toContain(
      'D73: collect or explicitly defer live Gate-1.5 browser tasks before Browser enhancement work.',
    );
    expect(scorecard.nextActions).toContain(
      'D74: continue Code Intel correctness hardening only where tests prove specific behavior.',
    );
    expect(scorecard.nextActions).toContain(
      'D75: tighten planner, reviewer, memory, and main-loop integration evidence without expanding default tools.',
    );
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D72:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D71:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D70:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D68:/m);
    expect(scorecard.nextActions.join('\n')).not.toMatch(/^D69:/m);
    expect(scorecardMd).toContain('Aggregate evidence-backed progress: 48%');
    expect(scorecardMd).toContain('D67 rename_symbol exposes hashline edit hunks');
    expect(scorecardMd).toContain('D71 covers TypeScript combined default-plus-named import references');
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Current v1-v4 scorecard: docs/superpowers/v1-v4-evidence-scorecard.json');
    }
  });

  it('keeps v5/v6 planning preview gated and machine-readable', () => {
    const preview = JSON.parse(readRepoFile('docs/superpowers/v5-v6-planning-preview.json')) as {
      status: string;
      gates: string[];
      phases: Array<{ id: string; implementationAllowed: boolean; themes: string[] }>;
    };
    const previewMd = readRepoFile('docs/superpowers/v5-v6-planning-preview.md');

    expect(preview.status).toBe('planning-preview-only');
    expect(preview.gates).toContain('v1-v4 evidence gaps must remain explicit before v5/v6 implementation starts');
    expect(preview.phases.map((phase) => phase.id)).toEqual(['v5.0', 'v6.0']);
    expect(preview.phases.every((phase) => phase.implementationAllowed === false)).toBe(true);
    expect(preview.phases[0]?.themes).toContain('production hardening');
    expect(preview.phases[1]?.themes).toContain('collaborative multi-agent operations');
    expect(previewMd).toContain('Planning preview only');
  });

  it('keeps the current sprint and next-work pointers aligned after D72', () => {
    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));

      expect(block).toContain('Current sprint: D72 release/version hygiene refresh');
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
      expect(block).toContain('Gate-1.5 evidence kind: fixture-dry-run');
      expect(block).toContain('Gate-1.5 binding branch decision: defer-live-evidence');
      expect(block).toContain('Next implementation slice: D73 Gate-1.5 live browser task decision');
      expect(block).toContain('v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json');
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
