/**
 * Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * chain 串 static + caller-supplied ToolPolicy.
 *
 * 拍板红线 (用户 2026-06-05):
 *   - yes=true 只 bypass require_confirmation, 不 bypass deny (R-3 confirm 拍板)
 *   - allow 不在 chain 后续层 reject (first allow wins; 但 static 拍 board 只有 allow / deny / require_confirmation 3 个)
 *   - yes=true + require_confirmation → 自动 allow, 不调 policy.confirm
 */

import type { PolicyDecision, PolicyContext, PolicyToolCall, ToolPolicy } from './types.js';
import { staticToolPolicy } from './static-rules.js';

export function evaluatePolicy(
  toolCall: PolicyToolCall,
  ctx: PolicyContext,
  policy: ToolPolicy = staticToolPolicy,
): PolicyDecision {
  const decision = policy.evaluate(toolCall, ctx);
  // yes=true bypass require_confirmation → allow
  if (decision.decision === 'require_confirmation' && ctx.yes) {
    return { decision: 'allow' };
  }
  // deny 永远不 bypass (拍板红线)
  return decision;
}
