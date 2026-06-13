export interface BrowserActionRecord {
  type: string;
  target: string;
  result?: string;
}

export interface ObserveHtmlInput {
  url: string;
  title: string;
  html: string;
  actionHistory?: ReadonlyArray<BrowserActionRecord>;
}

export type SemanticKind = 'action' | 'input' | 'link' | 'heading' | 'form' | 'landmark' | 'text';

export interface VisibleElement {
  tag: string;
  text?: string;
  ariaLabel?: string;
  href?: string;
  id?: string;
  role?: string;
  name?: string;
  placeholder?: string;
  value?: string;
  type?: string;
  formName?: string;
  selector?: string;
  semanticKind?: SemanticKind;
  actionable?: boolean;
  disabled?: boolean;
  domOrder?: number;
}

export interface PageSummary {
  title: string;
  url: string;
  counts: Record<string, number>;
  headings: string[];
  forms: string[];
  links: { text: string; href: string }[];
  landmarks: string[];
  primaryAction?: string;
  recentActions: BrowserActionRecord[];
}

export interface RankedElement {
  element: VisibleElement;
  target: string;
  score: number;
  repeated: boolean;
  reason: string;
}

export interface Observation {
  url: string;
  title: string;
  domSummary: string;
  visibleElements: VisibleElement[];
  actionHistory: BrowserActionRecord[];
  pageSummary: PageSummary;
  rankedElements: RankedElement[];
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LANDMARK_TAGS = new Set(['header', 'nav', 'main', 'footer', 'aside', 'section']);
const INPUT_TAGS = new Set(['input', 'textarea', 'select']);
const FORM_TAGS = new Set(['form']);
const INTERACTIVE_ROLES = new Set(['button', 'link', 'menuitem', 'checkbox', 'radio', 'switch', 'tab']);

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function describeElementTarget(el: VisibleElement): string {
  return el.ariaLabel ?? el.text ?? el.name ?? el.placeholder ?? el.href ?? el.selector ?? '';
}

function getAttr(attributesBlock: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attributesBlock);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3] ?? undefined;
}

function hasAttr(attributesBlock: string, name: string): boolean {
  const re = new RegExp(
    `(?:^|\\s)${name}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?(?=\\s|$|/)`,
    'i',
  );
  return re.test(attributesBlock);
}

function isAriaDisabled(attributesBlock: string): boolean {
  const value = getAttr(attributesBlock, 'aria-disabled');
  return value !== undefined && value.toLowerCase() !== 'false';
}

function buildSelector(tag: string, el: VisibleElement, fallback: string): string {
  if (el.id) return `#${el.id}`;
  if (el.name) {
    return `${tag}[name="${el.name}"]`;
  }
  if (el.ariaLabel) {
    return `${tag}[aria-label="${el.ariaLabel}"]`;
  }
  if (fallback) {
    return `${tag}:contains("${fallback}")`;
  }
  return tag;
}

function detectSemanticKind(
  tag: string,
  el: VisibleElement,
  isDisabled: boolean,
): { kind: SemanticKind; actionable: boolean } {
  const lower = tag.toLowerCase();
  if (HEADING_TAGS.has(lower)) {
    return { kind: 'heading', actionable: false };
  }
  if (FORM_TAGS.has(lower)) {
    return { kind: 'form', actionable: false };
  }
  if (INPUT_TAGS.has(lower)) {
    return { kind: 'input', actionable: !isDisabled };
  }
  if (LANDMARK_TAGS.has(lower)) {
    return { kind: 'landmark', actionable: false };
  }
  if (lower === 'button' || (lower === 'div' && el.role === 'button')) {
    return { kind: 'action', actionable: !isDisabled };
  }
  if (lower === 'a' && el.href) {
    return { kind: 'link', actionable: !isDisabled };
  }
  if (el.role === 'link') {
    return { kind: 'link', actionable: !isDisabled };
  }
  if (el.role !== undefined && INTERACTIVE_ROLES.has(el.role)) {
    return { kind: 'action', actionable: !isDisabled };
  }
  return { kind: 'text', actionable: false };
}

function parseElement(
  tag: string,
  attrs: string,
  inner: string,
  startIndex: number,
  formName: string | undefined,
): VisibleElement {
  const id = getAttr(attrs, 'id');
  const ariaLabel = getAttr(attrs, 'aria-label');
  const href = getAttr(attrs, 'href');
  const name = getAttr(attrs, 'name');
  const placeholder = getAttr(attrs, 'placeholder');
  const value = getAttr(attrs, 'value');
  const type = getAttr(attrs, 'type');
  const role = getAttr(attrs, 'role')?.toLowerCase();
  const disabled = hasAttr(attrs, 'disabled') || isAriaDisabled(attrs);
  const text = collapseWhitespace(stripTags(inner));

  const baseEl: VisibleElement = {
    tag: tag.toLowerCase(),
    domOrder: startIndex,
  };
  if (id !== undefined) baseEl.id = id;
  if (ariaLabel !== undefined) baseEl.ariaLabel = ariaLabel;
  if (href !== undefined) baseEl.href = href;
  if (name !== undefined) baseEl.name = name;
  if (placeholder !== undefined) baseEl.placeholder = placeholder;
  if (value !== undefined) baseEl.value = value;
  if (type !== undefined) baseEl.type = type;
  if (role !== undefined) baseEl.role = role;
  if (formName !== undefined) baseEl.formName = formName;
  if (text) baseEl.text = text;
  baseEl.disabled = disabled;
  const { kind, actionable } = detectSemanticKind(tag, baseEl, disabled);
  baseEl.semanticKind = kind;
  baseEl.actionable = actionable;
  baseEl.selector = buildSelector(tag.toLowerCase(), baseEl, text);
  return baseEl;
}

function matchOpenTag(
  html: string,
  tag: string,
  startAt: number,
): {
  attrs: string;
  openStart: number;
  openEnd: number;
  innerStart: number;
  innerEnd: number;
  closeEnd: number;
} | null {
  const tagLower = tag.toLowerCase();
  const openRe = new RegExp(`<${tagLower}\\b([^>]*)>`, 'gi');
  openRe.lastIndex = startAt;
  const open = openRe.exec(html);
  if (!open) return null;
  const openStart = open.index;
  const openEnd = open.index + open[0].length;
  const attrs = open[1] ?? '';
  const selfClosing =
    /\/\s*$/.test(attrs) ||
    (INPUT_TAGS.has(tagLower) && tagLower !== 'textarea' && tagLower !== 'select');
  if (selfClosing) {
    return { attrs, openStart, openEnd, innerStart: openEnd, innerEnd: openEnd, closeEnd: openEnd };
  }
  const closeRe = new RegExp(`</${tagLower}\\s*>`, 'gi');
  closeRe.lastIndex = openEnd;
  const close = closeRe.exec(html);
  if (!close) {
    return { attrs, openStart, openEnd, innerStart: openEnd, innerEnd: openEnd, closeEnd: openEnd };
  }
  const innerStart = openEnd;
  const innerEnd = close.index;
  const closeEnd = close.index + close[0].length;
  return { attrs, openStart, openEnd, innerStart, innerEnd, closeEnd };
}

function buildFormSpans(html: string): { start: number; end: number; name: string }[] {
  const spans: { start: number; end: number; name: string }[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const name = getAttr(attrs, 'name') ?? getAttr(attrs, 'id');
    spans.push({ start: m.index, end: m.index + m[0].length, name: name ?? '' });
  }
  return spans;
}

function findFormName(spans: { start: number; end: number; name: string }[], pos: number): string | undefined {
  for (const span of spans) {
    if (pos > span.start && pos < span.end) {
      return span.name || undefined;
    }
  }
  return undefined;
}

function parseVisibleElements(html: string): VisibleElement[] {
  const out: VisibleElement[] = [];
  const formSpans = buildFormSpans(html);
  const knownTags = [
    'button', 'a', 'input', 'textarea', 'select', 'label',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'form', 'header', 'nav', 'main', 'footer', 'aside', 'section',
  ];
  for (const tag of knownTags) {
    let cursor = 0;
    while (true) {
      const match = matchOpenTag(html, tag, cursor);
      if (!match) break;
      const inner = html.slice(match.innerStart, match.innerEnd);
      const formName = findFormName(formSpans, match.openStart);
      const el = parseElement(tag, match.attrs, inner, match.openStart, formName);
      out.push(el);
      cursor = match.closeEnd;
    }
  }

  const roleRe = /<([a-z][a-z0-9]*)\b([^>]*\brole\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = roleRe.exec(html)) !== null) {
    const tag = (rm[1] ?? '').toLowerCase();
    const attrs = rm[2] ?? '';
    const role = rm[3] ?? rm[4] ?? rm[5] ?? '';
    if (knownTags.includes(tag)) continue;
    if (!INTERACTIVE_ROLES.has(role.toLowerCase())) continue;
    const inner = rm[6] ?? '';
    const formName = findFormName(formSpans, rm.index);
    const el = parseElement(tag, attrs, inner, rm.index, formName);
    out.push(el);
  }

  out.sort((a, b) => (a.domOrder ?? 0) - (b.domOrder ?? 0));
  return out;
}

function summarizeDom(html: string, elements: VisibleElement[], pageSummary: PageSummary): string {
  const tagCounts: Record<string, number> = {};
  for (const el of elements) {
    tagCounts[el.tag] = (tagCounts[el.tag] ?? 0) + 1;
  }
  const parts: string[] = [];
  for (const [tag, n] of Object.entries(tagCounts)) {
    if (n > 0) parts.push(`${n} ${tag}`);
  }
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const scope = mainMatch ? '<main>' : '<body>';
  const summary = parts.length > 0 ? parts.join(', ') : 'empty';
  const titlePart = pageSummary.title ? ` title="${pageSummary.title}"` : '';
  return `${scope}${titlePart}: ${summary}`;
}

export function summarizePage(elements: VisibleElement[], meta: { url: string; title: string; actionHistory: BrowserActionRecord[] }): PageSummary {
  const counts: Record<string, number> = {
    action: 0,
    input: 0,
    link: 0,
    heading: 0,
    form: 0,
    landmark: 0,
    text: 0,
  };
  const headings: string[] = [];
  const forms: string[] = [];
  const links: { text: string; href: string }[] = [];
  const landmarks: string[] = [];

  for (const el of elements) {
    const kind = el.semanticKind ?? 'text';
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (kind === 'heading' && el.text) {
      headings.push(el.text);
    }
    if (kind === 'form') {
      forms.push(el.name ?? el.id ?? el.tag);
    }
    if (kind === 'link' && el.href) {
      links.push({ text: el.text ?? '', href: el.href });
    }
    if (kind === 'landmark') {
      landmarks.push(el.tag);
    }
  }

  const ranked = rankElementsForIntent({
    type: 'click',
    userIntent: 'primary action',
    elements,
    actionHistory: meta.actionHistory,
  });
  const primaryAction = ranked[0]?.target;

  return {
    title: meta.title,
    url: meta.url,
    counts,
    headings,
    forms,
    links,
    landmarks,
    ...(primaryAction !== undefined ? { primaryAction } : {}),
    recentActions: meta.actionHistory.slice(-5),
  };
}

export const DEFAULT_HISTORY_LIMIT = 5;

export function normalizeActionHistory(
  history: ReadonlyArray<BrowserActionRecord> | undefined,
  limit: number = DEFAULT_HISTORY_LIMIT,
): BrowserActionRecord[] {
  if (!history) return [];
  const safeLimit = Math.max(0, Math.floor(limit));
  if (history.length <= safeLimit) return [...history];
  return history.slice(history.length - safeLimit);
}

export function isRepeatedAction(
  history: ReadonlyArray<BrowserActionRecord>,
  type: string,
  target: string,
): boolean {
  if (history.length === 0) return false;
  const last = history[history.length - 1]!;
  return last.type === type && last.target === target;
}

export interface RankElementsInput {
  type: 'click' | 'type' | 'navigate' | 'noop';
  userIntent: string;
  elements: ReadonlyArray<VisibleElement>;
  actionHistory?: ReadonlyArray<BrowserActionRecord>;
}

export function rankElementsForIntent(input: RankElementsInput): RankedElement[] {
  const intent = (input.userIntent ?? '').toLowerCase();
  const intentTokens = intent
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 1);
  const history = input.actionHistory ?? [];

  const scored = input.elements.map((el) => {
    let score = 0;
    const reasons: string[] = [];
    const kind = el.semanticKind ?? 'text';
    const target = describeElementTarget(el);
    const repeated = isRepeatedAction(history, input.type, target);
    const nameText = `${el.text ?? ''} ${el.ariaLabel ?? ''} ${el.name ?? ''} ${el.placeholder ?? ''} ${el.href ?? ''} ${el.role ?? ''}`.toLowerCase();

    if (input.type === 'type' && kind === 'input') {
      score += 50;
      reasons.push('input target');
      if (el.type === 'search' || el.type === 'text' || el.type === 'email' || el.type === undefined) {
        score += 20;
        reasons.push('text-capable input');
      }
    }
    if (input.type === 'click' && (kind === 'action' || kind === 'link')) {
      score += 50;
      reasons.push(`${kind} target`);
    }
    if (input.type === 'click' && (kind === 'action' || kind === 'link') && el.actionable) {
      score += 10;
      reasons.push('actionable');
    }
    if (input.type === 'navigate' && kind === 'link' && el.href) {
      score += 50;
      reasons.push('link target');
    }

    for (const token of intentTokens) {
      if (nameText.includes(token)) {
        score += 15;
        reasons.push(`matched "${token}"`);
      }
    }

    if (kind === 'heading' && intentTokens.some((t) => nameText.includes(t))) {
      score += 5;
    }
    if (kind === 'form' && intentTokens.some((t) => nameText.includes(t))) {
      score += 5;
    }
    if (el.disabled) {
      score -= 100;
      reasons.push('disabled');
    }
    if (el.domOrder !== undefined) {
      score -= el.domOrder * 0.001;
    }
    if (repeated) {
      score -= 25;
      reasons.push('repeated');
    }
    return {
      element: el,
      target,
      score,
      repeated,
      reason: reasons.length > 0 ? reasons.join(', ') : 'dom-order fallback',
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.element.domOrder ?? 0) - (b.element.domOrder ?? 0);
  });
  return scored;
}

export function observeHtml(input: ObserveHtmlInput): Observation {
  const elements = parseVisibleElements(input.html);
  const history = normalizeActionHistory(input.actionHistory);
  const pageSummary = summarizePage(elements, {
    url: input.url,
    title: input.title,
    actionHistory: history,
  });
  const rankedElements = rankElementsForIntent({
    type: 'click',
    userIntent: 'primary action',
    elements,
    actionHistory: history,
  });
  return {
    url: input.url,
    title: input.title,
    domSummary: summarizeDom(input.html, elements, pageSummary),
    visibleElements: elements,
    actionHistory: history,
    pageSummary,
    rankedElements,
  };
}
