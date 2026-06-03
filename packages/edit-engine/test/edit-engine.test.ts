import { describe, expect, it, vi } from 'vitest';
import type { ApplyResult, EditEngine, EditIntent, FileContent } from '../src/types.js';
import {
  createDefaultEngine,
  createEngine,
  HashlineEngine,
  UnifiedDiffEngine,
} from '../src/index.js';
import { computeLineHashes, hashLine, findAnchor } from '../src/engines/hashline/snapshots.js';

describe('Sprint 0.1: EditEngine abstraction', () => {
  describe('HashlineEngine (v1.0 default)', () => {
    it('replaces a single line by anchor', () => {
      const target: FileContent = {
        path: 'foo.ts',
        text: 'const x = 1;\nconst y = 2;\nconst z = 3;\n',
      };
      const engine = new HashlineEngine();
      const line2Hash = computeLineHashes(target.text)[1]!;
      const patch = [
        '@@ 2 ' + line2Hash + ' @@',
        'const y = 200;',
        '@@ 2 ' + line2Hash + ' @@',
      ].join('\n');

      const result = engine.apply(target, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.newText).toContain('const y = 200;');
        expect(result.newText).toContain('const x = 1;');
        expect(result.newText).toContain('const z = 3;');
      }
    });

    it('returns anchor-mismatch when hash does not match', () => {
      const target: FileContent = {
        path: 'foo.ts',
        text: 'line one\nline two\n',
      };
      const engine = new HashlineEngine();
      const patch = ['@@ 1 fff @@', 'NEW', '@@ 1 fff @@'].join('\n');

      const result = engine.apply(target, patch);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('anchor-mismatch');
      }
    });

    it('returns parse-failed for empty patch', () => {
      const target: FileContent = { path: 'a', text: 'hello\n' };
      const engine = new HashlineEngine();
      const result = engine.apply(target, 'no anchors here');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('parse-failed');
      }
    });

    it('format() round-trips through apply()', () => {
      const target: FileContent = { path: 'a', text: 'a\nb\nc\n' };
      const engine = new HashlineEngine();
      const line2Hash = computeLineHashes(target.text)[1]!;
      const intent: EditIntent = {
        file: 'a',
        anchor: { kind: 'line-hash', line: 2, hash: line2Hash },
        oldText: 'b',
        newText: 'B',
      };
      const patch = engine.format(intent);
      // 协议形态：start-anchor + new lines
      expect(patch).toMatch(/^@@\s+2\s+[0-9a-f]{3}\s+@@\s*\nB$/);

      // 关键：round-trip 必须真正 apply，否则只是 regex 匹配
      const result = engine.apply(target, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.newText).toBe('a\nB\nc\n');
      }
    });

    it('format() with multi-line newText round-trips through apply()', () => {
      // 关键回归：多行 newText 不应被 mid-anchor 切成空 block
      const target: FileContent = { path: 'a', text: 'a\nb\nc\n' };
      const engine = new HashlineEngine();
      const line2Hash = computeLineHashes(target.text)[1]!;
      const intent: EditIntent = {
        file: 'a',
        anchor: { kind: 'line-hash', line: 2, hash: line2Hash },
        oldText: 'b',
        newText: 'B1\nB2\nB3',
      };
      const patch = engine.format(intent);
      const result = engine.apply(target, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.newText).toBe('a\nB1\nB2\nB3\nc\n');
      }
    });
  });

  describe('UnifiedDiffEngine (v1.0 stub)', () => {
    it('apply() returns unsupported error', () => {
      const engine = new UnifiedDiffEngine();
      const result = engine.apply({ path: 'a', text: 'x' }, 'anything');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('unsupported');
      }
    });

    it('format() throws (v1.0 stub contract)', () => {
      const engine = new UnifiedDiffEngine();
      expect(() => engine.format({} as EditIntent)).toThrow('not implemented');
    });
  });

  describe('EditEngine abstraction — mock 2 engines', () => {
    it('caller only depends on EditEngine interface, not concrete class', () => {
      const mockEngine: EditEngine = {
        name: 'mock',
        format: vi.fn(() => 'mocked-patch'),
        apply: vi.fn((): ApplyResult => ({ ok: true, newText: 'mocked', engine: 'mock' })),
      };
      // 模拟 edit_file tool 的核心调用
      const target: FileContent = { path: 'a', text: 'old' };
      const result = mockEngine.apply(target, 'patch');
      expect(result.ok).toBe(true);
      expect(mockEngine.apply).toHaveBeenCalledWith(target, 'patch');
    });

    it('createDefaultEngine returns HashlineEngine', () => {
      const e = createDefaultEngine();
      expect(e.name).toBe('hashline');
      expect(e).toBeInstanceOf(HashlineEngine);
    });

    it('createEngine routes by name', () => {
      expect(createEngine('hashline').name).toBe('hashline');
      expect(createEngine('unified-diff').name).toBe('unified-diff');
    });

    it('createEngine throws on unknown name', () => {
      expect(() => createEngine('ast-patch')).toThrow(/Unknown edit engine/);
    });
  });

  describe('Snapshots (3-hex TAG)', () => {
    it('hashLine is deterministic', () => {
      expect(hashLine('const x = 1;')).toBe(hashLine('const x = 1;'));
    });

    it('hashLine returns 3-char hex', () => {
      const h = hashLine('any text');
      expect(h).toMatch(/^[0-9a-f]{3}$/);
    });

    it('computeLineHashes returns N hashes for N lines', () => {
      const hashes = computeLineHashes('a\nb\nc\n');
      expect(hashes).toHaveLength(4); // 3 lines + trailing empty
    });

    it('findAnchor validates line + hash', () => {
      const file = { text: 'a\nb\nc\n' };
      const hashes = computeLineHashes(file.text);
      expect(findAnchor(file, 2, hashes[1]!)).toBe(true);
      expect(findAnchor(file, 2, 'fff')).toBe(false);
      expect(findAnchor(file, 999, hashes[0]!)).toBe(false);
    });
  });
});
