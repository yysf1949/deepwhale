/**
 * policy/chain 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 *
 * Sprint 1c-revive-3-D-13 review P1(b) 修复 (2026-06-05):
 *   chain.ts 不再做 yes bypass (移到 tool-loop.ts), 拍板红线 (用户 2026-06-05):
 *   "保持 PolicyDecision 简洁, 在 tool-loop.ts 里保留 raw decision".
 *   这里只测 chain 透传 + caller-supplied policy 注入.
 */

import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../../src/policy/chain.js';
import type { ToolPolicy } from '../../src/policy/types.js';

const ctx = { isInteractive: true, yes: false, argsDigest: 'sha256:000000000000' };

describe('policy/chain.evaluatePolicy', () => {
  it('read_file: static 返 allow → chain 透传 allow (yes bypass 不在 chain 做)', () => {
    expect(
      evaluatePolicy({ name: 'read_file' as never, argsDigest: 'sha256:000000000000' }, ctx)
        .decision,
    ).toBe('allow');
  });

  it('write_file + yes=true: static 返 require_confirmation → chain 透传 (不 bypass, P1 b 拍板)', () => {
    // 拍板 (用户 2026-06-05 P1 b 修复): chain 不做 yes bypass, 透传 raw decision.
    // yes bypass 在 tool-loop.ts 处理 (落 user_approved 审计 + 继续执行).
    const r = evaluatePolicy(
      { name: 'write_file' as never, argsDigest: 'sha256:000000000000' },
      { ...ctx, yes: true },
    );
    expect(r.decision).toBe('require_confirmation');
  });

  it('write_file + yes=false: static 返 require_confirmation → chain 透传', () => {
    const r = evaluatePolicy(
      { name: 'write_file' as never, argsDigest: 'sha256:000000000000' },
      ctx,
    );
    expect(r.decision).toBe('require_confirmation');
  });

  it('deny 透传 (chain 不 bypass, 拍板红线)', () => {
    const denyPolicy: ToolPolicy = {
      evaluate: () => ({ decision: 'deny' as const, reason: 'mock deny' }),
    };
    const r = evaluatePolicy(
      { name: 'write_file' as never, argsDigest: 'sha256:000000000000' },
      { ...ctx, yes: true },
      denyPolicy,
    );
    expect(r.decision).toBe('deny');
  });

  it('注入 caller-supplied policy 优先于默认 static', () => {
    const allowAll: ToolPolicy = {
      evaluate: () => ({ decision: 'allow' as const }),
    };
    const r = evaluatePolicy(
      { name: 'write_file' as never, argsDigest: 'sha256:000000000000' },
      ctx,
      allowAll,
    );
    expect(r.decision).toBe('allow');
  });
});
