export type V2Tier1PrecheckCheckId =
  | 'browser-tier1-foundation'
  | 'memory-ranking'
  | 'code-intel-semantic-fallback'
  | 'default-exposure'
  | 'production-browser-automation'
  | 'visual-grounding'
  | 'tier2-blockers';

export type V2Tier1PrecheckStatus = 'pass' | 'fail' | 'blocked';
export type V2Tier1EvidenceKind = 'source' | 'test' | 'doc' | 'gate';
export type V2Tier1EvidenceLayer = 'helper-layer' | 'release-gate' | 'blocker';

export interface V2Tier1EvidenceRef {
  id: string;
  checkId: V2Tier1PrecheckCheckId;
  path: string;
  kind: V2Tier1EvidenceKind;
  layer: V2Tier1EvidenceLayer;
  note: string;
  present?: boolean;
}

export interface V2Tier1PrecheckCheck {
  id: V2Tier1PrecheckCheckId;
  label: string;
  status: V2Tier1PrecheckStatus;
  requiredForRelease: boolean;
  evidence: V2Tier1EvidenceRef[];
  missing: string[];
  blockers: string[];
  caveat: string;
}

export interface V2Tier1DefaultExposure {
  toolCount: number;
  expectedToolCount: number;
  actualToolNames: string[];
  allowedDefaultToolNames: string[];
  unexpectedToolNames: string[];
  missingExpectedToolNames: string[];
  nonCodingDefaultEnabled: boolean;
  caveat: string;
}

export interface V2Tier1PrecheckInput {
  evidence?: ReadonlyArray<V2Tier1EvidenceRef>;
  missingEvidencePaths?: ReadonlyArray<string>;
  defaultToolNames?: ReadonlyArray<string>;
  allowedDefaultToolNames?: ReadonlyArray<string>;
}

export interface V2Tier1PrecheckResult {
  slice: 'D128';
  milestone: 'v2.0';
  tier: 'Tier-1';
  passed: boolean;
  summary: string;
  completedChecks: number;
  blockingChecks: number;
  checks: V2Tier1PrecheckCheck[];
  blockers: string[];
  nextActions: string[];
  defaultExposure: V2Tier1DefaultExposure;
}

export const DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES = [
  'read_file',
  'write_file',
  'edit_file',
  'bash',
  'find',
  'grep',
  'patch',
  'search_files',
  'execute_code',
  'todo',
  'plan',
  'browser_action',
  'browser_js',
  'parse_file',
  'get_symbols',
  'analyze_repo',
  'find_definition',
  'find_references',
  'call_graph',
  'rename_symbol',
  'smart_search',
] as const;

export const DEFAULT_V2_TIER1_PRECHECK_EVIDENCE: readonly V2Tier1EvidenceRef[] = [
  {
    id: 'd126-browser-observation-source',
    checkId: 'browser-tier1-foundation',
    path: 'packages/coding-agent/src/browser/observation.ts',
    kind: 'source',
    layer: 'helper-layer',
    note: 'D126 semantic DOM extraction, page summary, element ranking, and action history helpers.',
  },
  {
    id: 'd126-browser-planner-source',
    checkId: 'browser-tier1-foundation',
    path: 'packages/coding-agent/src/browser/planner.ts',
    kind: 'source',
    layer: 'helper-layer',
    note: 'D126 deterministic Browser action planner selection helpers.',
  },
  {
    id: 'd126-browser-observation-test',
    checkId: 'browser-tier1-foundation',
    path: 'packages/coding-agent/test/unit/browser-observation.test.ts',
    kind: 'test',
    layer: 'helper-layer',
    note: 'D126 observation and ranking unit coverage.',
  },
  {
    id: 'd126-browser-planner-test',
    checkId: 'browser-tier1-foundation',
    path: 'packages/coding-agent/test/unit/browser-planner.test.ts',
    kind: 'test',
    layer: 'helper-layer',
    note: 'D126 planner repeat-action avoidance coverage.',
  },
  {
    id: 'd127-memory-ranking-source',
    checkId: 'memory-ranking',
    path: 'packages/coding-agent/src/memory/ranking.ts',
    kind: 'source',
    layer: 'helper-layer',
    note: 'D127 explainable memory scores, factors, reasons, and stable tie-breaking.',
  },
  {
    id: 'd127-memory-store-source',
    checkId: 'memory-ranking',
    path: 'packages/coding-agent/src/memory/store.ts',
    kind: 'source',
    layer: 'helper-layer',
    note: 'D127 MemoryStore.rank integration.',
  },
  {
    id: 'd127-memory-ranking-test',
    checkId: 'memory-ranking',
    path: 'packages/coding-agent/test/unit/memory-ranking.test.ts',
    kind: 'test',
    layer: 'helper-layer',
    note: 'D127 score-factor and query/source ranking coverage.',
  },
  {
    id: 'd127-memory-store-test',
    checkId: 'memory-ranking',
    path: 'packages/coding-agent/test/unit/memory-store.test.ts',
    kind: 'test',
    layer: 'helper-layer',
    note: 'D127 store-level ranking coverage.',
  },
  {
    id: 'd127-semantic-index-source',
    checkId: 'code-intel-semantic-fallback',
    path: 'packages/code-intel/src/semantic-index.ts',
    kind: 'source',
    layer: 'helper-layer',
    note: 'D127 deterministic lexical semantic fallback with matched tokens and coverage.',
  },
  {
    id: 'd127-smart-search-source',
    checkId: 'code-intel-semantic-fallback',
    path: 'packages/coding-agent/src/tools/smart-search.ts',
    kind: 'source',
    layer: 'helper-layer',
    note: 'D127 smart_search semantic_fallback integration and metadata.',
  },
  {
    id: 'd127-semantic-index-test',
    checkId: 'code-intel-semantic-fallback',
    path: 'packages/code-intel/test/unit/semantic-index.test.ts',
    kind: 'test',
    layer: 'helper-layer',
    note: 'D127 semantic-index evidence coverage.',
  },
  {
    id: 'd127-smart-search-semantic-test',
    checkId: 'code-intel-semantic-fallback',
    path: 'packages/coding-agent/test/unit/smart-search-semantic.test.ts',
    kind: 'test',
    layer: 'helper-layer',
    note: 'D127 free-text smart_search semantic fallback coverage.',
  },
  {
    id: 'default-registry-source',
    checkId: 'default-exposure',
    path: 'packages/coding-agent/src/tools/registry.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'Default registry factory and opt-in async boundary.',
  },
  {
    id: 'default-registry-invariant-test',
    checkId: 'default-exposure',
    path: 'packages/coding-agent/test/unit/default-registry-invariant.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'Narrow-default invariant coverage.',
  },
];

const CHECK_ORDER: readonly V2Tier1PrecheckCheckId[] = [
  'browser-tier1-foundation',
  'memory-ranking',
  'code-intel-semantic-fallback',
  'default-exposure',
  'production-browser-automation',
  'visual-grounding',
  'tier2-blockers',
];

const CHECK_LABELS: Record<V2Tier1PrecheckCheckId, string> = {
  'browser-tier1-foundation': 'Browser Tier-1 helper foundation',
  'memory-ranking': 'Explainable Memory Ranking',
  'code-intel-semantic-fallback': 'Code Intel semantic fallback',
  'default-exposure': 'Default registry exposure invariant',
  'production-browser-automation': 'Production Browser automation proof',
  'visual-grounding': 'Visual grounding proof',
  'tier2-blockers': 'v2.0 Tier-2 blockers',
};

const CHECK_CAVEATS: Record<V2Tier1PrecheckCheckId, string> = {
  'browser-tier1-foundation': 'Helper-layer evidence only; not live production automation.',
  'memory-ranking': 'Deterministic local ranking evidence; not a full long-term memory system.',
  'code-intel-semantic-fallback': 'Heuristic lexical fallback; not embedding or LSP-grade semantics.',
  'default-exposure': 'Narrow default must remain coding plus Code Intel essentials.',
  'production-browser-automation': 'Release-blocking production Browser automation proof is absent.',
  'visual-grounding': 'Release-blocking visual grounding proof is absent.',
  'tier2-blockers': 'Tier-2 blockers remain separate and unresolved.',
};

const BLOCKED_CHECKS: ReadonlyMap<V2Tier1PrecheckCheckId, string> = new Map([
  ['production-browser-automation', 'production Browser automation proof is still missing'],
  ['visual-grounding', 'visual grounding proof is still missing'],
  ['tier2-blockers', 'Tier-2 v2.0 blockers remain tracked separately'],
]);

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

export function evaluateV2Tier1Precheck(input: V2Tier1PrecheckInput = {}): V2Tier1PrecheckResult {
  const evidence = input.evidence ?? DEFAULT_V2_TIER1_PRECHECK_EVIDENCE;
  const missingEvidencePaths = new Set(input.missingEvidencePaths ?? []);
  const defaultExposure = evaluateDefaultExposure(input);
  const checks = CHECK_ORDER.map((checkId) => {
    if (checkId === 'default-exposure') {
      return buildDefaultExposureCheck(evidence, missingEvidencePaths, defaultExposure);
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
    slice: 'D128',
    milestone: 'v2.0',
    tier: 'Tier-1',
    passed,
    summary: passed
      ? 'v2.0 Tier-1 precheck passed.'
      : 'v2.0 Tier-1 helper evidence is present, but v2.0 is not release-ready.',
    completedChecks: checks.filter((check) => check.status === 'pass').length,
    blockingChecks: checks.filter((check) => check.status !== 'pass').length,
    checks,
    blockers,
    nextActions: [
      'D129: prove production Browser automation and visual-grounding behavior without expanding default exposure.',
      'Keep Tier-2 v2.0 blockers separate from helper-layer evidence.',
      'Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.',
    ],
    defaultExposure,
  };
}

function buildEvidenceCheck(
  id: V2Tier1PrecheckCheckId,
  evidence: ReadonlyArray<V2Tier1EvidenceRef>,
  missingEvidencePaths: ReadonlySet<string>,
): V2Tier1PrecheckCheck {
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

function buildDefaultExposureCheck(
  evidence: ReadonlyArray<V2Tier1EvidenceRef>,
  missingEvidencePaths: ReadonlySet<string>,
  defaultExposure: V2Tier1DefaultExposure,
): V2Tier1PrecheckCheck {
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
  id: V2Tier1PrecheckCheckId,
  blocker: string,
): V2Tier1PrecheckCheck {
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

function evaluateDefaultExposure(input: V2Tier1PrecheckInput): V2Tier1DefaultExposure {
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
      'browser_action and browser_js are coding-surface helpers in the default registry, not production Browser completion proof.',
  };
}

function isEvidencePresent(
  evidence: V2Tier1EvidenceRef,
  missingEvidencePaths: ReadonlySet<string>,
): boolean {
  return evidence.present !== false && !missingEvidencePaths.has(evidence.path);
}

function unique(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}
