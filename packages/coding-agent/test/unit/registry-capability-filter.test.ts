/**
 * ToolRegistry.listByCapability unit test — D-93 v5.0 plugin governance 3rd evidence.
 *
 * After D-91 added the ToolCapability vocabulary + toolCapabilities helper,
 * and D-92 backfilled capabilities on the 19 default tools, D-93 makes the
 * vocabulary queryable through the existing ToolRegistry class.
 *
 * This test asserts that listByCapability returns the correct subset of
 * the 19 default tools for a few representative capabilities:
 *   - shell-exec: only BashTool (it is the only default tool that spawns
 *     subprocesses; no other tool claims this capability).
 *   - code-execute: only ExecuteCodeTool (it is the only default tool
 *     that runs user-provided code in a sandbox).
 *   - file-write: the 4 tools that claim file-write (WriteFileTool,
 *     EditFileTool, PatchTool, RenameSymbolTool).
 */

import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('ToolRegistry.listByCapability (D-93 v5.0 plugin governance 3rd evidence)', () => {
  it('returns the correct subset of default tools for shell-exec (D-93)', () => {
    const registry = createDefaultRegistry();
    const tools = registry.listByCapability('shell-exec');
    expect(tools.map((t) => t.name)).toEqual(['bash']);
  });

  it('returns the correct subset of default tools for code-execute (D-93)', () => {
    const registry = createDefaultRegistry();
    const tools = registry.listByCapability('code-execute');
    expect(tools.map((t) => t.name)).toEqual(['execute_code']);
  });

  it('returns the 4 read+modify tools for file-write (D-93)', () => {
    const registry = createDefaultRegistry();
    const tools = registry.listByCapability('file-write');
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['edit_file', 'patch', 'rename_symbol', 'write_file']);
  });
});
