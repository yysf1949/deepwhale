/**
 * generateChangelog unit test -- D-101 v5.0 distribution/upgrade flow 2nd cycle.
 *
 * After D-94 (DistributionManifest typed constant) and D-95
 * (compareVersions upgrade check), D-101 adds the changelog
 * generator that compares two DistributionManifests and surfaces
 * the human-meaningful differences. Together D-94 + D-95 + D-101
 * form the v5.0 distribution/upgrade flow 2nd cycle: description
 * + decision + narrative.
 *
 * The function is a PURE data-shape function. It returns a
 * ChangelogDocument (structured entries, not pre-rendered text).
 * Future D-102+ can render the same doc to markdown / JSON / HTML
 * by walking the entries.
 */

import { describe, expect, it } from 'vitest';
import { generateChangelog } from '../../src/distribution/changelog-generator.js';
import type { DistributionManifest } from '../../src/distribution/manifest.js';

function makeManifest(overrides: Partial<DistributionManifest> = {}): DistributionManifest {
  return {
    package: '@deepwhale/coding-agent',
    version: '2.2.0',
    channel: 'npm',
    nodeEngine: '>=20.0.0',
    capabilities: ['file-read', 'file-write', 'shell-exec', 'network', 'code-execute'],
    supportedUpgradesFrom: ['>=2.0.0 <2.2.0'],
    ...overrides,
  };
}

describe('generateChangelog (D-101 v5.0 distribution/upgrade flow 2nd cycle)', () => {
  it('emits a version entry on every call, even when versions are equal (D-101)', () => {
    const doc = generateChangelog(makeManifest(), makeManifest());
    expect(doc.from.version).toBe('2.2.0');
    expect(doc.to.version).toBe('2.2.0');
    expect(doc.isEmpty).toBe(false);  // version entry always present
    const versionEntry = doc.entries.find((e) => e.kind === 'version');
    expect(versionEntry).toBeDefined();
    expect(versionEntry!.summary).toBe('2.2.0 -> 2.2.0');
  });

  it('surfaces added and removed capabilities (D-101)', () => {
    const previous = makeManifest({
      capabilities: ['file-read', 'file-write'],
    });
    const current = makeManifest({
      capabilities: ['file-read', 'shell-exec'],
    });
    const doc = generateChangelog(previous, current);
    const added = doc.entries.filter((e) => e.kind === 'capability-added').map((e) => e.summary);
    const removed = doc.entries.filter((e) => e.kind === 'capability-removed').map((e) => e.summary);
    expect(added).toEqual(['added shell-exec']);
    expect(removed).toEqual(['removed file-write']);
  });

  it('surfaces channel and node-engine changes (D-101)', () => {
    const previous = makeManifest({ channel: 'npm', nodeEngine: '>=20.0.0' });
    const current = makeManifest({ channel: 'github', nodeEngine: '>=22.0.0' });
    const doc = generateChangelog(previous, current);
    const channel = doc.entries.find((e) => e.kind === 'channel');
    expect(channel).toBeDefined();
    expect(channel!.summary).toBe('channel: npm -> github');
    const engine = doc.entries.find((e) => e.kind === 'node-engine');
    expect(engine).toBeDefined();
    expect(engine!.summary).toBe('node-engine: >=20.0.0 -> >=22.0.0');
  });

  it('surfaces added/removed supported upgrade origins (D-101)', () => {
    const previous = makeManifest({ supportedUpgradesFrom: ['>=2.0.0 <2.2.0'] });
    const current = makeManifest({ supportedUpgradesFrom: ['>=2.0.0 <2.3.0', '>=1.5.0 <2.0.0'] });
    const doc = generateChangelog(previous, current);
    const originEntries = doc.entries.filter((e) => e.kind === 'supported-upgrade-origin');
    const summaries = originEntries.map((e) => e.summary);
    expect(summaries).toContain('added upgrade origin: >=1.5.0 <2.0.0');
    expect(summaries).toContain('removed upgrade origin: >=2.0.0 <2.2.0');
  });
});
