import type { Observation, VisibleElement } from './observation.js';

export interface PlanBrowserActionInput {
  userIntent: string;
  observation: Observation;
  /** D-33.5.1: prior failed actions to use for strategic recovery. */
  failureHistory?: ReadonlyArray<{ action: { type: string; target: string }; failureReason: string }>;
}

export interface BrowserActionPlan {
  type: 'click' | 'type' | 'navigate' | 'noop' | 'skip';
  target: string;
  reason?: string;
}

export type FailureReason = 'recently-failed' | 'too-many-failures' | 'element-not-clickable' | 'timeout';

const TYPE_KEYWORDS = ['type', 'enter', 'input', 'fill'];
const CLICK_KEYWORDS = ['click', 'press', 'tap', 'select'];
const NAVIGATE_KEYWORDS = ['go to', 'navigate', 'open', 'visit'];
const SKIP_THRESHOLD = 2;

function classify(intent: string): BrowserActionPlan['type'] {
  const lower = intent.toLowerCase();
  if (TYPE_KEYWORDS.some((k) => lower.includes(k))) return 'type';
  if (CLICK_KEYWORDS.some((k) => lower.includes(k))) return 'click';
  if (NAVIGATE_KEYWORDS.some((k) => lower.includes(k))) return 'navigate';
  return 'noop';
}

function pickTarget(intent: string, elements: ReadonlyArray<VisibleElement>): string {
  const lower = intent.toLowerCase();
  for (const el of elements) {
    if (el.text && lower.includes(el.text.toLowerCase())) return el.text;
    if (el.ariaLabel && lower.includes(el.ariaLabel.toLowerCase())) return el.ariaLabel;
  }
  return elements[0]?.text ?? elements[0]?.ariaLabel ?? '';
}

function recentFailureCount(
  failureHistory: ReadonlyArray<{ action: { type: string; target: string } }> | undefined,
  target: string,
): number {
  if (!failureHistory) return 0;
  return failureHistory.filter((f) => f.action.target === target).length;
}

function strategicRecovery(
  failureHistory: ReadonlyArray<{ action: { type: string; target: string }; failureReason: string }> | undefined,
  classifiedType: BrowserActionPlan['type'],
  proposedTarget: string,
  elements: ReadonlyArray<VisibleElement>,
): BrowserActionPlan {
  if (!failureHistory || failureHistory.length === 0) {
    return { type: classifiedType, target: proposedTarget };
  }
  // Adaptive retry: skip target with > SKIP_THRESHOLD failures.
  if (recentFailureCount(failureHistory, proposedTarget) > SKIP_THRESHOLD) {
    return { type: 'skip', target: '', reason: 'too-many-failures' };
  }
  // Strategic recovery: any failure on this target should escalate to a different action.
  const lastFailureOnTarget = [...failureHistory].reverse().find((f) => f.action.target === proposedTarget);
  if (lastFailureOnTarget) {
    if (lastFailureOnTarget.action.type === 'click' && classifiedType !== 'type') {
      // Recovery: try `type` on an adjacent input.
      const input = elements.find((e) => e.tag === 'input');
      if (input) {
        return { type: 'type', target: input.text ?? input.ariaLabel ?? '', reason: 'recovery-from-click-fail' };
      }
      return { type: 'navigate', target: '', reason: 'recovery-from-click-fail' };
    }
    if (lastFailureOnTarget.action.type === 'type' && classifiedType !== 'click') {
      return { type: 'click', target: proposedTarget, reason: 'recovery-from-type-fail' };
    }
    return { type: 'skip', target: proposedTarget, reason: 'recently-failed' };
  }
  return { type: classifiedType, target: proposedTarget };
}

export function planBrowserAction(input: PlanBrowserActionInput): BrowserActionPlan {
  const type = classify(input.userIntent);
  const target = pickTarget(input.userIntent, input.observation.visibleElements);
  return strategicRecovery(input.failureHistory, type, target, input.observation.visibleElements);
}
