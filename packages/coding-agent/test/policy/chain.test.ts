/**
 * policy/chain 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 */

import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../../src/policy/chain.js';
import type { ToolPolicy } from '../../src/policy/types.js';

const ctx = { isInteractive: true, yes: false, argsDigest: 'sha256:000000000000' };

describe('policy/chain.evaluatePolicy', () => {
  it('read_file: static 返 allow → chain 返 allow', () => {
    expect(
      evaluatePolicy({ name: 'read_file' as never, argsDigest: 'sha256:000000000000' }, ctx)
        .decision,
    ).toBe('allow');
  });

  it('write_file + yes=true: static 返 require_confirmation → chain 转 allow', () => {
    const r = evaluatePolicy(
      { name: 'write_file' as never, argsDigest: 'sha256:000000000000' },
      { ...ctx, yes: true },
    );
    expect(r.decision).toBe('allow');
  });

  it('write_file + yes=false: static 返 require_confirmation → chain 返 require_confirmation', () => {
    const r = evaluatePolicy(
      { name: 'write_file' as never, argsDigest: 'sha256:000000000000' },
      ctx,
    );
    expect(r.decision).toBe('require_confirmation');
  });

  it('deny 永远不 bypass (yes=true + deny → 仍 deny)', () => {
    // mock policy 返 deny, 即便 yes=true chain 也返 deny
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
