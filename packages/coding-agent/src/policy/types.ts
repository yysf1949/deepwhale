/**
 * Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * ToolPolicy interface + PolicyDecision 联合 + PolicyContext 拍板.
 *
 * 拍板红线 (用户 2026-06-05):
 *   - 'allow' 不写 session, 只有 'deny' / 'require_confirmation' / 用户确认结果
 *     ('user_approved' / 'user_denied') 落 'policy_decision' event
 *   - argsDigest 不存原始 args, 用 sha256: 前 12 位稳定关联
 *   - 拍板: deny 不被 --yes bypass
 */

import type { ToolName } from '@deepwhale/core';

/** Policy 决策 — 3 个判别式 + 2 个 user_* 终态 (session audit 用) */
export type PolicyDecision =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'require_confirmation'; reason: string };

/** tool call 描述 — 不带原始 args, 用 argsDigest 关联 (拍板: 不暴露 secret) */
export interface PolicyToolCall {
  readonly name: ToolName;
  /** sha256:<12hex> 拍板 */
  readonly argsDigest: string;
}

export interface PolicyContext {
  /** 模式是否可交互 (REPL = true, print / rpc 默认 = false) */
  readonly isInteractive: boolean;
  /** --yes 标志: 只 bypass require_confirmation, 不 bypass deny */
  readonly yes: boolean;
  /** tool call args 的稳定 sha256: 前 12 位 */
  readonly argsDigest: string;
}

export interface ToolPolicy {
  /**
   * 拍板: 调用一次返回最终 decision. 拍板: 不抛异常, 内部失败也返 deny.
   * 拍板: 纯函数, 不读 stdin, 不打 console. caller (tool-loop) 负责 IO.
   */
  evaluate(toolCall: PolicyToolCall, ctx: PolicyContext): PolicyDecision;

  /**
   * 拍板: 用户确认回调. REPL 走 readline, RPC 走 NDJSON "confirm" 通知 (D-15).
   * 拍板: undefined = "未实现" 兜底, caller 走 fail-closed deny.
   * 拍板: return true = 用户同意, false = 拒绝, null = dismiss (也走 deny).
   *
   * Sprint 1c-revive-3-D-19 (2026-06-05): opts.signal 可选 — REPL SIGINT/turn
   * 取消时, 注入 turn-level AbortSignal, confirm 收到 abort 立刻 resolve null.
   * 老实现 (单参) 继续合法 (opts 默认 undefined).
   */
  confirm?(prompt: string, opts?: { signal?: AbortSignal }): Promise<boolean | null>;
}
