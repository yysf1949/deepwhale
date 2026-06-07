/**
 * D-30.1γ.5: REPL slash `/tools` 列表 web tools 验证.
 *
 * 拍板 (D-30.1γ.5): β.4 已加 /tools case 走 listTools 回调, γ.5 加 1 test 验证
 * web tools 跟其它工具同形态 (列出 name + description + 总数).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /tools (with web tools, D-30.1γ.5)', () => {
  it('lists web tools alongside file/bash tools', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const tools = [
      { name: 'bash', description: 'run shell' },
      { name: 'web_search', description: 'search web' },
      { name: 'web_extract', description: 'fetch url' },
      { name: 'browser_navigate', description: 'navigate url' },
    ];
    const result = await dispatchSlashBuiltin('/tools', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      listTools: () => tools,
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('web_search');
    expect(outText).toContain('web_extract');
    expect(outText).toContain('browser_navigate');
    expect(outText).toContain('4 tools');
  });
});
