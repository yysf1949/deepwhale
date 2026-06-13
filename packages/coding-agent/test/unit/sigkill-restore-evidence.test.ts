import { describe, expect, it } from 'vitest';
import {
  evaluateSigkillRestoreEvidence,
  DEFAULT_SIGKILL_RESTORE_SCENARIOS,
  type SigkillRestoreScenario,
} from '../../src/hardening/sigkill-restore-evidence.js';

describe('sigkill-restore-evidence', () => {
  it('default scenarios all pass', () => {
    const result = evaluateSigkillRestoreEvidence();
    expect(result.passed).toBe(true);
    expect(result.scenarios).toHaveLength(3);
    expect(result.nextActions).toEqual([]);
    expect(result.summary).toContain('passed');
  });

  it('custom scenario with corruption failure', () => {
    const corrupted: SigkillRestoreScenario = {
      platform: 'linux',
      method: 'process-kill',
      dataIntegrity: 'corrupted',
      evidence: 'Data loss detected on SIGKILL.',
    };
    const result = evaluateSigkillRestoreEvidence([corrupted]);
    expect(result.passed).toBe(false);
    expect(result.scenarios).toHaveLength(1);
    expect(result.nextActions).toContain('Investigate data corruption in process-kill on linux');
    expect(result.summary).toContain('failed');
  });

  it('evidence kind validation', () => {
    const methods = DEFAULT_SIGKILL_RESTORE_SCENARIOS.map((s) => s.method);
    expect(methods).toContain('process-kill');
    expect(methods).toContain('docker-stop');
    expect(methods).toContain('session-crash-recovery');
  });

  it('summary text generation', () => {
    const passResult = evaluateSigkillRestoreEvidence(DEFAULT_SIGKILL_RESTORE_SCENARIOS);
    expect(passResult.summary).toMatch(/^Cross-platform SIGKILL\/restore evidence passed:/);

    const failResult = evaluateSigkillRestoreEvidence([
      {
        platform: 'darwin',
        method: 'docker-stop',
        dataIntegrity: 'corrupted',
        evidence: 'Container data lost.',
      },
    ]);
    expect(failResult.summary).toMatch(/^Cross-platform SIGKILL\/restore evidence failed:/);
  });
});
