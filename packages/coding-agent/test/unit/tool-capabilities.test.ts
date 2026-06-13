/**
 * toolCapabilities unit test — D-91 v5.0 plugin governance minimal seed.
 *
 * The v5.0 plugin-governance theme starts here with a minimal seed:
 * - A new `ToolCapability` type (a fixed string union).
 * - A new `toolCapabilities(tool)` helper that returns the tool's declared
 *   capabilities, defaulting to [] when the tool doesn't declare any.
 *
 * The capabilities field is OPTIONAL on the `Tool` interface, so existing
 * tools that don't declare capabilities still validate against the new
 * interface (backward-compatible).
 */

import { describe, expect, it } from 'vitest';
import type { Tool } from '../../src/types.js';
import { toolCapabilities, isToolCapability } from '../../src/governance/tool-capabilities.js';

describe('toolCapabilities (D-91 v5.0 plugin governance seed)', () => {
  it('returns declared capabilities for a tool that declares them (D-91)', () => {
    const tool: Tool = {
      name: 'bash',
      description: 'Run shell commands',
      risk: 'high',
      schema: { type: 'object', properties: {} },
      capabilities: ['shell-exec', 'network'] as const,
      execute: async () => ({ ok: true }),
    };
    const caps = toolCapabilities(tool);
    expect(caps).toEqual(['shell-exec', 'network']);
  });

  it('returns an empty array for a tool that does not declare capabilities (D-91 backward-compat)', () => {
    const tool: Tool = {
      name: 'echo',
      description: 'Echo back the input',
      risk: 'low',
      schema: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    };
    // No `capabilities` field; helper must return [].
    expect(toolCapabilities(tool)).toEqual([]);
  });

  it('isToolCapability rejects unknown capability strings (D-91 type guard)', () => {
    expect(isToolCapability('shell-exec')).toBe(true);
    expect(isToolCapability('file-read')).toBe(true);
    expect(isToolCapability('unknown-capability')).toBe(false);
    expect(isToolCapability('')).toBe(false);
  });
});
