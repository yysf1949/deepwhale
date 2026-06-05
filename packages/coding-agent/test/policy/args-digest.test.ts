/**
 * policy/args-digest 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 */

import { describe, it, expect } from 'vitest';
import { computeArgsDigest } from '../../src/policy/args-digest.js';

describe('policy/args-digest.computeArgsDigest', () => {
  it('同 args 返同 digest (稳定性)', () => {
    const a = computeArgsDigest({ path: '/tmp/x', content: 'hello' });
    const b = computeArgsDigest({ path: '/tmp/x', content: 'hello' });
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{12}$/);
  });

  it('key 顺序不影响 (稳定 JSON 排序)', () => {
    const a = computeArgsDigest({ a: 1, b: 2, c: 3 });
    const b = computeArgsDigest({ c: 3, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('嵌套对象 key 顺序不影响', () => {
    const a = computeArgsDigest({ x: { a: 1, b: 2 } });
    const b = computeArgsDigest({ x: { b: 2, a: 1 } });
    expect(a).toBe(b);
  });

  it('数组顺序影响 (区别于对象 key 排序)', () => {
    // 拍板: 数组是有序的, 拍 board 跟对象 key 排序区分. LLM 调 tool 数组顺序有语义.
    const a = computeArgsDigest({ list: [1, 2, 3] });
    const b = computeArgsDigest({ list: [3, 2, 1] });
    expect(a).not.toBe(b);
  });

  it('不同内容返不同 digest', () => {
    const a = computeArgsDigest({ path: '/tmp/x' });
    const b = computeArgsDigest({ path: '/tmp/y' });
    expect(a).not.toBe(b);
  });

  it('不暴露原始内容 (digest 12 位 hash, 反推不出原 args)', () => {
    const secret = 'sk-1234567890abcdef';
    const digest = computeArgsDigest({ secret });
    expect(digest).not.toContain(secret);
    expect(digest).not.toContain('sk-');
  });

  it('null / undefined / 嵌套数组 / 空对象 稳定性', () => {
    const a = computeArgsDigest({ a: null, b: undefined, c: [], d: {} });
    const b = computeArgsDigest({ d: {}, c: [], b: undefined, a: null });
    expect(a).toBe(b);
  });
});
