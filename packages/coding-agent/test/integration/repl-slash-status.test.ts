/**
 * D-30.1α.4: REPL slash `/status` 输出 model/session/ema/theme 当前状态.
 *
 * 拍板 (D-30.1α): /status 走 ctx.getStatus 回调拉 ReplStatus, REPL/TUI 各自提供
 * (本次 sub-burst 不接 REPL 端 wiring, 留给后续). router 本身不持 state.
 * 拍板 (D-30.1α format): test 用 `key: value` 简单格式 (TDD spec), impl 跟齐.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /status (D-30.1α.4)', () => {
  it('renders status block with model/session/ema/theme', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/status', {
      out: outStream,
      err: outStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      getStatus: () => ({
        model: 'deepseek-chat',
        sessionPath: '/tmp/test.jsonl',
        emaSampleCount: 5,
        theme: 'default',
        uptimeMs: 12345,
      }),
    });
    expect(result.handled).toBe(true);
    const allWritten = out.mock.calls.map((c) => c[0]).join('');
    expect(allWritten).toContain('model: deepseek-chat');
    expect(allWritten).toContain('session: /tmp/test.jsonl');
    expect(allWritten).toContain('ema samples: 5');
    expect(allWritten).toContain('theme: default');
  });
});
