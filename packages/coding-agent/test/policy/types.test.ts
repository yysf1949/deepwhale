/**
 * policy/types 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 */

import { describe, it, expect } from 'vitest';
import type { PolicyDecision, PolicyContext, ToolPolicy } from '../../src/policy/types.js';

describe('policy/types', () => {
  it('PolicyDecision 联合 3 个判别式: allow / deny / require_confirmation', () => {
    const a: PolicyDecision = { decision: 'allow' };
    const d: PolicyDecision = { decision: 'deny', reason: 'dangerous command' };
    const c: PolicyDecision = { decision: 'require_confirmation', reason: 'overwrite file' };
    expect(a.decision).toBe('allow');
    expect(d.decision).toBe('deny');
    expect(c.decision).toBe('require_confirmation');
  });

  it('PolicyContext 含 isInteractive + yes + argsDigest', () => {
    const ctx: PolicyContext = {
      isInteractive: true,
      yes: false,
      argsDigest: 'sha256:abcdef012345',
    };
    expect(ctx.isInteractive).toBe(true);
    expect(ctx.yes).toBe(false);
    expect(ctx.argsDigest).toMatch(/^sha256:[a-f0-9]{12}$/);
  });

  it('ToolPolicy interface 形状: evaluate 必选, confirm 可选', () => {
    const p1: ToolPolicy = {
      evaluate: () => ({ decision: 'allow' }),
    };
    const p2: ToolPolicy = {
      evaluate: () => ({ decision: 'deny', reason: 'x' }),
      confirm: async () => true,
    };
    expect(
      p1.evaluate(
        { name: 'read_file' as never, argsDigest: 'x' },
        {
          isInteractive: false,
          yes: false,
          argsDigest: 'x',
        },
      ).decision,
    ).toBe('allow');
    // confirm 路径只是类型验证, 不强求调
    expect(typeof p2.confirm).toBe('function');
  });
});
