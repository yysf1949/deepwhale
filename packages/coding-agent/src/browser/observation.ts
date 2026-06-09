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

export interface VisibleElement {
  tag: string;
  text?: string;
  ariaLabel?: string;
  href?: string;
  /** D-33.5.1: Human-readable label for visual grounding (text or aria-label). */
  label: string;
  /** D-33.5.1: Confidence 0..1 that the label is correct. */
  confidence: number;
}

export interface Observation {
  url: string;
  title: string;
  domSummary: string;
  visibleElements: VisibleElement[];
  actionHistory: BrowserActionRecord[];
}

function deriveLabel(el: { text?: string; ariaLabel?: string }): { label: string; confidence: number } {
  if (el.text && el.text.length > 0) return { label: el.text, confidence: 0.9 };
  if (el.ariaLabel && el.ariaLabel.length > 0) return { label: el.ariaLabel, confidence: 0.7 };
  return { label: '', confidence: 0.3 };
}

function parseVisibleElements(html: string): VisibleElement[] {
  const out: VisibleElement[] = [];
  const buttonRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = buttonRe.exec(html)) !== null) {
    const text = m[1]!.replace(/<[^>]+>/g, '').trim();
    const { label, confidence } = deriveLabel({ text });
    out.push({ tag: 'button', text, label, confidence });
  }
  const inputRe = /<input\b[^>]*aria-label="([^"]*)"[^>]*\/?>/gi;
  while ((m = inputRe.exec(html)) !== null) {
    const ariaLabel = m[1]!;
    const { label, confidence } = deriveLabel({ ariaLabel });
    out.push({ tag: 'input', ariaLabel, label, confidence });
  }
  const anchorRe = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = anchorRe.exec(html)) !== null) {
    const text = m[2]!.replace(/<[^>]+>/g, '').trim();
    const { label, confidence } = deriveLabel({ text });
    out.push({ tag: 'a', href: m[1]!, text, label, confidence });
  }
  return out;
}

function summarizeDom(html: string, elements: VisibleElement[]): string {
  const counts: Record<string, number> = {};
  for (const el of elements) {
    counts[el.tag] = (counts[el.tag] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([tag, n]) => `${n} ${tag}`);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const scope = mainMatch ? '<main>' : '<body>';
  return `${scope}: ${parts.join(', ') || 'empty'}`;
}

export function observeHtml(input: ObserveHtmlInput): Observation {
  const elements = parseVisibleElements(input.html);
  return {
    url: input.url,
    title: input.title,
    domSummary: summarizeDom(input.html, elements),
    visibleElements: elements,
    actionHistory: input.actionHistory ? [...input.actionHistory] : [],
  };
}
