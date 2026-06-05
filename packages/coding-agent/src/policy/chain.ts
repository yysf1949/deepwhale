/**
 * Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * chain 串 static + caller-supplied ToolPolicy.
 *
 * Sprint 1c-revive-3-D-13 review P1(b) 修复 (2026-06-05):
 *   拍板 (用户 2026-06-05): "保持 PolicyDecision 简洁, 在 tool-loop.ts 里保留 raw decision".
 *   实现: chain.ts **不**做 yes bypass, 直接透传 policy.evaluate 结果. yes bypass 在
 *   tool-loop.ts 里处理 (调 evaluatePolicy 拿到 raw decision, 自己判断 yes 走 user_approved
 *   审计 + bypass 路径).
 *
 * 拍板红线 (用户 2026-06-05):
 *   - yes=true 移出 chain (在 tool-loop 处理),保持 PolicyDecision union 简洁 (3 kind)
 *   - allow 不在 chain 后续层 reject (first allow wins; 但 static 拍 board 只有 allow / deny / require_confirmation 3 个)
 *   - deny 永远不 bypass (拍板红线)
 */

import type { PolicyDecision, PolicyContext, PolicyToolCall, ToolPolicy } from './types.js';
import { staticToolPolicy } from './static-rules.js';

export function evaluatePolicy(
  toolCall: PolicyToolCall,
  ctx: PolicyContext,
  policy: ToolPolicy = staticToolPolicy,
): PolicyDecision {
  // 拍板 (P1 b 修复): chain 只做 policy 评估 + 透传, yes bypass 在 tool-loop.ts 处理.
  // 这样 tool-loop 拿到的 decision 就是 policy.evaluate 原始结果, 不会被 yes 抹平
  // (raw decision 保留, 才能落 user_approved 审计).
  return policy.evaluate(toolCall, ctx);
}
