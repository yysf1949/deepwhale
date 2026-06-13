import { DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES } from './v2-tier1-precheck.js';
import { evaluateV3ProductionReplaySuite } from '../long-horizon/replay.js';
import { evaluateSigkillRestoreEvidence } from '../hardening/sigkill-restore-evidence.js';

export type V3V4ProductionPrecheckCheckId =
  | 'v3-gate2-live-fixture'
  | 'v3-reviewer-gate-boundary'
  | 'v3-production-breadth'
  | 'v4-cross-session-agent-os'
  | 'v4-persistent-memory-recovery'
  | 'v4-cross-platform-sigkill'
  | 'default-exposure';

export type V3V4ProductionPrecheckStatus = 'pass' | 'fail' | 'blocked';
export type V3V4ProductionPrecheckEvidenceKind = 'source' | 'test' | 'doc' | 'gate';

export interface V3V4ProductionPrecheckEvidenceRef {
  id: string;
  checkId: V3V4ProductionPrecheckCheckId;
  path: string;
  kind: V3V4ProductionPrecheckEvidenceKind;
  note: string;
  present?: boolean;
}

export interface V3V4ProductionPrecheckCheck {
  id: V3V4ProductionPrecheckCheckId;
  label: string;
  status: V3V4ProductionPrecheckStatus;
  requiredForRelease: boolean;
  evidence: V3V4ProductionPrecheckEvidenceRef[];
  missing: string[];
  blockers: string[];
  caveat: string;
}

export interface V3V4ProductionPrecheckDefaultExposure {
  toolCount: number;
  expectedToolCount: number;
  actualToolNames: string[];
  allowedDefaultToolNames: string[];
  unexpectedToolNames: string[];
  missingExpectedToolNames: string[];
  nonCodingDefaultEnabled: boolean;
  caveat: string;
}

export interface V3V4ProductionPrecheckInput {
  evidence?: ReadonlyArray<V3V4ProductionPrecheckEvidenceRef>;
  missingEvidencePaths?: ReadonlyArray<string>;
  defaultToolNames?: ReadonlyArray<string>;
  allowedDefaultToolNames?: ReadonlyArray<string>;
}

export interface V3V4ProductionPrecheckResult {
  slice: 'D136';
  passed: boolean;
  summary: string;
  completedChecks: number;
  blockingChecks: number;
  checks: V3V4ProductionPrecheckCheck[];
  blockers: string[];
  nextActions: string[];
  defaultExposure: V3V4ProductionPrecheckDefaultExposure;
}

export const DEFAULT_V3_V4_PRODUCTION_PRECHECK_EVIDENCE: readonly V3V4ProductionPrecheckEvidenceRef[] = [
  {
    id: 'd85-gate2-long-horizon-source',
    checkId: 'v3-gate2-live-fixture',
    path: 'packages/coding-agent/src/long-horizon/gate2.ts',
    kind: 'source',
    note: 'D85 Gate-2 long-horizon runner source fixture at the 30-50 inclusive tool-call boundary.',
  },
  {
    id: 'd85-gate2-long-horizon-test',
    checkId: 'v3-gate2-live-fixture',
    path: 'packages/coding-agent/test/unit/gate2-long-horizon.test.ts',
    kind: 'test',
    note: 'D85 inclusive 30-50 boundary unit coverage.',
  },
  {
    id: 'gate2-live-evidence-doc',
    checkId: 'v3-gate2-live-fixture',
    path: 'docs/superpowers/gate-2-long-horizon-live.json',
    kind: 'gate',
    note: 'Default-profile Gate-2 live fixture pass evidence at 31 tool calls.',
  },
  {
    id: 'gate2-live-trace-doc',
    checkId: 'v3-gate2-live-fixture',
    path: 'docs/superpowers/gate2-live-trace.json',
    kind: 'gate',
    note: 'Default-profile Gate-2 live runner trace.',
  },
  {
    id: 'reviewer-gates-source',
    checkId: 'v3-reviewer-gate-boundary',
    path: 'packages/coding-agent/src/reviewer/gates.ts',
    kind: 'source',
    note: 'Reviewer gate boundary definitions used by the tool-loop policy integration.',
  },
  {
    id: 'tool-loop-policy-integration-test',
    checkId: 'v3-reviewer-gate-boundary',
    path: 'packages/coding-agent/test/integration/tool-loop-policy.test.ts',
    kind: 'test',
    note: 'Reviewer gate tool-loop policy integration coverage.',
  },
  {
    id: 'persisting-task-graph-recorder-source',
    checkId: 'v4-cross-session-agent-os',
    path: 'packages/coding-agent/src/agent/persisting-task-graph-recorder.ts',
    kind: 'source',
    note: 'D80 cross-session TaskGraph persistence recorder (Agent OS layer).',
  },
  {
    id: 'persisting-task-graph-recorder-test',
    checkId: 'v4-cross-session-agent-os',
    path: 'packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts',
    kind: 'test',
    note: 'D80 cross-instance recorder coverage.',
  },
  {
    id: 'persistent-memory-store-source',
    checkId: 'v4-persistent-memory-recovery',
    path: 'packages/coding-agent/src/memory/persistent-store.ts',
    kind: 'source',
    note: 'D78 atomic write + partial-last-line recovery for the persistent memory store.',
  },
  {
    id: 'persistent-memory-test',
    checkId: 'v4-persistent-memory-recovery',
    path: 'packages/coding-agent/test/unit/persistent-memory.test.ts',
    kind: 'test',
    note: 'D78 deterministic crash/reload evidence.',
  },
  {
    id: 'd136-sigkill-restore-evidence-source',
    checkId: 'v4-cross-platform-sigkill',
    path: 'packages/coding-agent/src/hardening/sigkill-restore-evidence.ts',
    kind: 'source',
    note: 'D136 cross-platform SIGKILL/restore evidence evaluator (evaluateSigkillRestoreEvidence + DEFAULT_SIGKILL_RESTORE_SCENARIOS).',
  },
  {
    id: 'd136-sigkill-restore-evidence-test',
    checkId: 'v4-cross-platform-sigkill',
    path: 'packages/coding-agent/test/unit/sigkill-restore-evidence.test.ts',
    kind: 'test',
    note: 'D136 sigkill-restore-evidence unit coverage (default pass, corruption failure, kind validation, summary text).',
  },
  {
    id: 'd136-sigkill-restore-evidence-doc',
    checkId: 'v4-cross-platform-sigkill',
    path: 'docs/superpowers/v4-sigkill-restore-evidence.json',
    kind: 'gate',
    note: 'D136 machine-readable cross-platform SIGKILL/restore evidence snapshot.',
  },
  {
    id: 'd136-sigkill-restore-evidence-md',
    checkId: 'v4-cross-platform-sigkill',
    path: 'docs/superpowers/v4-sigkill-restore-evidence.md',
    kind: 'gate',
    note: 'D136 narrative cross-platform SIGKILL/restore evidence.',
  },
  {
    id: 'default-registry-source',
    checkId: 'default-exposure',
    path: 'packages/coding-agent/src/tools/registry.ts',
    kind: 'source',
    note: 'Default registry factory and opt-in async boundary.',
  },
  {
    id: 'default-registry-invariant-test',
    checkId: 'default-exposure',
    path: 'packages/coding-agent/test/unit/default-registry-invariant.test.ts',
    kind: 'test',
    note: 'D83 narrow-default invariant coverage.',
  },
  {
    id: 'd135-v3-replay-evaluator-source',
    checkId: 'v3-production-breadth',
    path: 'packages/coding-agent/src/long-horizon/replay.ts',
    kind: 'source',
    note: 'D135 v3.0 production long-horizon replay evaluator (DEFAULT_V3_PRODUCTION_REPLAY_SCENARIOS + evaluateV3ProductionReplaySuite).',
  },
  {
    id: 'd135-v3-replay-evaluator-test',
    checkId: 'v3-production-breadth',
    path: 'packages/coding-agent/test/unit/v3-production-replay.test.ts',
    kind: 'test',
    note: 'D135 replay evaluator coverage (default suite, scenario count, registry profile drift, missing evidence, JSON snapshot).',
  },
  {
    id: 'd135-v3-replay-evidence-doc',
    checkId: 'v3-production-breadth',
    path: 'docs/superpowers/v3-production-long-horizon-replay.json',
    kind: 'gate',
    note: 'D135 machine-readable v3.0 production long-horizon replay snapshot.',
  },
  {
    id: 'd135-v3-replay-evidence-md',
    checkId: 'v3-production-breadth',
    path: 'docs/superpowers/v3-production-long-horizon-replay.md',
    kind: 'gate',
    note: 'D135 narrative v3.0 production long-horizon replay evidence.',
  },
];

const CHECK_ORDER: readonly V3V4ProductionPrecheckCheckId[] = [
  'v3-gate2-live-fixture',
  'v3-reviewer-gate-boundary',
  'v3-production-breadth',
  'v4-cross-session-agent-os',
  'v4-persistent-memory-recovery',
  'v4-cross-platform-sigkill',
  'default-exposure',
];

const CHECK_LABELS: Record<V3V4ProductionPrecheckCheckId, string> = {
  'v3-gate2-live-fixture': 'v3.0 Gate-2 live fixture',
  'v3-reviewer-gate-boundary': 'v3.0 Reviewer gate boundary',
  'v3-production-breadth': 'v3.0 production breadth',
  'v4-cross-session-agent-os': 'v4.0 cross-session Agent OS',
  'v4-persistent-memory-recovery': 'v4.0 persistent memory recovery',
  'v4-cross-platform-sigkill': 'v4.0 cross-platform SIGKILL/restore',
  'default-exposure': 'Default registry exposure invariant',
};

const CHECK_CAVEATS: Record<V3V4ProductionPrecheckCheckId, string> = {
  'v3-gate2-live-fixture':
    'Default-profile live fixture evidence only; not broad production long-horizon breadth.',
  'v3-reviewer-gate-boundary':
    'Reviewer gate boundary integration evidence; not full reviewer-driven production proof.',
  'v3-production-breadth':
    'D135 multi-scenario default-profile replay evidence; replay reuses evaluateGate2Transcript and is not a new live external Gate-2 run.',
  'v4-cross-session-agent-os':
    'Deterministic cross-session JSONL fixture evidence; not real Agent OS orchestration proof.',
  'v4-persistent-memory-recovery':
    'Atomic write + partial-last-line recovery evidence; not real cross-platform SIGKILL tests.',
  'v4-cross-platform-sigkill':
    'D136 cross-platform SIGKILL/restore evidence from process-kill, docker-stop, and session-crash-recovery scenarios with preserved data integrity.',
  'default-exposure':
    'Narrow default must remain coding plus Code Intel essentials; non-coding surfaces require explicit opt-in.',
};

const BLOCKED_CHECKS: ReadonlyMap<V3V4ProductionPrecheckCheckId, string> = new Map([]);

const NON_CODING_DEFAULT_PATTERNS: readonly RegExp[] = [
  /^browser_(?!action$|js$)/i,
  /^desktop[_-]/i,
  /^channel[_-]/i,
  /[_-]desktop$/i,
  /[_-]channel$/i,
  /media/i,
  /productivity/i,
  /research/i,
];

export function evaluateV3V4ProductionPrecheck(
  input: V3V4ProductionPrecheckInput = {},
): V3V4ProductionPrecheckResult {
  const evidence = input.evidence ?? DEFAULT_V3_V4_PRODUCTION_PRECHECK_EVIDENCE;
  const missingEvidencePaths = new Set(input.missingEvidencePaths ?? []);
  const defaultExposure = evaluateDefaultExposure(input);
  const replaySuite = evaluateV3ProductionReplaySuite({
    missingEvidencePaths: [...missingEvidencePaths],
  });
  const sigkillRestoreResult = evaluateSigkillRestoreEvidence();
  const checks = CHECK_ORDER.map((checkId) => {
    if (checkId === 'default-exposure') {
      return buildDefaultExposureCheck(evidence, missingEvidencePaths, defaultExposure);
    }
    if (checkId === 'v3-production-breadth') {
      return buildProductionBreadthCheck(evidence, missingEvidencePaths, replaySuite);
    }
    if (checkId === 'v4-cross-platform-sigkill') {
      return buildSigkillRestoreCheck(evidence, missingEvidencePaths, sigkillRestoreResult);
    }
    const blocker = BLOCKED_CHECKS.get(checkId);
    if (blocker !== undefined) {
      return buildBlockedCheck(checkId, blocker);
    }
    return buildEvidenceCheck(checkId, evidence, missingEvidencePaths);
  });

  const passed = checks.every((check) => check.status === 'pass');
  const blockers = unique(
    checks.flatMap((check) => [
      ...check.blockers,
      ...(check.status === 'fail' ? check.missing : []),
    ]),
  );
  return {
    slice: 'D136',
    passed,
    summary: passed
      ? 'v3.0/v4.0 production precheck passed; all checks including cross-platform SIGKILL/restore evidence now pass.'
      : 'v3.0/v4.0 production precheck is expected to fail overall; one or more checks did not pass.',
    completedChecks: checks.filter((check) => check.status === 'pass').length,
    blockingChecks: checks.filter((check) => check.status !== 'pass').length,
    checks,
    blockers,
    nextActions: [
      'Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.',
    ],
    defaultExposure,
  };
}

function buildEvidenceCheck(
  id: V3V4ProductionPrecheckCheckId,
  evidence: ReadonlyArray<V3V4ProductionPrecheckEvidenceRef>,
  missingEvidencePaths: ReadonlySet<string>,
): V3V4ProductionPrecheckCheck {
  const rows = evidence.filter((entry) => entry.checkId === id);
  const present = rows.filter((entry) => isEvidencePresent(entry, missingEvidencePaths));
  const missing = rows
    .filter((entry) => !isEvidencePresent(entry, missingEvidencePaths))
    .map((entry) => entry.path);
  return {
    id,
    label: CHECK_LABELS[id],
    status: missing.length === 0 && rows.length > 0 ? 'pass' : 'fail',
    requiredForRelease: true,
    evidence: present,
    missing,
    blockers: missing.length === 0 ? [] : [`missing evidence for ${id}`],
    caveat: CHECK_CAVEATS[id],
  };
}

function buildProductionBreadthCheck(
  evidence: ReadonlyArray<V3V4ProductionPrecheckEvidenceRef>,
  missingEvidencePaths: ReadonlySet<string>,
  replaySuite: ReturnType<typeof evaluateV3ProductionReplaySuite>,
): V3V4ProductionPrecheckCheck {
  const base = buildEvidenceCheck('v3-production-breadth', evidence, missingEvidencePaths);
  const missing = [...base.missing];
  const extraBlockers: string[] = [];
  if (!replaySuite.passed) {
    missing.push('v3 production long-horizon replay suite evidence');
    for (const blocker of replaySuite.blockers) {
      if (!extraBlockers.includes(blocker)) {
        extraBlockers.push(blocker);
      }
    }
  }
  return {
    ...base,
    status: missing.length === 0 ? 'pass' : 'fail',
    missing,
    blockers:
      missing.length === 0
        ? []
        : unique(['v3.0 production breadth is missing replay evidence', ...extraBlockers]),
    caveat: CHECK_CAVEATS['v3-production-breadth'],
  };
}

function buildSigkillRestoreCheck(
  evidence: ReadonlyArray<V3V4ProductionPrecheckEvidenceRef>,
  missingEvidencePaths: ReadonlySet<string>,
  sigkillRestoreResult: ReturnType<typeof evaluateSigkillRestoreEvidence>,
): V3V4ProductionPrecheckCheck {
  const base = buildEvidenceCheck('v4-cross-platform-sigkill', evidence, missingEvidencePaths);
  const missing = [...base.missing];
  const extraBlockers: string[] = [];
  if (!sigkillRestoreResult.passed) {
    missing.push('v4 cross-platform SIGKILL/restore evidence');
    for (const action of sigkillRestoreResult.nextActions) {
      if (!extraBlockers.includes(action)) {
        extraBlockers.push(action);
      }
    }
  }
  return {
    ...base,
    status: missing.length === 0 ? 'pass' : 'fail',
    missing,
    blockers:
      missing.length === 0
        ? []
        : unique(['v4.0 cross-platform SIGKILL/restore evidence is missing', ...extraBlockers]),
    caveat: CHECK_CAVEATS['v4-cross-platform-sigkill'],
  };
}

function buildDefaultExposureCheck(
  evidence: ReadonlyArray<V3V4ProductionPrecheckEvidenceRef>,
  missingEvidencePaths: ReadonlySet<string>,
  defaultExposure: V3V4ProductionPrecheckDefaultExposure,
): V3V4ProductionPrecheckCheck {
  const base = buildEvidenceCheck('default-exposure', evidence, missingEvidencePaths);
  const missing = [...base.missing];
  if (defaultExposure.unexpectedToolNames.length > 0) {
    missing.push(`unexpected default tools: ${defaultExposure.unexpectedToolNames.join(', ')}`);
  }
  if (defaultExposure.missingExpectedToolNames.length > 0) {
    missing.push(`missing expected default tools: ${defaultExposure.missingExpectedToolNames.join(', ')}`);
  }
  return {
    ...base,
    status: missing.length === 0 ? 'pass' : 'fail',
    missing,
    blockers: missing.length === 0 ? [] : ['default registry exposure drift detected'],
  };
}

function buildBlockedCheck(
  id: V3V4ProductionPrecheckCheckId,
  blocker: string,
): V3V4ProductionPrecheckCheck {
  return {
    id,
    label: CHECK_LABELS[id],
    status: 'blocked',
    requiredForRelease: true,
    evidence: [],
    missing: [],
    blockers: [blocker],
    caveat: CHECK_CAVEATS[id],
  };
}

function evaluateDefaultExposure(input: V3V4ProductionPrecheckInput): V3V4ProductionPrecheckDefaultExposure {
  const allowed = [...(input.allowedDefaultToolNames ?? DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES)];
  const actual = [...(input.defaultToolNames ?? DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES)];
  const allowedSet = new Set(allowed);
  const actualSet = new Set(actual);
  const unexpectedToolNames = actual.filter((name) => !allowedSet.has(name)).sort();
  const missingExpectedToolNames = allowed.filter((name) => !actualSet.has(name)).sort();
  return {
    toolCount: actual.length,
    expectedToolCount: allowed.length,
    actualToolNames: actual,
    allowedDefaultToolNames: allowed,
    unexpectedToolNames,
    missingExpectedToolNames,
    nonCodingDefaultEnabled: unexpectedToolNames.some((name) =>
      NON_CODING_DEFAULT_PATTERNS.some((pattern) => pattern.test(name)),
    ),
    caveat:
      'Narrow default registry (21 tools: coding + Code Intel essentials); non-coding surfaces require explicit opt-in.',
  };
}

function isEvidencePresent(
  evidence: V3V4ProductionPrecheckEvidenceRef,
  missingEvidencePaths: ReadonlySet<string>,
): boolean {
  return evidence.present !== false && !missingEvidencePaths.has(evidence.path);
}

function unique(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}
