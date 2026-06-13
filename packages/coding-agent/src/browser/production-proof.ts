export type ProductionBrowserCommandKind =
  | 'navigate'
  | 'click'
  | 'type'
  | 'observe'
  | 'visual-snapshot';

export type ProductionBrowserProofStatus = 'pass' | 'blocked' | 'fail';
export type ProductionBrowserStepStatus = 'success' | 'failed';
export type ProductionBrowserProofSkipReason = 'opt-in-required' | 'adapter-missing' | 'empty-scenario';

export interface ProductionBrowserNavigateCommand {
  kind: 'navigate';
  url: string;
}

export interface ProductionBrowserClickCommand {
  kind: 'click';
  selector: string;
  label?: string;
}

export interface ProductionBrowserTypeCommand {
  kind: 'type';
  selector: string;
  value: string;
}

export interface ProductionBrowserObserveCommand {
  kind: 'observe';
  selector?: string;
}

export interface ProductionBrowserVisualSnapshotCommand {
  kind: 'visual-snapshot';
  selector?: string;
}

export type ProductionBrowserCommand =
  | ProductionBrowserNavigateCommand
  | ProductionBrowserClickCommand
  | ProductionBrowserTypeCommand
  | ProductionBrowserObserveCommand
  | ProductionBrowserVisualSnapshotCommand;

export interface ProductionBrowserProofScenario {
  id: string;
  url: string;
  goal: string;
  steps: ReadonlyArray<ProductionBrowserCommand>;
}

export interface ProductionBrowserTargetRect {
  selector: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductionBrowserVisualSnapshot {
  width: number;
  height: number;
  sha256: string;
  nonBlankRatio: number;
  targetRects: ReadonlyArray<ProductionBrowserTargetRect>;
}

export interface ProductionBrowserAdapterContext {
  scenarioId: string;
  stepIndex: number;
  currentUrl?: string;
  currentTitle?: string;
  transcript: ReadonlyArray<ProductionBrowserTranscriptRow>;
}

export interface ProductionBrowserAdapterResult {
  status: ProductionBrowserStepStatus;
  kind: ProductionBrowserCommandKind;
  target: string;
  ms: number;
  urlAfter?: string;
  titleAfter?: string;
  summary?: string;
  error?: string | null;
  visual?: ProductionBrowserVisualSnapshot;
}

export type ProductionBrowserAdapter = (
  command: ProductionBrowserCommand,
  context: ProductionBrowserAdapterContext,
) => Promise<ProductionBrowserAdapterResult>;

export interface ProductionBrowserTranscriptRow {
  index: number;
  kind: ProductionBrowserCommandKind;
  target: string;
  status: ProductionBrowserStepStatus;
  ms: number;
  urlAfter?: string;
  titleAfter?: string;
  summary?: string;
  error?: string;
  visual?: ProductionBrowserVisualSnapshot;
}

export interface RecordProductionBrowserProofInput {
  generatedAt: string;
  optIn: boolean;
  scenario: ProductionBrowserProofScenario;
  adapter?: ProductionBrowserAdapter;
}

export interface ProductionBrowserProof {
  slice: 'D129';
  proofKind: 'production-browser-proof';
  generatedAt: string;
  scenarioId: string;
  goal: string;
  passed: boolean;
  automationStatus: ProductionBrowserProofStatus;
  visualGroundingStatus: ProductionBrowserProofStatus;
  transcript: ReadonlyArray<ProductionBrowserTranscriptRow>;
  visualSnapshots: ReadonlyArray<ProductionBrowserVisualSnapshot>;
  blockers: string[];
  summary: string;
  skipReason?: ProductionBrowserProofSkipReason;
}

const SHA256_RE = /^sha256:[a-f0-9]{64}$/i;

export function isValidProductionBrowserVisualSnapshot(
  visual: ProductionBrowserVisualSnapshot | undefined,
): visual is ProductionBrowserVisualSnapshot {
  if (!visual) return false;
  return (
    Number.isFinite(visual.width) &&
    visual.width > 0 &&
    Number.isFinite(visual.height) &&
    visual.height > 0 &&
    SHA256_RE.test(visual.sha256) &&
    Number.isFinite(visual.nonBlankRatio) &&
    visual.nonBlankRatio > 0 &&
    visual.nonBlankRatio <= 1 &&
    visual.targetRects.some(
      (rect) =>
        rect.selector.trim().length > 0 &&
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        rect.width > 0 &&
        Number.isFinite(rect.height) &&
        rect.height > 0,
    )
  );
}

export async function recordProductionBrowserProof(
  input: RecordProductionBrowserProofInput,
): Promise<ProductionBrowserProof> {
  if (!input.optIn) {
    return skipped(input, 'opt-in-required', 'production Browser proof requires explicit opt-in');
  }
  if (!input.adapter) {
    return skipped(input, 'adapter-missing', 'production Browser adapter is missing');
  }
  if (input.scenario.steps.length === 0) {
    return skipped(input, 'empty-scenario', 'production Browser proof scenario has no steps');
  }

  const transcript: ProductionBrowserTranscriptRow[] = [];
  const visualSnapshots: ProductionBrowserVisualSnapshot[] = [];
  let currentUrl: string | undefined = input.scenario.url;
  let currentTitle: string | undefined;

  for (const [index, command] of input.scenario.steps.entries()) {
    const context = buildContext(input.scenario.id, index, currentUrl, currentTitle, transcript);
    const result = await input.adapter(command, context);
    const row = toTranscriptRow(index, result);
    transcript.push(row);

    if (row.urlAfter !== undefined) currentUrl = row.urlAfter;
    if (row.titleAfter !== undefined) currentTitle = row.titleAfter;
    if (isValidProductionBrowserVisualSnapshot(row.visual)) {
      visualSnapshots.push(row.visual);
    }
  }

  const automationStatus = evaluateAutomationStatus(transcript);
  const visualGroundingStatus: ProductionBrowserProofStatus =
    visualSnapshots.length > 0 ? 'pass' : 'blocked';
  const blockers = buildBlockers(automationStatus, visualGroundingStatus, transcript);
  const passed =
    automationStatus === 'pass' && visualGroundingStatus === 'pass' && blockers.length === 0;

  return {
    slice: 'D129',
    proofKind: 'production-browser-proof',
    generatedAt: input.generatedAt,
    scenarioId: input.scenario.id,
    goal: input.scenario.goal,
    passed,
    automationStatus,
    visualGroundingStatus,
    transcript,
    visualSnapshots,
    blockers,
    summary: passed
      ? 'Production Browser automation and visual grounding proof passed.'
      : 'Production Browser proof is incomplete or blocked.',
  };
}

function skipped(
  input: RecordProductionBrowserProofInput,
  skipReason: ProductionBrowserProofSkipReason,
  blocker: string,
): ProductionBrowserProof {
  return {
    slice: 'D129',
    proofKind: 'production-browser-proof',
    generatedAt: input.generatedAt,
    scenarioId: input.scenario.id,
    goal: input.scenario.goal,
    passed: false,
    automationStatus: 'blocked',
    visualGroundingStatus: 'blocked',
    transcript: [],
    visualSnapshots: [],
    blockers: [blocker],
    summary: 'Production Browser proof was skipped.',
    skipReason,
  };
}

function buildContext(
  scenarioId: string,
  stepIndex: number,
  currentUrl: string | undefined,
  currentTitle: string | undefined,
  transcript: ReadonlyArray<ProductionBrowserTranscriptRow>,
): ProductionBrowserAdapterContext {
  const context: ProductionBrowserAdapterContext = {
    scenarioId,
    stepIndex,
    transcript,
  };
  if (currentUrl !== undefined) context.currentUrl = currentUrl;
  if (currentTitle !== undefined) context.currentTitle = currentTitle;
  return context;
}

function toTranscriptRow(
  index: number,
  result: ProductionBrowserAdapterResult,
): ProductionBrowserTranscriptRow {
  const row: ProductionBrowserTranscriptRow = {
    index,
    kind: result.kind,
    target: result.target,
    status: result.status,
    ms: result.ms,
  };
  if (result.urlAfter !== undefined) row.urlAfter = result.urlAfter;
  if (result.titleAfter !== undefined) row.titleAfter = result.titleAfter;
  if (result.summary !== undefined) row.summary = result.summary;
  if (result.error !== undefined && result.error !== null) row.error = result.error;
  if (result.visual !== undefined) row.visual = result.visual;
  return row;
}

function evaluateAutomationStatus(
  transcript: ReadonlyArray<ProductionBrowserTranscriptRow>,
): ProductionBrowserProofStatus {
  if (transcript.some((row) => row.status === 'failed')) return 'fail';
  const hasNavigate = transcript.some((row) => row.kind === 'navigate' && row.status === 'success');
  const hasInteraction = transcript.some(
    (row) => (row.kind === 'click' || row.kind === 'type') && row.status === 'success',
  );
  const hasObservation = transcript.some((row) => row.kind === 'observe' && row.status === 'success');
  return hasNavigate && hasInteraction && hasObservation ? 'pass' : 'blocked';
}

function buildBlockers(
  automationStatus: ProductionBrowserProofStatus,
  visualGroundingStatus: ProductionBrowserProofStatus,
  transcript: ReadonlyArray<ProductionBrowserTranscriptRow>,
): string[] {
  const blockers: string[] = [];
  if (automationStatus === 'fail') {
    blockers.push('production Browser transcript contains failed steps');
  } else if (automationStatus !== 'pass') {
    blockers.push('production Browser automation transcript is incomplete');
  }
  if (visualGroundingStatus !== 'pass') {
    blockers.push('valid visual snapshot evidence is missing');
  }
  for (const row of transcript) {
    if (row.error !== undefined && row.error.length > 0) {
      blockers.push(`step ${row.index} ${row.kind} error: ${row.error}`);
    }
  }
  return [...new Set(blockers)];
}
