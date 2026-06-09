import { describe, expect, it } from 'vitest';
import { observeHtml } from '../../src/browser/observation.js';

describe('browser visual element labels', () => {
  it('returns labeled visible elements with confidence', () => {
    const obs = observeHtml({
      url: 'https://example.com',
      title: 'Example',
      html: '<button>Buy now</button><input aria-label="Email" type="email" />',
    });
    expect(obs.visibleElements.length).toBeGreaterThan(0);
    for (const el of obs.visibleElements) {
      expect(typeof el.label).toBe('string');
      expect(typeof el.confidence).toBe('number');
      expect(el.confidence).toBeGreaterThanOrEqual(0);
      expect(el.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('reuses the text content of buttons and links as their label', () => {
    const obs = observeHtml({
      url: 'https://example.com',
      title: 'Example',
      html: '<button>Submit</button><a href="/x">Click me</a>',
    });
    const button = obs.visibleElements.find((e) => e.tag === 'button');
    const link = obs.visibleElements.find((e) => e.tag === 'a');
    expect(button?.label).toMatch(/Submit/);
    expect(link?.label).toMatch(/Click me/);
    expect(button?.confidence).toBeGreaterThan(0.8);
    expect(link?.confidence).toBeGreaterThan(0.8);
  });
});
