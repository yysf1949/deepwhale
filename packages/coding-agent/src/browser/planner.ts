import {
  describeElementTarget,
  isRepeatedAction,
  rankElementsForIntent,
  type Observation,
  type RankedElement,
  type SemanticKind,
} from './observation.js';

export interface PlanBrowserActionInput {
  userIntent: string;
  observation: Observation;
}

export interface BrowserActionPlan {
  type: 'click' | 'type' | 'navigate' | 'noop';
  target: string;
  reason?: string;
  rankedTargets?: BrowserActionCandidate[];
  repeated?: boolean;
}

export interface BrowserActionCandidate {
  target: string;
  semanticKind?: SemanticKind;
  selector?: string;
  score: number;
  repeated: boolean;
  reason: string;
}

const TYPE_KEYWORDS = ['type', 'enter', 'input', 'fill'];
const CLICK_KEYWORDS = ['click', 'press', 'tap', 'select'];
const NAVIGATE_KEYWORDS = ['go to', 'navigate', 'open', 'visit'];

function classify(intent: string): BrowserActionPlan['type'] {
  const lower = intent.toLowerCase();
  if (TYPE_KEYWORDS.some((k) => lower.includes(k))) return 'type';
  if (CLICK_KEYWORDS.some((k) => lower.includes(k))) return 'click';
  if (NAVIGATE_KEYWORDS.some((k) => lower.includes(k))) return 'navigate';
  return 'noop';
}

function toCandidate(ranked: RankedElement): BrowserActionCandidate {
  const candidate: BrowserActionCandidate = {
    target: ranked.target,
    score: ranked.score,
    repeated: ranked.repeated,
    reason: ranked.reason,
  };
  if (ranked.element.semanticKind !== undefined) {
    candidate.semanticKind = ranked.element.semanticKind;
  }
  if (ranked.element.selector !== undefined) {
    candidate.selector = ranked.element.selector;
  }
  return candidate;
}

function pickRankedTarget(
  type: BrowserActionPlan['type'],
  ranked: ReadonlyArray<RankedElement>,
  history: Observation['actionHistory'],
): { selected?: RankedElement; rankedTargets: BrowserActionCandidate[]; repeated: boolean } {
  const candidates = ranked.filter((item) => item.target.length > 0);
  const rankedTargets = candidates.slice(0, 5).map(toCandidate);
  if (type === 'noop') {
    return { rankedTargets, repeated: false };
  }

  const selected = candidates.find((item) => !item.repeated) ?? candidates[0];
  if (!selected) {
    return { rankedTargets, repeated: false };
  }

  const target = describeElementTarget(selected.element);
  return {
    selected,
    rankedTargets,
    repeated: isRepeatedAction(history, type, target),
  };
}

export function planBrowserAction(input: PlanBrowserActionInput): BrowserActionPlan {
  const type = classify(input.userIntent);
  const ranked = rankElementsForIntent({
    type,
    userIntent: input.userIntent,
    elements: input.observation.visibleElements,
    actionHistory: input.observation.actionHistory,
  });
  const { selected, rankedTargets, repeated } = pickRankedTarget(
    type,
    ranked,
    input.observation.actionHistory,
  );
  const target = selected?.target ?? '';
  const plan: BrowserActionPlan = {
    type,
    target,
    reason: selected ? `ranked: ${selected.reason}` : 'no ranked target',
    rankedTargets,
    repeated,
  };
  return plan;
}
