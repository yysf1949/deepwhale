export type V2Tier1PrecheckCheckId =
  | 'browser-tier1-foundation'
  | 'memory-ranking'
  | 'code-intel-semantic-fallback'
  | 'default-exposure'
  | 'production-browser-automation'
  | 'visual-grounding'
  | 'tier2-automation'
  | 'tier2-remote-tui'
  | 'tier2-compaction'
  | 'tier2-mcp-runtime';

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
  slice: 'D132';
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
  {
    id: 'd129-production-browser-proof-source',
    checkId: 'production-browser-automation',
    path: 'packages/coding-agent/src/browser/production-proof.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D129 injected production Browser adapter contract and transcript proof recorder.',
  },
  {
    id: 'd129-production-browser-proof-test',
    checkId: 'production-browser-automation',
    path: 'packages/coding-agent/test/unit/production-browser-proof.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D129 automation transcript coverage for opt-in, success, and failed-step paths.',
  },
  {
    id: 'd129-production-browser-proof-evidence',
    checkId: 'production-browser-automation',
    path: 'docs/superpowers/v2-production-browser-proof.json',
    kind: 'gate',
    layer: 'release-gate',
    note: 'D129 machine-readable production Browser proof snapshot.',
  },
  {
    id: 'd129-visual-grounding-source',
    checkId: 'visual-grounding',
    path: 'packages/coding-agent/src/browser/production-proof.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D129 visual snapshot metadata validation for dimensions, hash, non-blank ratio, and target rects.',
  },
  {
    id: 'd129-visual-grounding-test',
    checkId: 'visual-grounding',
    path: 'packages/coding-agent/test/unit/production-browser-proof.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D129 visual-grounding success and invalid-snapshot coverage.',
  },
  {
    id: 'd129-visual-grounding-evidence',
    checkId: 'visual-grounding',
    path: 'docs/superpowers/v2-production-browser-proof.json',
    kind: 'gate',
    layer: 'release-gate',
    note: 'D129 machine-readable visual-grounding proof snapshot.',
  },
  {
    id: 'd132-automation-runtime-source',
    checkId: 'tier2-automation',
    path: 'packages/coding-agent/src/util/automation-runtime.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D132 injected automation runtime executes enabled CronStore jobs through a caller-provided runner and records outcomes.',
  },
  {
    id: 'd132-cron-store-source',
    checkId: 'tier2-automation',
    path: 'packages/coding-agent/src/util/cron-store.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D132 CronStore persists success and failed automation run records in cron/runs.json.',
  },
  {
    id: 'd132-cron-daemon-source',
    checkId: 'tier2-automation',
    path: 'packages/coding-agent/src/util/cron-daemon.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D132 reuses the existing CronDaemon timer/listing boundary for enabled-job ticks.',
  },
  {
    id: 'd132-automation-runtime-test',
    checkId: 'tier2-automation',
    path: 'packages/coding-agent/test/unit/automation-runtime.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D132 runtime coverage for injected runner execution, disabled-job skipping, success records, failure records, and continue-after-failure behavior.',
  },
  {
    id: 'd132-cron-store-test',
    checkId: 'tier2-automation',
    path: 'packages/coding-agent/test/unit/cron-store.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D132 CronStore run-record persistence coverage.',
  },
  {
    id: 'd132-cron-daemon-test',
    checkId: 'tier2-automation',
    path: 'packages/coding-agent/test/unit/cron-daemon.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D132 continues to rely on existing CronDaemon timer and enabled-job filtering coverage.',
  },
  {
    id: 'd130-compaction-core-source',
    checkId: 'tier2-compaction',
    path: 'packages/core/src/session/compaction.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D130 core compaction implementation with token-budget tail, summary replacement, latch, and lifecycle hook evidence.',
  },
  {
    id: 'd130-agent-compaction-source',
    checkId: 'tier2-compaction',
    path: 'packages/coding-agent/src/agent/agent-compaction.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D130 tool-loop compaction integration writes compaction and compaction_paused session events.',
  },
  {
    id: 'd130-print-compaction-source',
    checkId: 'tier2-compaction',
    path: 'packages/coding-agent/src/modes/print.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D130 print mode can inject AgentCompactionConfig into the tool-loop path when session persistence exists.',
  },
  {
    id: 'd130-rpc-compaction-source',
    checkId: 'tier2-compaction',
    path: 'packages/coding-agent/src/modes/rpc.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D130 RPC mode can reuse AgentCompactionConfig across chat requests with session persistence.',
  },
  {
    id: 'd130-core-compaction-test',
    checkId: 'tier2-compaction',
    path: 'packages/core/test/session-compaction.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D130 deterministic core compaction coverage for trigger, replacement, tail budget, and latch behavior.',
  },
  {
    id: 'd130-agent-compaction-test',
    checkId: 'tier2-compaction',
    path: 'packages/coding-agent/test/agent-compaction-2d6.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D130 agent compaction coverage for tool-loop integration and system-prefix replaced_range alignment.',
  },
  {
    id: 'd130-compaction-hook-test',
    checkId: 'tier2-compaction',
    path: 'packages/core/test/session-compaction-hook.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D130 lifecycle hook coverage proving compaction is the prefix-cache reset point.',
  },
  {
    id: 'd130-cross-protocol-compaction-test',
    checkId: 'tier2-compaction',
    path: 'packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D130 integration smoke coverage for compaction across supported protocol paths.',
  },
  {
    id: 'd131-mcp-client-source',
    checkId: 'tier2-mcp-runtime',
    path: 'packages/coding-agent/src/mcp/client.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D131 minimal coding-agent stdio JSON-RPC MCP client with initialize, tools/list, and tools/call roundtrip support.',
  },
  {
    id: 'd131-mcp-runtime-source',
    checkId: 'tier2-mcp-runtime',
    path: 'packages/coding-agent/src/mcp/runtime.ts',
    kind: 'source',
    layer: 'release-gate',
    note: 'D131 existing opt-in capability registration path for MCP tool manifests.',
  },
  {
    id: 'd131-mcp-client-test',
    checkId: 'tier2-mcp-runtime',
    path: 'packages/coding-agent/test/unit/mcp-client.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D131 client roundtrip test against the gh-search MCP server plus default-profile capability isolation.',
  },
  {
    id: 'd131-mcp-runtime-test',
    checkId: 'tier2-mcp-runtime',
    path: 'packages/coding-agent/test/unit/mcp-runtime.test.ts',
    kind: 'test',
    layer: 'release-gate',
    note: 'D131 existing manifest registration remains opt-in only.',
  },
  {
    id: 'd131-gh-search-server-source',
    checkId: 'tier2-mcp-runtime',
    path: 'packages/mcp-servers/gh-search/bin/gh-search-mcp.mjs',
    kind: 'source',
    layer: 'release-gate',
    note: 'D131 existing gh-search MCP server (stdio JSON-RPC) used as the roundtrip target.',
  },
  {
    id: 'd131-gh-search-server-test',
    checkId: 'tier2-mcp-runtime',
    path: 'packages/mcp-servers/gh-search/test/server.test.mjs',
    kind: 'test',
    layer: 'release-gate',
    note: 'D131 existing server-side stdio JSON-RPC roundtrip tests.',
  },
];

const CHECK_ORDER: readonly V2Tier1PrecheckCheckId[] = [
  'browser-tier1-foundation',
  'memory-ranking',
  'code-intel-semantic-fallback',
  'default-exposure',
  'production-browser-automation',
  'visual-grounding',
  'tier2-automation',
  'tier2-remote-tui',
  'tier2-compaction',
  'tier2-mcp-runtime',
];

const CHECK_LABELS: Record<V2Tier1PrecheckCheckId, string> = {
  'browser-tier1-foundation': 'Browser Tier-1 helper foundation',
  'memory-ranking': 'Explainable Memory Ranking',
  'code-intel-semantic-fallback': 'Code Intel semantic fallback',
  'default-exposure': 'Default registry exposure invariant',
  'production-browser-automation': 'Production Browser automation proof',
  'visual-grounding': 'Visual grounding proof',
  'tier2-automation': 'Tier-2 Automation',
  'tier2-remote-tui': 'Tier-2 Remote TUI',
  'tier2-compaction': 'Tier-2 Compaction',
  'tier2-mcp-runtime': 'Tier-2 MCP Runtime',
};

const CHECK_CAVEATS: Record<V2Tier1PrecheckCheckId, string> = {
  'browser-tier1-foundation': 'Helper-layer evidence only; not live production automation.',
  'memory-ranking': 'Deterministic local ranking evidence; not a full long-term memory system.',
  'code-intel-semantic-fallback': 'Heuristic lexical fallback; not embedding or LSP-grade semantics.',
  'default-exposure': 'Narrow default must remain coding plus Code Intel essentials.',
  'production-browser-automation':
    'Adapter-contract proof with transcript evidence; not default Browser exposure.',
  'visual-grounding':
    'Visual snapshot metadata proof; raw screenshot bytes are not stored in repository evidence.',
  'tier2-automation':
    'Injected runner plus persisted run-record proof; not a full hosted/no-agent automation service.',
  'tier2-remote-tui': 'Remote TUI remains a separate Tier-2 blocker.',
  'tier2-compaction':
    'Compaction has implementation and integration evidence, but this does not complete v2.0.',
  'tier2-mcp-runtime':
    'One-server stdio JSON-RPC transport proof; not a full multiplexed MCP runtime with auth, reconnect, HTTP/SSE, resources, prompts, or subscriptions.',
};

const BLOCKED_CHECKS: ReadonlyMap<V2Tier1PrecheckCheckId, string> = new Map([
  ['tier2-remote-tui', 'Tier-2 Remote TUI remains blocked'],
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
    slice: 'D132',
    milestone: 'v2.0',
    tier: 'Tier-1',
    passed,
    summary: passed
      ? 'v2.0 Tier-1 precheck passed.'
      : 'v2.0 Tier-1 evidence plus Tier-2 Automation, Compaction, and MCP Runtime evidence are present, but v2.0 is not release-ready.',
    completedChecks: checks.filter((check) => check.status === 'pass').length,
    blockingChecks: checks.filter((check) => check.status !== 'pass').length,
    checks,
    blockers,
    nextActions: [
      'D133: close or explicitly defer the remaining v2.0 Tier-2 Remote TUI blocker without expanding default exposure.',
      'Keep the remaining Tier-2 v2.0 Remote TUI blocker separate from Automation, Compaction, and MCP Runtime evidence.',
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
