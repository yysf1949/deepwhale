import type { Observation, VisibleElement } from './observation.js';

export interface PlanBrowserActionInput {
  userIntent: string;
  observation: Observation;
}

export interface BrowserActionPlan {
  type: 'click' | 'type' | 'navigate' | 'noop';
  target: string;
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

function pickTarget(intent: string, elements: ReadonlyArray<VisibleElement>): string {
  const lower = intent.toLowerCase();
  for (const el of elements) {
    if (el.text && lower.includes(el.text.toLowerCase())) return el.text;
    if (el.ariaLabel && lower.includes(el.ariaLabel.toLowerCase())) return el.ariaLabel;
  }
  return elements[0]?.text ?? elements[0]?.ariaLabel ?? '';
}

export function planBrowserAction(input: PlanBrowserActionInput): BrowserActionPlan {
  const type = classify(input.userIntent);
  const target = pickTarget(input.userIntent, input.observation.visibleElements);
  return { type, target };
}
