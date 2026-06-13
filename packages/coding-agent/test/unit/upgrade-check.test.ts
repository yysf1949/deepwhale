/**
 * compareVersions unit test — D-95 v5.0 distribution/upgrade flow 2nd evidence.
 *
 * After D-94 added the DistributionManifest (description: "what am I?"),
 * D-95 adds the upgrade-check function (decision: "do I need to upgrade?").
 * Together they form the v5.0 distribution/upgrade flow 1st cycle.
 *
 * The test asserts the severity decision for 4 representative scenarios:
 *   - same version            -> none
 *   - patch behind            -> patch
 *   - major behind            -> major
 *   - current not in supported -> unsupported (overrides patch/minor)
 */

import { describe, expect, it } from 'vitest';
import { compareVersions } from '../../src/distribution/upgrade-check.js';

describe('compareVersions (D-95 v5.0 distribution/upgrade flow 2nd evidence)', () => {
  it('returns none when current == latest (D-95)', () => {
    const r = compareVersions('2.2.0', '2.2.0', ['>=2.0.0 <3.0.0']);
    expect(r.needsUpgrade).toBe(false);
    expect(r.severity).toBe('none');
    expect(r.changelogHint).toBe('2.2.0 -> 2.2.0: none');
  });

  it('returns patch when current.patch < latest.patch (D-95)', () => {
    const r = compareVersions('2.2.0', '2.2.1', ['2.2.*']);
    expect(r.needsUpgrade).toBe(true);
    expect(r.severity).toBe('patch');
    expect(r.changelogHint).toBe('2.2.0 -> 2.2.1: patch');
    expect(r.inSupportedUpgradesFrom).toBe(true);
  });

  it('returns major when current.major < latest.major (D-95)', () => {
    const r = compareVersions('1.5.0', '2.2.0', ['1.5.*']);
    expect(r.needsUpgrade).toBe(true);
    expect(r.severity).toBe('major');
    expect(r.inSupportedUpgradesFrom).toBe(true);
  });

  it('returns unsupported when current is not in any supported range (D-95)', () => {
    const r = compareVersions('0.9.0', '2.2.0', ['1.0.*']);
    expect(r.needsUpgrade).toBe(true);
    expect(r.severity).toBe('unsupported');
    expect(r.inSupportedUpgradesFrom).toBe(false);
  });
});
