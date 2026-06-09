import { describe, expect, it } from 'vitest';
import { observeHtml } from '../../src/browser/observation.js';

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
