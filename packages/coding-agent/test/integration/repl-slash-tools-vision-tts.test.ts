/**
 * D-30.4.7: REPL slash `/tools` lists vision/tts tools.
 *
 * Uses the real opt-in `all` registry and checks that `/tools` renders the
 * expected tool names plus the current full-surface count.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';
import { createRegistryForProfile } from '../../src/tools/registry.js';

describe('repl slash /tools full-surface listing', () => {
  it('lists vision_analyze + text_to_speech alongside other tools (43 total)', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const registry = await createRegistryForProfile({ profile: 'all' });
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
    expect(outText).toMatch(/43 tools/);
  });
});
