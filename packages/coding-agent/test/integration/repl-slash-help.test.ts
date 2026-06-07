/**
 * D-30.1α.1: REPL slash `/help` 列出 10 命令.
 *
 * 拍板 (D-30.1α): /help 走 dispatchSlashBuiltin (D-29.1.3 工厂),
 * 输出列出本次 4 简单 + D-29.1.3 已有 2 + 后续 4 总共 10 命令.
 * 单测 mock SlashContext, 不走 startRepl e2e (跟 Task 2-4 风格一致).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /help (D-30.1α.1)', () => {
  it('returns help text listing available commands', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/help', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
    });
    expect(result.handled).toBe(true);
    expect(out).toHaveBeenCalled();
    const outCalls = out.mock.calls.map((c) => c[0]).join('');
    expect(outCalls).toContain('help');
    expect(outCalls).toContain('/help');
    expect(outCalls).toContain('/clear');
    expect(outCalls).toContain('/new');
    expect(outCalls).toContain('/status');
  });
});
