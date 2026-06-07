/**
 * D-30.1α.2: REPL slash `/clear` 走 ANSI escape 清屏.
 *
 * 拍板 (D-30.1α): /clear 不调 console.clear (强耦合 stdout TTY),
 * 直接写 ANSI `\x1b[2J\x1b[H` (清屏 + 光标 home) 到 ctx.out.
 * 单测断言两段 ANSI 都写到 out.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /clear (D-30.1α.2)', () => {
  it('writes ANSI clear-screen escape', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/clear', {
      out: outStream,
      err: outStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
    });
    expect(result.handled).toBe(true);
    const allWritten = out.mock.calls.map((c) => c[0]).join('');
    expect(allWritten).toContain('\x1b[2J');
    expect(allWritten).toContain('\x1b[H');
  });
});
