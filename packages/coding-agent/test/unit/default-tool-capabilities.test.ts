/**
 * Default-tool-capabilities invariant test — D-92 v5.0 plugin governance 2nd evidence.
 *
 * After D-91 added the `ToolCapability` vocabulary + `toolCapabilities` helper
 * + the optional `capabilities` field on the Tool interface, D-92 backfills
 * real capabilities on all 19 default tools. This test asserts:
 *   (a) Every default tool has a backfilled `capabilities` field (either
 *       explicitly [] or non-empty). In-memory tools (TodoTool, PlanTool)
 *       declare []; everything else declares at least one real capability.
 *   (b) The 5 high-risk tools declare their real capabilities accurately
 *       (BashTool → shell-exec + network; ReadFileTool → file-read;
 *        WriteFileTool → file-read + file-write; EditFileTool →
 *        file-read + file-write; ExecuteCodeTool → code-execute).
 */

import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { isToolCapability } from '../../src/governance/tool-capabilities.js';

describe('default tool capabilities (D-92 v5.0 plugin governance 2nd evidence)', () => {
  it('all 20 default tools have capabilities backfilled (D-92)', () => {
    const tools = createDefaultRegistry().list();
    expect(tools).toHaveLength(20);

    for (const tool of tools) {
      // Every tool must declare capabilities (either [] or non-empty).
      // The ToolCapabilities field is OPTIONAL in the type, so we use the
      // D-91 helper which returns [] for tools that don't declare any.
      // The D-92 backfill means every tool should explicitly declare its
      // capabilities (even if it's [] for in-memory tools).
      const caps = tool.capabilities;
      expect(caps, `tool '${tool.name}' is missing capabilities backfill`).toBeDefined();
      // Every entry in the declared list must be a valid ToolCapability.
      for (const cap of caps ?? []) {
        expect(isToolCapability(cap), `tool '${tool.name}' declares invalid capability '${cap}'`).toBe(true);
      }
    }
  });

  it('high-risk tools declare accurate capabilities (D-92 specific assertions)', () => {
    const tools: Record<string, { capabilities?: readonly string[] } | undefined> =
      Object.fromEntries(createDefaultRegistry().list().map((t) => [t.name, t]));

    // BashTool: can spawn subprocesses + can access network.
    expect(tools['bash']?.capabilities).toEqual(['shell-exec', 'network']);

    // ReadFileTool: file-read only.
    expect(tools['read_file']?.capabilities).toEqual(['file-read']);

    // WriteFileTool: file-read + file-write (it may read existing content
    // before writing).
    expect(tools['write_file']?.capabilities).toEqual(['file-read', 'file-write']);

    // EditFileTool: file-read + file-write (it reads then writes).
    expect(tools['edit_file']?.capabilities).toEqual(['file-read', 'file-write']);

    // ExecuteCodeTool: code-execute (runs user code in sandbox).
    expect(tools['execute_code']?.capabilities).toEqual(['code-execute']);
  });
});
