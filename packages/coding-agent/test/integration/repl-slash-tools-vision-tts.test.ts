/**
 * D-30.4.7: REPL slash `/tools` 列表 vision/tts tools 验证.
 *
 * 拍板 (D-30.4.7): β.4 已加 /tools case 走 listTools 回调, D-30.4.7 加 1 test
 *   验证 vision_analyze + text_to_speech 跟其它工具同形态 (列出 name + description + 总数).
 *   用真 registry (createDefaultRegistry) 走 dispatchSlashBuiltin 端到端, 验
 *   count = 17 + 2 个新工具都出现.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('repl slash /tools (with vision + tts, D-30.4.7)', () => {
  it('lists vision_analyze + text_to_speech alongside other tools (17 total)', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const registry = createDefaultRegistry();
    const tools = registry.list().map((t) => ({ name: t.name, description: t.description }));
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
    expect(outText).toContain('vision_analyze');
    expect(outText).toContain('text_to_speech');
    expect(outText).toMatch(/17 tools/);
  });
});
