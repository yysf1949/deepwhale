import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { buildCallGraph, buildSymbolGraph, type CallEdge, type Reference } from './symbol-graph.js';
import { getLanguageForExtension } from './languages.js';

const DEFAULT_IGNORES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  '.turbo',
  'coverage',
  '.deepwhale',
  'undefined',
]);

export interface Gate1Options {
  repoPath: string;
  minLoc?: number;
  preferredLoc?: number;
  timeboxMs?: number;
  maxDepth?: number;
  entrySymbol: string;
  requiredCall: {
    callerSymbol: string;
    calleeSymbol: string;
  };
  modificationPoint: {
    file: string;
    symbol: string;
  };
}

export interface Gate1Metrics {
  loc: number;
  supportedFiles: number;
  filesIndexed: number;
  symbolsIndexed: number;
  referencesIndexed: number;
  callEdges: number;
  elapsedMs: number;
  graphBuildMs: number;
  callGraphMs: number;
  minLoc: number;
  preferredLoc: number;
  timeboxMs: number;
}

export interface Gate1LocStats {
  loc: number;
  files: number;
}

export interface Gate1Evidence {
  entry?: Gate1SymbolEvidence;
  callChain: CallEdge[];
  modificationPoint?: Gate1SymbolEvidence;
}

export interface Gate1SymbolEvidence {
  file: string;
  symbol: string;
  line: number;
  col: number;
  kind: Reference['kind'];
}

export type Gate1LocQualification = 'below-minimum' | 'minimum-50k' | 'preferred-100k';

export interface Gate1Result {
  passed: boolean;
  failureReasons: string[];
  repoPath: string;
  locQualification: Gate1LocQualification;
  metrics: Gate1Metrics;
  evidence: Gate1Evidence;
}

export interface Gate1CliConfig {
  options: Gate1Options;
  jsonOut?: string;
  mdOut?: string;
}

export interface Gate1ParsedArgs {
  options?: Gate1Options;
  scenarioPath?: string;
  jsonOut?: string;
  mdOut?: string;
}

export async function runGate1(options: Gate1Options): Promise<Gate1Result> {
  const started = Date.now();
  const repoPath = resolve(options.repoPath);
  const minLoc = options.minLoc ?? 50_000;
  const preferredLoc = options.preferredLoc ?? 100_000;
  const timeboxMs = options.timeboxMs ?? 20 * 60 * 1000;

  const locStats = await countSupportedLoc(repoPath, options.maxDepth);
  const graphStarted = Date.now();
  const graph = await buildSymbolGraph(repoPath, options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth });
  const graphBuildMs = Date.now() - graphStarted;
  const callStarted = Date.now();
  const callGraph = await buildCallGraph(graph);
  const callGraphMs = Date.now() - callStarted;
  const elapsedMs = Date.now() - started;

  const entry = firstSymbolEvidence(graph.byName.get(options.entrySymbol), options.entrySymbol);
  const modificationPoint = findModificationPoint(
    graph.byName.get(options.modificationPoint.symbol),
    options.modificationPoint,
  );
  const callChain = callGraph.edges.filter((edge) => {
    return (
      symbolIdName(edge.caller) === options.requiredCall.callerSymbol &&
      symbolIdName(edge.callee) === options.requiredCall.calleeSymbol
    );
  });

  const metrics: Gate1Metrics = {
    loc: locStats.loc,
    supportedFiles: locStats.files,
    filesIndexed: graph.files.size,
    symbolsIndexed: [...graph.files.values()].reduce((sum, file) => sum + file.symbols.length, 0),
    referencesIndexed: [...graph.byName.values()].reduce((sum, refs) => sum + refs.length, 0),
    callEdges: callGraph.edges.length,
    elapsedMs,
    graphBuildMs,
    callGraphMs,
    minLoc,
    preferredLoc,
    timeboxMs,
  };

  const failureReasons: string[] = [];
  if (metrics.loc < minLoc) failureReasons.push(`loc-below-minimum: ${metrics.loc} < ${minLoc}`);
  if (elapsedMs > timeboxMs) failureReasons.push(`timebox-exceeded: ${elapsedMs}ms > ${timeboxMs}ms`);
  if (!entry) failureReasons.push(`entry-not-found: ${options.entrySymbol}`);
  if (callChain.length === 0) {
    failureReasons.push(
      `call-chain-not-found: ${options.requiredCall.callerSymbol} -> ${options.requiredCall.calleeSymbol}`,
    );
  }
  if (!modificationPoint) {
    failureReasons.push(`modification-point-not-found: ${options.modificationPoint.file}:${options.modificationPoint.symbol}`);
  }

  const evidence: Gate1Evidence = { callChain };
  if (entry) evidence.entry = entry;
  if (modificationPoint) evidence.modificationPoint = modificationPoint;

  return {
    passed: failureReasons.length === 0,
    failureReasons,
    repoPath,
    locQualification: qualifyLoc(metrics),
    metrics,
    evidence,
  };
}

export async function readGate1Scenario(scenarioPath: string): Promise<Gate1Options> {
  const absScenarioPath = resolve(scenarioPath);
  const scenarioDir = dirname(absScenarioPath);
  const raw = JSON.parse(stripUtf8Bom(await readFile(absScenarioPath, 'utf8'))) as unknown;
  const scenario = asRecord(raw, 'scenario');

  return {
    repoPath: resolve(scenarioDir, requiredString(scenario, 'repoPath')),
    entrySymbol: requiredString(scenario, 'entrySymbol'),
    requiredCall: {
      callerSymbol: requiredString(asRecord(scenario.requiredCall, 'requiredCall'), 'callerSymbol'),
      calleeSymbol: requiredString(asRecord(scenario.requiredCall, 'requiredCall'), 'calleeSymbol'),
    },
    modificationPoint: {
      file: requiredString(asRecord(scenario.modificationPoint, 'modificationPoint'), 'file'),
      symbol: requiredString(asRecord(scenario.modificationPoint, 'modificationPoint'), 'symbol'),
    },
    ...optionalNumberProps(scenario, ['minLoc', 'preferredLoc', 'timeboxMs', 'maxDepth']),
  };
}

export function parseGate1Args(args: string[], cwd = process.cwd()): Gate1ParsedArgs {
  const values = parseFlagValues(args);
  const jsonOut = values.get('json');
  const mdOut = values.get('md');
  const scenario = values.get('scenario');
  const parsed: Gate1ParsedArgs = {};
  if (jsonOut) parsed.jsonOut = jsonOut;
  if (mdOut) parsed.mdOut = mdOut;
  if (scenario) {
    parsed.scenarioPath = resolve(cwd, scenario);
    return parsed;
  }

  const repoPath = values.get('repo');
  const entrySymbol = values.get('entry');
  const callerSymbol = values.get('caller');
  const calleeSymbol = values.get('callee');
  const modFile = values.get('mod-file');
  const modSymbol = values.get('mod-symbol');
  if (!repoPath || !entrySymbol || !callerSymbol || !calleeSymbol || !modFile || !modSymbol) {
    throw new Error(
      [
        'gate1-args-required: expected --repo, --entry, --caller, --callee, --mod-file, and --mod-symbol',
        'optional: --scenario, --min-loc, --preferred-loc, --timebox-ms, --max-depth, --json, --md',
      ].join('\n'),
    );
  }

  const options: Gate1Options = {
    repoPath: resolve(cwd, repoPath),
    entrySymbol,
    requiredCall: {
      callerSymbol,
      calleeSymbol,
    },
    modificationPoint: {
      file: modFile,
      symbol: modSymbol,
    },
    ...optionalNumberFlags(values),
  };
  parsed.options = options;
  return parsed;
}

export async function loadGate1CliConfig(args: string[], cwd = process.cwd()): Promise<Gate1CliConfig> {
  const parsed = parseGate1Args(args, cwd);
  const options = parsed.scenarioPath ? await readGate1Scenario(parsed.scenarioPath) : parsed.options;
  if (!options) throw new Error('gate1-args-required: no Gate-1 scenario or direct options provided');
  const config: Gate1CliConfig = { options };
  if (parsed.jsonOut) config.jsonOut = parsed.jsonOut;
  if (parsed.mdOut) config.mdOut = parsed.mdOut;
  return config;
}

export async function countSupportedLoc(repoPath: string, maxDepth = 8): Promise<Gate1LocStats> {
  const abs = resolve(repoPath);
  const s = await stat(abs);
  if (!s.isDirectory()) throw new Error(`not-a-directory: ${abs}`);
  const files: string[] = [];
  await walk(abs, abs, 0, maxDepth, files);
  let loc = 0;
  let supportedFiles = 0;
  for (const file of files) {
    if (!getLanguageForExtension(file)) continue;
    supportedFiles += 1;
    const source = await readFile(file, 'utf8').catch(() => '');
    loc += source.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }
  return { loc, files: supportedFiles };
}

async function walk(root: string, dir: string, depth: number, maxDepth: number, out: string[]): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, depth + 1, maxDepth, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

function firstSymbolEvidence(refs: Reference[] | undefined, symbol: string): Gate1SymbolEvidence | undefined {
  const ref = refs?.find((candidate) => candidate.kind === 'declaration') ?? refs?.[0];
  if (!ref) return undefined;
  return { file: ref.file, symbol, line: ref.line, col: ref.col, kind: ref.kind };
}

function findModificationPoint(
  refs: Reference[] | undefined,
  expected: Gate1Options['modificationPoint'],
): Gate1SymbolEvidence | undefined {
  const normalizedFile = expected.file.split(/[\\/]+/).join('/');
  const ref = refs?.find((candidate) => candidate.file === normalizedFile && candidate.kind === 'declaration');
  if (!ref) return undefined;
  return { file: ref.file, symbol: expected.symbol, line: ref.line, col: ref.col, kind: ref.kind };
}

function symbolIdName(id: string): string {
  const afterFile = id.split(':').slice(1).join(':');
  return afterFile.split('.').pop() ?? afterFile;
}

function parseFlagValues(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`gate1-arg-invalid: ${arg}`);
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`gate1-arg-missing-value: --${key}`);
    values.set(key, value);
    i += 1;
  }
  return values;
}

function optionalNumberFlags(values: Map<string, string>): Partial<Gate1Options> {
  const options: Partial<Gate1Options> = {};
  setNumberFlag(options, 'minLoc', values.get('min-loc'));
  setNumberFlag(options, 'preferredLoc', values.get('preferred-loc'));
  setNumberFlag(options, 'timeboxMs', values.get('timebox-ms'));
  setNumberFlag(options, 'maxDepth', values.get('max-depth'));
  return options;
}

function setNumberFlag(options: Partial<Gate1Options>, key: keyof Gate1Options, raw: string | undefined): void {
  if (raw === undefined) return;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`gate1-arg-invalid-number: ${String(key)}=${raw}`);
  Object.assign(options, { [key]: value });
}

function optionalNumberProps(input: Record<string, unknown>, keys: Array<keyof Gate1Options>): Partial<Gate1Options> {
  const options: Partial<Gate1Options> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`gate1-scenario-invalid-number: ${String(key)}`);
    }
    Object.assign(options, { [key]: value });
  }
  return options;
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`gate1-scenario-invalid-object: ${name}`);
  }
  return value as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`gate1-scenario-required-string: ${key}`);
  }
  return value;
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function qualifyLoc(metrics: Gate1Metrics): Gate1LocQualification {
  if (metrics.loc < metrics.minLoc) return 'below-minimum';
  if (metrics.loc < metrics.preferredLoc) return 'minimum-50k';
  return 'preferred-100k';
}

export function formatGate1Markdown(result: Gate1Result): string {
  const lines = [
    `# Gate-1 Result`,
    ``,
    `Status: ${result.passed ? 'passed' : 'failed'}`,
    `Repo: ${result.repoPath}`,
    ``,
    `## Metrics`,
    ``,
    `- LOC: ${result.metrics.loc} (minimum ${result.metrics.minLoc}, preferred ${result.metrics.preferredLoc})`,
    `- LOC qualification: ${result.locQualification}`,
    `- Supported files: ${result.metrics.supportedFiles}`,
    `- Files indexed: ${result.metrics.filesIndexed}`,
    `- Symbols indexed: ${result.metrics.symbolsIndexed}`,
    `- References indexed: ${result.metrics.referencesIndexed}`,
    `- Call edges: ${result.metrics.callEdges}`,
    `- Graph build: ${result.metrics.graphBuildMs}ms`,
    `- Call graph: ${result.metrics.callGraphMs}ms`,
    `- Elapsed: ${result.metrics.elapsedMs}ms / ${result.metrics.timeboxMs}ms`,
    ``,
    `## Evidence`,
    ``,
    `- Entry: ${formatEvidence(result.evidence.entry)}`,
    `- Modification point: ${formatEvidence(result.evidence.modificationPoint)}`,
    `- Call chain edges: ${result.evidence.callChain.length}`,
    ...result.evidence.callChain.slice(0, 20).map((edge) => `  - ${edge.caller} -> ${edge.callee} @ ${edge.file}:${edge.line}`),
  ];
  if (result.failureReasons.length > 0) {
    lines.push('', '## Failure Reasons', '', ...result.failureReasons.map((reason) => `- ${reason}`));
  }
  return `${lines.join('\n')}\n`;
}

function formatEvidence(evidence: Gate1SymbolEvidence | undefined): string {
  if (!evidence) return '(missing)';
  return `${evidence.symbol} at ${evidence.file}:${evidence.line}:${evidence.col} (${evidence.kind})`;
}
