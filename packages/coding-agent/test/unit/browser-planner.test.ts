import { describe, expect, it } from 'vitest';
import { observeHtml } from '../../src/browser/observation.js';
import { planBrowserAction } from '../../src/browser/planner.js';

describe('browser foundation opt in', () => {
  it('plans a click for a matching element', () => {
    const action = planBrowserAction({
      userIntent: 'click buy',
      observation: observeHtml({ url: 'https://example.test', title: 'Example', html: '<button>Buy now</button>' }),
    });

    expect(action).toMatchObject({ type: 'click', target: expect.stringContaining('Buy now') });
  });

  it('uses semantic ranking to choose the best typing target', () => {
    const action = planBrowserAction({
      userIntent: 'type laptop into search',
      observation: observeHtml({
        url: 'https://example.test',
        title: 'Catalog',
        html: `
          <main>
            <input name="newsletter" placeholder="Email address" />
            <form name="site-search">
              <input name="q" type="search" placeholder="Search products" aria-label="Product search" />
              <button>Search</button>
            </form>
          </main>
        `,
      }),
    });

    expect(action).toMatchObject({
      type: 'type',
      target: 'Product search',
      reason: expect.stringContaining('ranked'),
    });
    expect(action.rankedTargets?.[0]).toMatchObject({
      target: 'Product search',
      semanticKind: 'input',
    });
  });

  it('prefers actionable matching click targets over disabled or mismatched elements', () => {
    const action = planBrowserAction({
      userIntent: 'click checkout',
      observation: observeHtml({
        url: 'https://example.test/cart',
        title: 'Cart',
        html: `
          <main>
            <button disabled>Checkout</button>
            <a href="/cart">View cart</a>
            <button id="checkout">Checkout now</button>
          </main>
        `,
      }),
    });

    expect(action.type).toBe('click');
    expect(action.target).toBe('Checkout now');
    expect(action.rankedTargets?.[0]).toMatchObject({
      target: 'Checkout now',
      semanticKind: 'action',
    });
  });

  it('avoids repeating the same click target when another suitable target exists', () => {
    const action = planBrowserAction({
      userIntent: 'click next result',
      observation: observeHtml({
        url: 'https://example.test/results',
        title: 'Results',
        html: `
          <main>
            <button>Next result</button>
            <a href="/results?page=2">Next page</a>
          </main>
        `,
        actionHistory: [{ type: 'click', target: 'Next result', result: 'success' }],
      }),
    });

    expect(action).toMatchObject({
      type: 'click',
      target: 'Next page',
      repeated: false,
    });
    expect(action.rankedTargets?.[0]?.target).toBe('Next page');
  });

  it('marks the plan as repeated when no non-repeated candidate exists', () => {
    const action = planBrowserAction({
      userIntent: 'click retry',
      observation: observeHtml({
        url: 'https://example.test/error',
        title: 'Error',
        html: '<main><button>Retry</button></main>',
        actionHistory: [{ type: 'click', target: 'Retry', result: 'failed' }],
      }),
    });

    expect(action).toMatchObject({
      type: 'click',
      target: 'Retry',
      repeated: true,
    });
  });
});
