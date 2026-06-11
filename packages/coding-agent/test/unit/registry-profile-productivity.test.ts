import { describe, it, expect } from 'vitest';
import { createRegistryForProfile } from '../../src/tools/registry.js';

describe('registry (D-31.3.5 + D-32.1.7)', () => {
  it('all profile contains 44 tools', async () => {
    const reg = await createRegistryForProfile({ profile: 'all' });
    expect(reg.size()).toBe(42);
  });

  it('productivity profile registers notion / linear / airtable / ocr_and_documents', async () => {
    const reg = await createRegistryForProfile({ profile: 'productivity' });
    expect(reg.get('notion')).toBeDefined();
    expect(reg.get('linear')).toBeDefined();
    expect(reg.get('airtable')).toBeDefined();
    expect(reg.get('ocr_and_documents')).toBeDefined();
  });
});
