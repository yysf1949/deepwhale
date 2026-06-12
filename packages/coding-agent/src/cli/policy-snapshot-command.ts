/**
 * policy-snapshot CLI command -- D-129 v5.0 3rd-cycle depth.
 *
 * Thin CLI surface that calls the v5.0 D-105 buildPolicySnapshot
 * cross-theme bridge and prints the result as a stable JSON string
 * (suitable for `jq` / downstream tooling). A future D-NN can wire
 * the entry point into the actual `deepwhale` binary (process.argv
 * parsing); this sub-sprint ships the pure function that a CLI can
 * call.
 *
 * Design choices:
 *   - The command is async (buildPolicySnapshot is async via the D-104
 *     evaluateCrossInstanceRollback call).
 *   - It returns a `PolicySnapshotCommandResult` containing both the
 *     `snapshot` (the typed PolicySnapshot from D-105) AND the
 *     rendered `json` string. Callers can either consume the typed
 *     object or pipe the JSON to stdout.
 *   - The JSON is rendered with `JSON.stringify(..., null, 2)` (2-space
 *     pretty-print) for human readability. Future D-NN can add a
 *     `compact: true` option for one-line JSON if needed.
 *   - The command is DEFENSIVE: invalid input returns a `success:
 *     false` result with an `error` field, not a thrown exception.
 *     A thrown exception would still propagate; the helper validates
 *     inputs before calling buildPolicySnapshot so the common
 *     failure modes are caught.
 *
 * Scope of THIS sub-sprint: 1 function + 1 input-validator + 4 unit
 * tests (happy path, custom clock, invalid input x2).
 */

import { buildPolicySnapshot } from '../policy-snapshot.js';
import type { BuildPolicySnapshotInput } from '../policy-snapshot.js';
import type { PolicySnapshot } from '../policy-snapshot.js';

export type PolicySnapshotCommandInput = BuildPolicySnapshotInput;

export interface PolicySnapshotCommandResult {
  readonly success: boolean;
  readonly snapshot?: PolicySnapshot;
  readonly json?: string;
  readonly error?: string;
}

function validateInput(input: unknown): input is PolicySnapshotCommandInput {
  if (input === null || typeof input !== 'object') return false;
  const v = input as Partial<PolicySnapshotCommandInput>;
  if (typeof v.auditPath !== 'string' || v.auditPath.length === 0) return false;
  if (typeof v.maxStaleMs !== 'number' || !Number.isFinite(v.maxStaleMs)) return false;
  if (!Number.isFinite(v.maxStaleMs) || v.maxStaleMs < 0) return false;
  if (v.currentManifest === undefined || v.currentManifest === null) return false;
  if (v.previousManifest === undefined || v.previousManifest === null) return false;
  if (!Array.isArray(v.tools)) return false;
  return true;
}

/**
 * Run the policy-snapshot CLI command. Takes a structured input
 * (matching the D-105 buildPolicySnapshot shape), calls the
 * underlying bridge, and returns the typed result plus a
 * pretty-printed JSON string.
 *
 * The function is async because buildPolicySnapshot awaits the
 * D-104 evaluateCrossInstanceRollback audit log read.
 *
 * Returns `{ success: false, error }` on validation failure; never
 * throws on bad input. Throws may still propagate from the underlying
 * buildPolicySnapshot call in the unlikely case that the OS-level
 * file read itself throws (e.g. EACCES on the audit path).
 */
export async function runPolicySnapshotCommand(
  input: PolicySnapshotCommandInput,
): Promise<PolicySnapshotCommandResult> {
  if (!validateInput(input)) {
    return {
      success: false,
      error: 'invalid input: expected { currentManifest, previousManifest, tools, auditPath, maxStaleMs, clock? }',
    };
  }
  const snapshot = await buildPolicySnapshot(input);
  const json = JSON.stringify(snapshot, null, 2);
  return { success: true, snapshot, json };
}
