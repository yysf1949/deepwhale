/**
 * Tool approval policy (D-33.2.4, 2026-06-09).
 *
 * 拍板: The approval requirement is a function of the tool's risk level
 *   alone. `low` = no prompt needed (read-only or otherwise safe),
 *   `medium` and `high` = require user confirmation before execution.
 *
 * NOTE: This is a NEW file in src/policy/. Per 5 红线 (D-33.2 拍板 #6),
 *   src/repl/repl-confirm.ts is read-only; we do NOT add this function
 *   there. The repl-confirm prompt/stream machinery is unchanged.
 */

export type ApprovalRiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalTool {
  name: string;
  riskLevel: ApprovalRiskLevel;
}

export function requireApprovalForTool(tool: ApprovalTool): boolean {
  return tool.riskLevel === 'high' || tool.riskLevel === 'medium';
}
