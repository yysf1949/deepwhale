import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_V3_PRODUCTION_REPLAY_SCENARIOS,
  evaluateV3ProductionReplaySuite,
} from '../../src/long-horizon/replay.js';

describe('v3 production long-horizon replay suite (D135)', () => {
  it('passes the default multi-scenario replay suite on the default registry profile', () => {
    const result = evaluateV3ProductionReplaySuite();

    expect(result.slice).toBe('D135');
    expect(result.passed).toBe(true);
    expect(result.requiredScenarios).toBe(5);
    expect(result.scenarioCount).toBe(5);
    expect(result.passedScenarios).toBe(5);
    expect(result.failedScenarios).toBe(0);
    expect(result.blockers).toEqual([]);
    expect(result.scenarios.map((scenario) => `${scenario.id}:${scenario.status}`)).toEqual([
      'invoice-domain-repair-live-replay:pass',
      'release-precheck-hardening-replay:pass',
      'cross-package-status-hygiene-replay:pass',
      'code-refactor-transcript-replay:pass',
      'bug-investigation-transcript-replay:pass',
    ]);
    expect(result.scenarios.every((scenario) => scenario.registryProfile === 'default')).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.toolCalls >= 30 && scenario.toolCalls <= 50)).toBe(true);
  });

  it('fails when fewer than five scenarios are present', () => {
    const result = evaluateV3ProductionReplaySuite({
      scenarios: DEFAULT_V3_PRODUCTION_REPLAY_SCENARIOS.slice(0, 2),
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('v3 production replay suite needs at least 5 scenarios');
  });

  it('fails a scenario that drifts from the default registry profile', () => {
    const scenario = {
      ...DEFAULT_V3_PRODUCTION_REPLAY_SCENARIOS[0]!,
      registryProfile: 'all' as const,
    };
    const result = evaluateV3ProductionReplaySuite({ scenarios: [scenario] });

    expect(result.passed).toBe(false);
    expect(result.scenarios[0]?.status).toBe('fail');
    expect(result.blockers).toContain('invoice-domain-repair-live-replay must use registryProfile=default');
  });

  it('fails when required replay evidence is missing', () => {
    const result = evaluateV3ProductionReplaySuite({
      missingEvidencePaths: ['docs/superpowers/gate2-live-trace.json'],
    });

    expect(result.passed).toBe(false);
    expect(result.scenarios[0]?.missing).toContain('docs/superpowers/gate2-live-trace.json');
    expect(result.blockers).toContain('missing evidence for invoice-domain-repair-live-replay');
  });

  it('ships machine-readable D135 replay evidence', () => {
    const snapshot = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/superpowers/v3-production-long-horizon-replay.json'), 'utf8'),
    ) as {
      slice: string;
      passed: boolean;
      scenarioCount: number;
      blockers: string[];
      scenarios: Array<{ id: string; status: string; registryProfile: string }>;
    };

    expect(snapshot.slice).toBe('D135');
    expect(snapshot.passed).toBe(true);
    expect(snapshot.scenarioCount).toBe(5);
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.scenarios.map((scenario) => `${scenario.id}:${scenario.status}`)).toEqual([
      'invoice-domain-repair-live-replay:pass',
      'release-precheck-hardening-replay:pass',
      'cross-package-status-hygiene-replay:pass',
      'code-refactor-transcript-replay:pass',
      'bug-investigation-transcript-replay:pass',
    ]);
    expect(snapshot.scenarios.every((scenario) => scenario.registryProfile === 'default')).toBe(true);
  });
});
