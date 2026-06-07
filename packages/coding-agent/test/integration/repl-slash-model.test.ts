/**
 * D-30.1β.2: REPL slash `/model` 切换 LLM model.
 *
 * 拍板 (D-30.1β): /model 走 dispatchSlashBuiltin (D-29.1.3 工厂).
 * - 无 arg: 列出当前 model id
 * - 有 arg: 走 ctx.setModel 回调, 输出 "model: <id>"
 *
 * 单测 mock SlashContext, 不走 startRepl e2e (跟 repl-slash-theme.test.ts 同形态).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /model (D-30.1β.2)', () => {
  it('switches LLM model via callback', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    let switched = '';
    const result = await dispatchSlashBuiltin('/model anthropic/claude-sonnet-4', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      setModel: (id: string) => {
        switched = id;
      },
    });
    expect(result.handled).toBe(true);
    expect(switched).toBe('anthropic/claude-sonnet-4');
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('model: anthropic/claude-sonnet-4');
  });

  it('shows current model when no arg', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/model', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      getCurrentModel: () => 'deepseek-chat',
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('model: deepseek-chat');
  });
});
