import { describe, it, expect } from 'vitest';
import { parseExploreCommand, runExplore } from '../../../src/slash/explore.js';
import { resolve } from 'node:path';

const FIXTURE_DIR = resolve(
  process.cwd(),
  'packages/code-intel/test/fixtures'
);

describe('/explore slash (D-32.1.6)', () => {
  it('parseExploreCommand parses /explore <file>', () => {
    expect(parseExploreCommand('/explore foo.ts')).toEqual({ file: 'foo.ts' });
    expect(parseExploreCommand('/explore  "bar.ts"')).toEqual({ file: 'bar.ts' });
    expect(parseExploreCommand('/explore  baz.ts  ')).toEqual({ file: 'baz.ts' });
  });

  it('parseExploreCommand returns null for non-/explore', () => {
    expect(parseExploreCommand('/help')).toBeNull();
    expect(parseExploreCommand('/verify')).toBeNull();
    expect(parseExploreCommand('foo bar')).toBeNull();
    expect(parseExploreCommand('/explore')).toBeNull(); // missing arg
  });

  it('runExplore returns ok + symbols for a valid file', async () => {
    const r = await runExplore(resolve(FIXTURE_DIR, 'typescript.ts'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.symbols.length).toBeGreaterThan(0);
      expect(r.language).toBe('typescript');
    }
  });

  it('runExplore returns error for missing file', async () => {
    const r = await runExplore('/nonexistent/file.ts');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.message).toMatch(/ENOENT|no such file|cannot find/i);
    }
  });
});
