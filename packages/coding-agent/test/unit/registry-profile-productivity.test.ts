import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.3.5 + D-32.1.7)', () => {
  it('all profile contains 41 tools', () => {
    const reg = createDefaultRegistry({ profile: 'all' });
    expect(reg.size()).toBe(41);
  });

  it('productivity profile registers notion / linear / airtable / ocr_and_documents', () => {
    const reg = createDefaultRegistry({ profile: 'productivity' });
    expect(reg.get('notion')).toBeDefined();
    expect(reg.get('linear')).toBeDefined();
    expect(reg.get('airtable')).toBeDefined();
    expect(reg.get('ocr_and_documents')).toBeDefined();
  });
});
