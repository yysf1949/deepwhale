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
});
