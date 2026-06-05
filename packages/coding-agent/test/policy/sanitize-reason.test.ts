/**
 * policy/sanitize-reason 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 */

import { describe, it, expect } from 'vitest';
import { sanitizeReason } from '../../src/policy/sanitize-reason.js';

describe('policy/sanitize-reason.sanitizeReason', () => {
  it('短 reason 原样保留', () => {
    expect(sanitizeReason('overwrite file')).toBe('overwrite file');
  });

  it('超长 reason (>200 字符) 截断 + 标 truncated marker', () => {
    const long = 'a'.repeat(500);
    const r = sanitizeReason(long);
    expect(r.length).toBeLessThanOrEqual(200);
    expect(r).toMatch(/truncated\]$/);
  });

  it('多行 reason 折叠成单行 (\\n → " / ")', () => {
    const r = sanitizeReason('line 1\nline 2\nline 3');
    expect(r).toBe('line 1 / line 2 / line 3');
    expect(r).not.toMatch(/\n/);
  });

  it('\\r\\n 也折叠', () => {
    const r = sanitizeReason('line 1\r\nline 2');
    expect(r).toBe('line 1 / line 2');
  });

  it('去 NUL 防 JSON 注入', () => {
    const r = sanitizeReason('hello\u0000world');
    expect(r).toBe('helloworld');
    expect(r).not.toMatch(/\u0000/);
  });

  it('空字符串返空字符串', () => {
    expect(sanitizeReason('')).toBe('');
  });

  it('刚好 200 字符不截断', () => {
    const exact = 'a'.repeat(200);
    expect(sanitizeReason(exact)).toBe(exact);
  });

  it('201 字符截断到 ≤200 含 truncated marker', () => {
    const r = sanitizeReason('a'.repeat(201));
    expect(r.length).toBeLessThanOrEqual(200);
    expect(r).toMatch(/truncated\]$/);
  });
});
