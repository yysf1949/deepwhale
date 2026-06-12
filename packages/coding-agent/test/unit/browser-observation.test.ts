import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_LIMIT,
  isRepeatedAction,
  normalizeActionHistory,
  observeHtml,
  rankElementsForIntent,
  summarizePage,
} from '../../src/browser/observation.js';

describe('browser foundation opt in', () => {
  it('summarizes DOM, ranks elements, and records action history', () => {
    const observation = observeHtml({
      url: 'https://example.test',
      title: 'Example',
      html: '<main><button>Buy now</button><input aria-label="Search" /></main>',
      actionHistory: [{ type: 'navigate', target: 'https://example.test', result: 'success' }],
    });

    expect(observation.domSummary).toContain('button');
    expect(observation.visibleElements[0]).toMatchObject({ text: 'Buy now' });
    expect(observation.actionHistory).toHaveLength(1);
  });
});

describe('browser observation semantics', () => {
  it('extracts buttons, links, inputs, headings, forms, and landmarks with DOM order and selectors', () => {
    const html = `
      <html>
        <body>
          <header><nav><a href="/home">Home</a></nav></header>
          <main>
            <h1>Welcome</h1>
            <form id="login" name="login">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" placeholder="you@example.com" />
              <label for="pw">Password</label>
              <input id="pw" name="password" type="password" aria-label="Password" />
              <button type="submit">Sign in</button>
            </form>
            <a href="/signup" id="signup-link">Create account</a>
            <div role="button" id="cta" data-action="open-modal">Open modal</div>
          </main>
          <footer><a href="/help">Help</a></footer>
        </body>
      </html>
    `;

    const observation = observeHtml({ url: 'https://example.test', title: 'Welcome', html });

    const kinds = observation.visibleElements.map((e) => e.semanticKind).filter(Boolean);
    expect(kinds).toContain('heading');
    expect(kinds).toContain('form');
    expect(kinds).toContain('input');
    expect(kinds).toContain('link');
    expect(kinds).toContain('action');
    expect(kinds).toContain('landmark');

    const h1 = observation.visibleElements.find((e) => e.text === 'Welcome');
    expect(h1).toBeDefined();
    expect(h1!.tag).toBe('h1');
    expect(h1!.semanticKind).toBe('heading');
    expect(h1!.domOrder).toBeTypeOf('number');
    expect(h1!.selector).toBeTypeOf('string');

    const email = observation.visibleElements.find((e) => e.name === 'email');
    expect(email).toBeDefined();
    expect(email!.tag).toBe('input');
    expect(email!.semanticKind).toBe('input');
    expect(email!.formName).toBe('login');
    expect(email!.placeholder).toBe('you@example.com');
    expect(email!.actionable).toBe(true);
    expect(email!.disabled).toBe(false);

    const submit = observation.visibleElements.find((e) => e.text === 'Sign in');
    expect(submit).toBeDefined();
    expect(submit!.semanticKind).toBe('action');
    expect(submit!.actionable).toBe(true);

    const signup = observation.visibleElements.find((e) => e.id === 'signup-link');
    expect(signup).toBeDefined();
    expect(signup!.href).toBe('/signup');

    const cta = observation.visibleElements.find((e) => e.role === 'button');
    expect(cta).toBeDefined();
    expect(cta!.semanticKind).toBe('action');
    expect(cta!.actionable).toBe(true);

    const nav = observation.visibleElements.find((e) => e.tag === 'nav');
    expect(nav).toBeDefined();
    expect(nav!.semanticKind).toBe('landmark');

    const form = observation.visibleElements.find((e) => e.tag === 'form');
    expect(form).toBeDefined();
    expect(form!.semanticKind).toBe('form');
    expect(form!.name).toBe('login');

    const domOrders = observation.visibleElements
      .map((e) => e.domOrder)
      .filter((n): n is number => typeof n === 'number');
    const sorted = [...domOrders].sort((a, b) => a - b);
    expect(domOrders).toEqual(sorted);
  });

  it('marks disabled elements as non-actionable while keeping them visible', () => {
    const html =
      '<form><input id="x" name="x" type="text" disabled /><button id="ok" disabled>Go</button><button id="still-ok" aria-disabled="false">Still ok</button></form>';

    const observation = observeHtml({ url: 'https://example.test', title: 't', html });

    const input = observation.visibleElements.find((e) => e.id === 'x');
    expect(input).toBeDefined();
    expect(input!.disabled).toBe(true);
    expect(input!.actionable).toBe(false);

    const button = observation.visibleElements.find((e) => e.id === 'ok');
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
    expect(button!.actionable).toBe(false);

    const ariaFalseButton = observation.visibleElements.find((e) => e.id === 'still-ok');
    expect(ariaFalseButton).toBeDefined();
    expect(ariaFalseButton!.disabled).toBe(false);
    expect(ariaFalseButton!.actionable).toBe(true);
  });

  it('treats role-backed interactive elements as actionable semantic elements', () => {
    const html = `
      <main>
        <div role="link" id="docs-link">Open docs</div>
        <span role="switch" id="dark-mode">Dark mode</span>
        <div role="BUTTON" id="case-action">Case insensitive action</div>
      </main>
    `;

    const observation = observeHtml({ url: 'https://example.test', title: 'roles', html });

    const roleLink = observation.visibleElements.find((e) => e.id === 'docs-link');
    expect(roleLink).toBeDefined();
    expect(roleLink!.semanticKind).toBe('link');
    expect(roleLink!.actionable).toBe(true);

    const roleSwitch = observation.visibleElements.find((e) => e.id === 'dark-mode');
    expect(roleSwitch).toBeDefined();
    expect(roleSwitch!.semanticKind).toBe('action');
    expect(roleSwitch!.actionable).toBe(true);

    const caseAction = observation.visibleElements.find((e) => e.id === 'case-action');
    expect(caseAction).toBeDefined();
    expect(caseAction!.role).toBe('button');
    expect(caseAction!.semanticKind).toBe('action');
    expect(caseAction!.actionable).toBe(true);
  });

  it('keeps backwards-compatible tag/text/ariaLabel/href fields on the existing elements', () => {
    const observation = observeHtml({
      url: 'https://example.test',
      title: 'Example',
      html: '<main><button>Buy now</button><input aria-label="Search" /><a href="/x">X</a></main>',
    });

    expect(observation.visibleElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: 'button', text: 'Buy now' }),
        expect.objectContaining({ tag: 'input', ariaLabel: 'Search' }),
        expect.objectContaining({ tag: 'a', href: '/x', text: 'X' }),
      ]),
    );
  });
});

describe('browser page summary and history', () => {
  const html = `
    <html>
      <head><title>Search results</title></head>
      <body>
        <header><nav><a href="/home">Home</a></nav></header>
        <main>
          <h1>Search</h1>
          <form name="search">
            <input name="q" type="search" placeholder="Search..." />
            <button type="submit">Search</button>
          </form>
          <h2>Results</h2>
          <a href="/r/1">Result one</a>
          <a href="/r/2">Result two</a>
        </main>
      </body>
    </html>
  `;

  it('exposes a structured page summary with counts, headings, forms, links, primary action, and recent actions', () => {
    const observation = observeHtml({
      url: 'https://example.test/search',
      title: 'Search results',
      html,
      actionHistory: [
        { type: 'navigate', target: 'https://example.test/search', result: 'success' },
        { type: 'type', target: 'Search', result: 'success' },
        { type: 'click', target: 'Search', result: 'success' },
      ],
    });

    expect(observation.pageSummary.title).toBe('Search results');
    expect(observation.pageSummary.url).toBe('https://example.test/search');
    expect(observation.pageSummary.counts.action).toBeGreaterThanOrEqual(1);
    expect(observation.pageSummary.counts.input).toBeGreaterThanOrEqual(1);
    expect(observation.pageSummary.counts.link).toBeGreaterThanOrEqual(2);
    expect(observation.pageSummary.counts.form).toBeGreaterThanOrEqual(1);
    expect(observation.pageSummary.counts.landmark).toBeGreaterThanOrEqual(1);

    expect(observation.pageSummary.headings).toContain('Search');
    expect(observation.pageSummary.forms).toContain('search');
    expect(observation.pageSummary.links).toEqual(
      expect.arrayContaining([
        { text: 'Result one', href: '/r/1' },
        { text: 'Result two', href: '/r/2' },
      ]),
    );
    expect(observation.pageSummary.landmarks).toEqual(expect.arrayContaining(['header', 'main', 'nav']));
    expect(observation.pageSummary.primaryAction).toBeTypeOf('string');
    expect(observation.pageSummary.recentActions).toHaveLength(3);
  });

  it('keeps only the most recent five actions in the bounded history', () => {
    const observation = observeHtml({
      url: 'https://example.test',
      title: 't',
      html: '<button>Go</button>',
      actionHistory: Array.from({ length: 9 }, (_, i) => ({
        type: 'click',
        target: `t${i}`,
        result: 'success',
      })),
    });

    expect(observation.actionHistory).toHaveLength(5);
    expect(observation.pageSummary.recentActions).toHaveLength(5);
    expect(observation.actionHistory[0]?.target).toBe('t4');
    expect(observation.actionHistory[4]?.target).toBe('t8');
  });

  it('detects repeated type+target pairs in the latest matching action', () => {
    const history = [
      { type: 'click', target: 'Search', result: 'success' },
      { type: 'type', target: 'q', result: 'success' },
    ];

    expect(isRepeatedAction(history, 'type', 'q')).toBe(true);
    expect(isRepeatedAction(history, 'type', 'other')).toBe(false);
    expect(isRepeatedAction([], 'type', 'q')).toBe(false);
  });

  it('normalizeActionHistory caps history length and preserves order', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      type: 'click',
      target: `t${i}`,
    }));

    const normalized = normalizeActionHistory(history);
    expect(normalized).toHaveLength(DEFAULT_HISTORY_LIMIT);
    expect(normalized[0]?.target).toBe('t7');

    const custom = normalizeActionHistory(history, 3);
    expect(custom).toHaveLength(3);
    expect(custom[0]?.target).toBe('t9');

    const empty = normalizeActionHistory(undefined);
    expect(empty).toEqual([]);
  });

  it('summarizePage is callable on already-extracted elements and is deterministic', () => {
    const observation = observeHtml({
      url: 'https://example.test/search',
      title: 'Search results',
      html,
      actionHistory: [{ type: 'click', target: 'Search' }],
    });
    const direct = summarizePage(observation.visibleElements, {
      url: 'https://example.test/search',
      title: 'Search results',
      actionHistory: observation.actionHistory,
    });
    expect(direct.headings).toEqual(observation.pageSummary.headings);
    expect(direct.counts).toEqual(observation.pageSummary.counts);
    expect(direct.primaryAction).toBe(observation.pageSummary.primaryAction);
  });

  it('rankElementsForIntent returns scored elements with a deterministic order', () => {
    const observation = observeHtml({
      url: 'https://example.test/search',
      title: 'Search results',
      html,
    });
    const ranked = rankElementsForIntent({
      type: 'type',
      userIntent: 'search products',
      elements: observation.visibleElements,
      actionHistory: observation.actionHistory,
    });
    expect(ranked[0]?.element.semanticKind).toBe('input');
    expect(ranked[0]?.element.name).toBe('q');
    expect(ranked[0]?.target).toBe('q');
    expect(ranked[0]?.reason).toContain('input target');
  });
});
