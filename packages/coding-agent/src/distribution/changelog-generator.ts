/**
 * Changelog generator -- D-101 v5.0 distribution/upgrade flow 2nd cycle.
 *
 * Compares two DistributionManifest values and produces a structured
 * ChangelogDocument. Together with D-94 (manifest description) and
 * D-95 (compareVersions upgrade decision), D-101 completes the
 * v5.0 distribution/upgrade flow 2nd cycle (description + decision
 * + narrative).
 *
 * The output is structured (an array of ChangelogEntry records),
 * NOT a pre-rendered markdown string. A future D-102+ can render
 * the same document to markdown / JSON / HTML by walking the
 * entries. This keeps the function pure and format-agnostic.
 *
 * Surfaces four classes of change:
 *   1. version bump (always emitted, even if versions are equal)
 *   2. capabilities added/removed (set difference)
 *   3. channel change
 *   4. node-engine change
 *   5. supported-upgrade-origin added/removed
 *
 * The function is PURE (no I/O, no side effects, no logging to
 * AuditLog). Defensive: never throws; empty input diffs produce
 * a 1-entry document (just the version entry).
 */

import type { DistributionManifest } from './manifest.js';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export type ChangelogChangeKind =
  | 'version'
  | 'capability-added'
  | 'capability-removed'
  | 'channel'
  | 'node-engine'
  | 'supported-upgrade-origin';

export interface ChangelogEntry {
  readonly kind: ChangelogChangeKind;
  /** Human-readable summary, e.g. "2.2.0 -> 2.3.0" or "added file-read". */
  readonly summary: string;
  /** Optional structured detail for programmatic consumers. */
  readonly detail?: Readonly<Record<string, string>>;
}

export interface ChangelogDocument {
  readonly from: { readonly version: string; readonly package: string };
  readonly to: { readonly version: string; readonly package: string };
  readonly entries: readonly ChangelogEntry[];
  /** Convenience: true iff `entries` is empty (no changes). */
  readonly isEmpty: boolean;
}

/**
 * Build a Set-like dict (Partial<Record<T, true>>) to avoid Set<T>
 * for-of iteration that needs downlevelIteration in tsconfig.
 */
function toSet<T extends string>(values: readonly T[]): Partial<Record<T, true>> {
  const set: Partial<Record<T, true>> = {};
  for (const v of values) {
    set[v] = true;
  }
  return set;
}

/**
 * Generate a changelog from `previous` to `current`. Always emits
 * a `version` entry (even when versions are equal) so the
 * document is never unexpectedly empty.
 */
export function generateChangelog(
  previous: DistributionManifest,
  current: DistributionManifest,
): ChangelogDocument {
  const entries: ChangelogEntry[] = [];

  // 1. Version entry (always present).
  entries.push({
    kind: 'version',
    summary: `${previous.version} -> ${current.version}`,
  });

  // 2. Capability add/remove.
  const prevCaps = toSet<ToolCapability>(previous.capabilities);
  const currCaps = toSet<ToolCapability>(current.capabilities);
  for (const cap of Object.keys(currCaps) as ToolCapability[]) {
    if (prevCaps[cap] !== true) {
      entries.push({ kind: 'capability-added', summary: `added ${cap}` });
    }
  }
  for (const cap of Object.keys(prevCaps) as ToolCapability[]) {
    if (currCaps[cap] !== true) {
      entries.push({ kind: 'capability-removed', summary: `removed ${cap}` });
    }
  }

  // 3. Channel change.
  if (previous.channel !== current.channel) {
    entries.push({
      kind: 'channel',
      summary: `channel: ${previous.channel} -> ${current.channel}`,
    });
  }

  // 4. Node engine change.
  if (previous.nodeEngine !== current.nodeEngine) {
    entries.push({
      kind: 'node-engine',
      summary: `node-engine: ${previous.nodeEngine} -> ${current.nodeEngine}`,
    });
  }

  // 5. Supported upgrade origins add/remove.
  const prevOrigins = toSet<string>(previous.supportedUpgradesFrom);
  const currOrigins = toSet<string>(current.supportedUpgradesFrom);
  for (const origin of Object.keys(currOrigins)) {
    if (prevOrigins[origin] !== true) {
      entries.push({
        kind: 'supported-upgrade-origin',
        summary: `added upgrade origin: ${origin}`,
      });
    }
  }
  for (const origin of Object.keys(prevOrigins)) {
    if (currOrigins[origin] !== true) {
      entries.push({
        kind: 'supported-upgrade-origin',
        summary: `removed upgrade origin: ${origin}`,
      });
    }
  }

  return {
    from: { version: previous.version, package: previous.package },
    to: { version: current.version, package: current.package },
    entries,
    isEmpty: entries.length === 0,
  };
}
