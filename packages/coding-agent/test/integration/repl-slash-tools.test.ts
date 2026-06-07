/**
 * D-30.1β.4: REPL slash `/tools` 列出 tool registry.
 *
 * 拍板 (D-30.1β): /tools 走 dispatchSlashBuiltin (D-29.1.3 工厂).
 * - 走 ctx.listTools 回调拉 tool 列表
 * - 输出 "<n> tools:" + 每行 "  <name-padded-20> <description>"
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /tools (D-30.1β.4)', () => {
  it('lists registered tools', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const mockTools = [
      { name: 'bash', description: 'run shell command' },
      { name: 'edit-file', description: 'edit file' },
      { name: 'web_search', description: 'search the web' },
    ];
    const result = await dispatchSlashBuiltin('/tools', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      listTools: () => mockTools,
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('bash');
    expect(outText).toContain('edit-file');
    expect(outText).toContain('web_search');
    expect(outText).toContain('3 tools');
  });

  it('shows fallback when no listTools wired', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/tools', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('no tool registry wired');
  });
});
