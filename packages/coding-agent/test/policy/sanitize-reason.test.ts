/**
 * policy/sanitize-reason 单测 — Sprint 1c-revive-3-D-13 (2026-06-05),
 * Sprint 1c-revive-5-D-29.2 (2026-06-07) 增 3 类 secret redact.
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
    const r = sanitizeReason('hello' + String.fromCharCode(0) + 'world');
    expect(r).toBe('helloworld');
    // eslint-disable-next-line no-control-regex
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

  // ---- D-29.2: 3 类 secret redact ----

  it('sk-... 形式 secret redact (D-29.2)', () => {
    // 真实 sk- key: sk- + 17 位 [A-Za-z0-9_-] = 20 字符 (符合 {16,} 阈值).
    // plan §3 'sk-...20字' 是占位符, 实际 key 不含 '.', 此处用合法字符.
    const sk = 'sk-' + 'abcdefghij1234567'; // 20 chars
    expect(sanitizeReason('api key: ' + sk)).toBe('api key: ***REDACTED***');
  });

  it('sk- 短于 16 字符不 redact (D-29.2)', () => {
    expect(sanitizeReason('sk-short')).toBe('sk-short'); // 太短不是真 key
  });

  it('Bearer ... 形式 secret redact (D-29.2)', () => {
    expect(sanitizeReason('header: Bearer abc123def456ghi789jkl012mno')).toBe(
      'header: Bearer ***REDACTED***'
    );
  });

  it('key=value / token=value / secret=value 形式 redact (D-29.2)', () => {
    // 复合大写名 DEPLOY_KEY= 走 prefix + 关键词路径 (NEW: D-29.2 加复合前缀)
    expect(sanitizeReason('env DEPLOY_KEY=prod-secret-12345')).toBe(
      'env DEPLOY_KEY=***REDACTED***'
    );
    // 独立 TOKEN=走纯关键词路径
    const tok = 'eyJhbGciOiJIUzI1NiJ9abc123'; // 28 chars > 8
    expect(sanitizeReason('oauth TOKEN=' + tok)).toBe('oauth TOKEN=***REDACTED***');
  });

  it('truncate 在 redact 之前 (D-29.2 候选 1 拍板: 200 字符窗口内 secret 必 redact)', () => {
    // 候选 1 拍板 (2026-06-07 user review): 流程顺序 truncate 先 → redact 后.
    // 200 字符窗口内 secret 必完整 redact. 跨 200 边界 (>200 字符) 的极长 secret
    // (如 800 字符 JWT) 接受 truncate 切后子串漏 redact 边缘 — 拍板记录, 不进测强约束
    // (200 字符足够覆盖实际 API key 长度, OpenAI sk- 51 / GitHub PAT 40 / AWS 40).
    //
    // 测 A: secret 在 200 字符内 → 必被 redact (跟原测 L83-91 期望一致)
    const sk = 'sk-' + 'abcdefghij1234567'; // 20 chars
    const inside = 50 + ' ' + sk + ' ' + 50; // 50 + 1 + 20 + 1 + 50 = 122 chars (远 < 200)
    const r1 = sanitizeReason(inside);
    expect(r1).toContain('***REDACTED***');
    expect(r1).not.toContain(sk);

    // 测 B: secret 跨 200 字符边界 → truncate 切, 切后子串可能漏 redact
    // 拍板接受 (候选 1 边缘 case), 测只断言 truncate marker 在, 不断言完整 redact
    const long = 'a'.repeat(180) + ' ' + sk + ' ' + 'b'.repeat(50); // 252 chars
    const r2 = sanitizeReason(long);
    expect(r2).toMatch(/\[truncated\]$/);
    // r2 可能是 'aaa...aaa sk-abcd…[truncated]' (secret 被切, 漏 redact 接受)
    // 或 'aaa...aaa ***REDACTED***…[truncated]' (边界恰好在 secret 之前, 完整 redact)
    // 两者皆符合候选 1 拍板.
  });

  it('顺序: 先 redact 再折叠 (D-29.2)', () => {
    // reason 含 key=foo 跨换行, 折叠不应破坏 redact
    const r = sanitizeReason('key=mysecret123\nnext line');
    expect(r).toBe('key=***REDACTED*** / next line');
    expect(r).not.toContain('mysecret123');
  });
});
