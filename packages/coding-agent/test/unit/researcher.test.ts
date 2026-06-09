import { describe, expect, it } from 'vitest';
import { createResearcher } from '../../src/researcher/researcher.js';

describe('researcher role', () => {
  it('returns observations from read-only exploration', async () => {
    const researcher = createResearcher({ readFile: async () => 'export const value = 1;' });

    await expect(researcher.inspectFile('src/index.ts')).resolves.toMatchObject({
      source: 'codebase',
      rawData: expect.stringContaining('value'),
    });
  });

  it('cannot modify files or execute production actions', async () => {
    const researcher = createResearcher({ readFile: async () => '' });

    await expect(researcher.writeFile('src/index.ts', 'change')).rejects.toThrow(/researcher cannot modify files/);
    await expect(researcher.runCommand('pnpm test')).rejects.toThrow(/researcher cannot execute commands/);
  });

  it('returns an empty observation when search is not configured', async () => {
    const researcher = createResearcher({ readFile: async () => '' });
    const obs = await researcher.search('anything');
    expect(obs).toMatchObject({ source: 'codebase', query: 'anything' });
  });
});
