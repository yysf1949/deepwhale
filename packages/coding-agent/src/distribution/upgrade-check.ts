/**
 * compareVersions — D-95 v5.0 distribution/upgrade flow 2nd evidence.
 *
 * Pure function: given a current version, a latest version, and a list
 * of supported-upgrade-origin semver ranges (from the D-94 manifest),
 * returns a structured UpgradeCheckResult describing the upgrade
 * decision. No I/O, no external semver dependency.
 *
 * The supported-range check is a minimal exact-match check (the
 * supportedUpgradesFrom is a list of "is current in this set" answers).
 * Future D-NN can swap in a real semver-range parser without changing
 * the public API.
 */

export type UpgradeSeverity = 'none' | 'patch' | 'minor' | 'major' | 'unsupported';

export interface UpgradeCheckResult {
  /** True iff the current version is strictly behind the latest version. */
  readonly needsUpgrade: boolean;
  /** Severity classification of the upgrade. */
  readonly severity: UpgradeSeverity;
  /** The current version (echoed back). */
  readonly currentVersion: string;
  /** The latest version (echoed back). */
  readonly latestVersion: string;
  /** True iff the current version is in any of the supported ranges. */
  readonly inSupportedUpgradesFrom: boolean;
  /** Human-readable hint for changelog/release-note generation. */
  readonly changelogHint: string;
}

/**
 * Parse a semver-like string into a [major, minor, patch] tuple.
 * Returns null if any segment is not a non-negative integer.
 */
function parseVersion(v: string): [number, number, number] | null {
  const parts = v.split('.');
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;
  return [nums[0]!, nums[1]!, nums[2]!];
}

/**
 * Minimal supported-range check: returns true iff the given version
 * matches any of the supported upgrade origins. The D-94 manifest uses
 * a single semver-range string per entry, but for the unit-test scope
 * we use exact-match (the supportedUpgradesFrom list contains the
 * exact current version, or a known major+minor prefix).
 *
 * This is intentionally simple — the real range parser is out of scope
 * for the D-95 2nd-evidence piece. Future D-NN can add a real parser.
 */
function isInSupportedUpgradesFrom(
  current: string,
  supportedUpgradesFrom: readonly string[],
): boolean {
  if (supportedUpgradesFrom.length === 0) return false;
  return supportedUpgradesFrom.some((range) => {
    // Simple exact match: range is the exact version string.
    if (range === current) return true;
    // Simple major+minor match: range is 'X.Y.*'.
    if (range.endsWith('.*')) {
      const prefix = range.slice(0, -2);
      return current.startsWith(prefix + '.');
    }
    return false;
  });
}

/**
 * Compare two semver-like versions and return an upgrade-check result.
 */
export function compareVersions(
  current: string,
  latest: string,
  supportedUpgradesFrom: readonly string[],
): UpgradeCheckResult {
  const c = parseVersion(current);
  const l = parseVersion(latest);

  // If either version is unparseable, return a defensive "unsupported".
  if (c === null || l === null) {
    return {
      needsUpgrade: true,
      severity: 'unsupported',
      currentVersion: current,
      latestVersion: latest,
      inSupportedUpgradesFrom: false,
      changelogHint: `${current} -> ${latest}: unsupported`,
    };
  }

  const inSupported = isInSupportedUpgradesFrom(current, supportedUpgradesFrom);

  // current >= latest: no upgrade needed.
  if (
    c[0] > l[0] ||
    (c[0] === l[0] && c[1] > l[1]) ||
    (c[0] === l[0] && c[1] === l[1] && c[2] >= l[2])
  ) {
    return {
      needsUpgrade: false,
      severity: 'none',
      currentVersion: current,
      latestVersion: latest,
      inSupportedUpgradesFrom: inSupported,
      changelogHint: `${current} -> ${latest}: none`,
    };
  }

  // current < latest: severity by gap.
  let severity: UpgradeSeverity;
  if (c[0] < l[0]) {
    severity = 'major';
  } else if (c[1] < l[1]) {
    severity = 'minor';
  } else {
    severity = 'patch';
  }

  // Unsupported override: if current is not in any supported range,
  // the upgrade path is unsupported regardless of the gap.
  if (!inSupported) {
    severity = 'unsupported';
  }

  return {
    needsUpgrade: true,
    severity,
    currentVersion: current,
    latestVersion: latest,
    inSupportedUpgradesFrom: inSupported,
    changelogHint: `${current} -> ${latest}: ${severity}`,
  };
}
