/**
 * D-30.1β.1: REPL slash `/theme` 切换主题.
 *
 * 拍板 (D-30.1β): /theme 走 dispatchSlashBuiltin (D-29.1.3 工厂).
 * - 无 arg: 列出当前主题 + valid 列表
 * - 有 arg 且有效: 走 ctx.setTheme 回调, 输出 "theme: <name>"
 * - 有 arg 但无效: 输出 "unknown theme" + valid 列表
 *
 * 单测 mock SlashContext, 不走 startRepl e2e (跟 repl-slash-help.test.ts 同形态).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /theme (D-30.1β.1)', () => {
  it('switches theme via callback', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    let switched = '';
    const result = await dispatchSlashBuiltin('/theme solarized', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      setTheme: (name: string) => {
        switched = name;
      },
    });
    expect(result.handled).toBe(true);
    expect(switched).toBe('solarized');
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('theme: solarized');
  });

  it('rejects unknown theme', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/theme bogus', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      setTheme: () => {},
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('unknown theme');
    expect(outText).toContain('valid:');
  });

  it('shows current theme when no arg', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/theme', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      getThemeName: () => 'default',
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('current theme');
    expect(outText).toContain('default');
  });
});
