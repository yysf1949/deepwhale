import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.3.5 + D-32.1.7)', () => {
  it('contains 33 tools (27 + 4 productivity + 4 code-intel)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(37);
  });

  it('registers notion / linear / airtable / ocr_and_documents', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('notion')).toBeDefined();
    expect(reg.get('linear')).toBeDefined();
    expect(reg.get('airtable')).toBeDefined();
    expect(reg.get('ocr_and_documents')).toBeDefined();
  });
});
