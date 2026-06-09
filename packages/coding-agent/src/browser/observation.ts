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
}

export interface Observation {
  url: string;
  title: string;
  domSummary: string;
  visibleElements: VisibleElement[];
  actionHistory: BrowserActionRecord[];
}

function parseVisibleElements(html: string): VisibleElement[] {
  const out: VisibleElement[] = [];
  const buttonRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = buttonRe.exec(html)) !== null) {
    out.push({ tag: 'button', text: m[1]!.replace(/<[^>]+>/g, '').trim() });
  }
  const inputRe = /<input\b[^>]*aria-label="([^"]*)"[^>]*\/?>/gi;
  while ((m = inputRe.exec(html)) !== null) {
    out.push({ tag: 'input', ariaLabel: m[1]! });
  }
  const anchorRe = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = anchorRe.exec(html)) !== null) {
    out.push({ tag: 'a', href: m[1]!, text: m[2]!.replace(/<[^>]+>/g, '').trim() });
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
