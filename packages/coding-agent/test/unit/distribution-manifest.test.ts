/**
 * DistributionManifest unit test — D-94 v5.0 distribution/upgrade flow 1st evidence.
 *
 * The 3rd v5.0 theme (distribution/upgrade flow) starts here with a
 * minimal seed: a typed DistributionManifest constant + a structural
 * validator + 3 unit tests. The manifest describes the current
 * distribution state and is the foundation for future upgrade-check
 * and capability-matrix work.
 *
 * After D-94, the project has a single source of truth for:
 *   - the package name + version
 *   - the distribution channel (npm / github / local)
 *   - the supported Node engine range
 *   - the tool capabilities enabled by the default profile
 *   - the semver ranges we officially support as upgrade origins
 */

import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_MANIFEST,
  isValidDistributionManifest,
  type DistributionManifest,
} from '../../src/distribution/manifest.js';

describe('DistributionManifest (D-94 v5.0 distribution/upgrade flow 1st evidence)', () => {
  it('exports a constant with the expected fields (D-94)', () => {
    expect(DISTRIBUTION_MANIFEST.package).toBe('@deepwhale/coding-agent');
    expect(typeof DISTRIBUTION_MANIFEST.version).toBe('string');
    expect(DISTRIBUTION_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(DISTRIBUTION_MANIFEST.channel).toBe('npm');
    expect(DISTRIBUTION_MANIFEST.nodeEngine).toBe('>=20.0.0');
    expect(DISTRIBUTION_MANIFEST.capabilities).toEqual(
      expect.arrayContaining(['file-read', 'file-write', 'shell-exec', 'network', 'code-execute'])
    );
  });

  it('validator accepts the constant (D-94)', () => {
    expect(isValidDistributionManifest(DISTRIBUTION_MANIFEST)).toBe(true);
  });

  it('validator rejects a manifest missing the version field (D-94)', () => {
    const bad = {
      package: 'x',
      channel: 'npm',
      nodeEngine: '>=20.0.0',
      capabilities: [],
      supportedUpgradesFrom: [],
    } as unknown as DistributionManifest;
    expect(isValidDistributionManifest(bad)).toBe(false);
  });
});
