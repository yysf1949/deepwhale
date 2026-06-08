import { describe, it, expect } from 'vitest';
import {
  getLanguageForExtension,
  getWasmPathForLanguage,
  listSupportedLanguages,
  displayName,
  type LanguageId,
} from '../../src/languages.js';

describe('languages (D-32.1)', () => {
  it('detects typescript from .ts', () => {
    expect(getLanguageForExtension('foo.ts')).toBe('typescript');
    expect(getLanguageForExtension('/abs/path/Bar.ts')).toBe('typescript');
  });

  it('detects tsx from .tsx', () => {
    expect(getLanguageForExtension('Component.tsx')).toBe('tsx');
  });

  it('detects javascript from .js / .mjs / .cjs / .jsx', () => {
    expect(getLanguageForExtension('foo.js')).toBe('javascript');
    expect(getLanguageForExtension('foo.mjs')).toBe('javascript');
    expect(getLanguageForExtension('foo.cjs')).toBe('javascript');
    expect(getLanguageForExtension('foo.jsx')).toBe('javascript');
  });

  it('detects python from .py', () => {
    expect(getLanguageForExtension('foo.py')).toBe('python');
  });

  it('detects go from .go', () => {
    expect(getLanguageForExtension('foo.go')).toBe('go');
  });

  it('detects bash from .sh and .bash', () => {
    expect(getLanguageForExtension('foo.sh')).toBe('bash');
    expect(getLanguageForExtension('foo.bash')).toBe('bash');
  });

  it('detects rust from .rs', () => {
    expect(getLanguageForExtension('foo.rs')).toBe('rust');
  });

  it('returns null for unknown extensions', () => {
    expect(getLanguageForExtension('foo.xyz')).toBeNull();
    expect(getLanguageForExtension('foo.cpp')).toBeNull();
    expect(getLanguageForExtension('foo')).toBeNull();
  });

  it('handles path with query/fragment', () => {
    expect(getLanguageForExtension('foo.ts?v=1')).toBe('typescript');
    expect(getLanguageForExtension('foo.ts#abc')).toBe('typescript');
  });

  it('handles Windows backslash separators', () => {
    expect(getLanguageForExtension('C:\\abs\\path\\foo.ts')).toBe('typescript');
  });

  it('handles Windows extended-length paths without treating the prefix as a query', () => {
    expect(getLanguageForExtension('\\\\?\\C:\\abs\\path\\foo.ts')).toBe('typescript');
  });

  it('resolves wasm path for each language', () => {
    const langs: Array<'typescript' | 'tsx' | 'javascript' | 'python' | 'go' | 'bash' | 'rust'> =
      ['typescript', 'tsx', 'javascript', 'python', 'go', 'bash', 'rust'];
    for (const l of langs) {
      const p = getWasmPathForLanguage(l);
      expect(p).toMatch(/\.wasm$/);
      expect(p.length).toBeGreaterThan(10);
    }
  });

  it('throws for unknown language', () => {
    expect(() => getWasmPathForLanguage('cobol' as unknown as LanguageId)).toThrow(/unsupported/);
  });

  it('lists all 7 supported languages (typescript + tsx + 5 others)', () => {
    const langs = listSupportedLanguages();
    expect(langs.length).toBe(7);
    expect(langs).toContain('typescript');
    expect(langs).toContain('tsx');
    expect(langs).toContain('javascript');
    expect(langs).toContain('python');
    expect(langs).toContain('go');
    expect(langs).toContain('bash');
    expect(langs).toContain('rust');
  });

  it('displayName returns pretty name for known languages', () => {
    expect(displayName('typescript')).toBe('TypeScript');
    expect(displayName('python')).toBe('Python');
    expect(displayName('unknown')).toBe('unknown');
  });
});
