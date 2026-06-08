import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.3.5)', () => {
  it('contains 33 tools (27 + 4 productivity)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(33);
  });

  it('registers notion / linear / airtable / ocr_and_documents', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('notion')).toBeDefined();
    expect(reg.get('linear')).toBeDefined();
    expect(reg.get('airtable')).toBeDefined();
    expect(reg.get('ocr_and_documents')).toBeDefined();
  });
});
