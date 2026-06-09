/**
 * Capability registry foundation (D-33.2.3, 2026-06-09).
 *
 * 拍板: Capability is the unit of permission/audit around a tool/MCP/plugin/
 * browser/computer/skill/channel. The CapabilityRegistry is a SEPARATE
 * registry from ToolRegistry (which still owns the 41 tools); it is the
 * source of truth for "is capability X exposed to profile Y" checks used
 * by skills, approval policy, and future routing layers.
 *
 * - Profiles are reused from ToolRegistryProfile (single source of truth)
 *   to avoid duplicating the enum.
 * - IDs must be unique. Duplicate registration throws.
 * - Risk levels: 'low' | 'medium' | 'high'.
 * - Side-effect categories (free-form string list): 'read' | 'write' |
 *   'network' | 'execute' | 'state' (extensible).
 *
 * 0 业务改业务, 5 红线 0 触碰 (new file in src/runtime/, separate from
 * packages/coding-agent/src/repl/ and src/modes/tui.ts).
 */

import type { ToolRegistryProfile } from '../tools/registry.js';

export type CapabilitySource =
  | 'tool'
  | 'mcp'
  | 'plugin'
  | 'browser'
  | 'computer'
  | 'skill'
  | 'channel'
  | 'extension';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Capability {
  readonly id: string;
  readonly source: CapabilitySource;
  readonly riskLevel: RiskLevel;
  /**
   * Profile tags this capability is exposed under.
   * Subset of ToolRegistryProfile ('default' | 'core' | ... | 'all') PLUS
   * capability-only profiles (e.g. 'mcp', 'browser', 'computer', 'channel').
   * Modeled as a string array so MCP/Browser/etc. capabilities can be added
   * without widening ToolRegistryProfile.
   */
  readonly profiles: ReadonlyArray<ToolRegistryProfile | 'mcp' | 'browser' | 'computer' | 'channel'>;
  readonly description?: string;
  readonly sideEffects?: ReadonlyArray<string>;
}
