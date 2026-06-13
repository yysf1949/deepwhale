/**
 * Tool capabilities — D-91 v5.0 plugin governance minimal seed.
 *
 * A `Tool` may declare an OPTIONAL set of capabilities from a fixed
 * vocabulary. Tools that don't declare capabilities default to `[]`
 * (no capabilities claimed). The `toolCapabilities(tool)` helper
 * returns the declared capabilities, or `[]` if the tool has no
 * `capabilities` field.
 *
 * Scope of THIS sub-sprint: 1 type + 1 helper + 1 type guard + 1 unit
 * test. Future D-92+ sub-sprints can:
 *   (a) Backfill capabilities on the 19 default tools.
 *   (b) Add a ToolRegistry method that filters tools by capability.
 *   (c) Add a profile-level policy that restricts allowed capabilities.
 */

import type { Tool } from '../types.js';

export const TOOL_CAPABILITIES = [
  'file-read',
  'file-write',
  'shell-exec',
  'network',
  'code-execute',
] as const;

export type ToolCapability = (typeof TOOL_CAPABILITIES)[number];

export function isToolCapability(value: string): value is ToolCapability {
  return (TOOL_CAPABILITIES as readonly string[]).includes(value);
}

export function toolCapabilities(tool: Tool): readonly ToolCapability[] {
  return tool.capabilities ?? [];
}
