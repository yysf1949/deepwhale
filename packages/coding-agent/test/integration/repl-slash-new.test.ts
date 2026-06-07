/**
 * D-30.1α.3: REPL slash `/new` 清空 workingMessages + 推 new-session 信号.
 *
 * 拍板 (D-30.1α): /new 通过 SlashContext.onNewSession 回调发信号 (createLineHandler
 * 内部注入 `() => { deps.workingMessages.length = 0 }`), router 本身不直接持
 * workingMessages, 保持 D-29.1.3 工厂"闭包内不持 state" 红线.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /new (D-30.1α.3)', () => {
  it('emits new-session signal via callback', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    let newCalled = false;
    const result = await dispatchSlashBuiltin('/new', {
      out: outStream,
      err: outStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      onNewSession: () => {
        newCalled = true;
      },
    });
    expect(result.handled).toBe(true);
    expect(newCalled).toBe(true);
    const allWritten = out.mock.calls.map((c) => c[0]).join('');
    expect(allWritten).toContain('new session');
  });
});
