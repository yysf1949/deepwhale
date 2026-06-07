import { describe, it, expect } from 'vitest';
import { reviewChecklist } from '../../src/skills/requesting-code-review.js';

describe('requesting-code-review', () => {
  it('returns review checklist items', () => {
    const items = reviewChecklist();
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(i => i.toLowerCase().includes('security'))).toBe(true);
  });
  it('flags blocking categories', () => {
    const flags = reviewChecklist({ category: 'block' });
    expect(flags.length).toBeGreaterThan(0);
  });
});