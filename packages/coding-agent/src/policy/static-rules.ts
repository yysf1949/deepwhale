/**
 * Sprint 1c-revive-3-D-13 (2026-06-05): 默认静态规则.
 *
 * 拍板 (用户 2026-06-05):
 *   - A1: 默认规则 (read/find/grep 全 allow, write/edit 全 require_confirmation)
 *   - B1: bash 用 regex/argv-light 检测危险模式 → require_confirmation (不直接 deny,
 *     误判只是多弹确认, 比 deny 漏判安全)
 *   - R-1: race 接受为 MVP 风险, D-15 用 inotify / mutex 收
 *
 * 不做 (D-15):
 *   - 用户 config 注入 (ToolPolicy 透传, D-13 默认走 static)
 *   - 路径白名单/黑名单
 *   - Bash argv deep parse (e.g. shlex)
 *   - Secret 强检测 (redact API key in reason)
 */

import type { ToolName } from '@deepwhale/core';
import type { PolicyDecision, PolicyContext, PolicyToolCall, ToolPolicy } from './types.js';

// bash 危险模式 (regex) — argv-light, 不深 parse
// 拍板 (用户 2026-06-05): 走 require_confirmation 而非 deny, 误判只是多弹确认
const DANGEROUS_BASH_PATTERNS: ReadonlyArray<RegExp> = [
  // rm -rf / or rm -fr / (path start with /)
  /\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*)+[^\n]*\//i,
  // rm -rf ~ (home dir wipe)
  /\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*)+[^\n]*~/i,
  // mkfs (format filesystem)
  /\bmkfs(?:\.\w+)?\b/i,
  // dd if= (raw disk write)
  /\bdd\s+if=/i,
  // shutdown / reboot / halt / poweroff
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  // redirect to /dev/sda or /dev/nvme* (raw disk overwrite)
  />\s*\/dev\/(sda|nvme\d)/i,
];

/** bash regex 危险模式 — 暴露给 tool-loop 在 bash 工具自身层也用 (双重防线) */
export function evaluateBashCommand(cmd: string, _args: ReadonlyArray<string>): PolicyDecision {
  for (const pat of DANGEROUS_BASH_PATTERNS) {
    if (pat.test(cmd)) {
      return {
        decision: 'require_confirmation',
        reason: `bash command matches dangerous pattern: ${pat.source}`,
      };
    }
  }
  return { decision: 'allow' };
}

function evaluateByToolName(name: ToolName, _argsDigest: string): PolicyDecision {
  switch (name) {
    case 'read_file':
    case 'find':
    case 'grep':
      return { decision: 'allow' };
    case 'write_file':
    case 'edit_file':
      return { decision: 'require_confirmation', reason: 'writes to filesystem' };
    case 'bash':
      // bash 实际 evaluate 需要 parse cmd + args. 这层拿不到, tool-loop 层 bash 工具自身用 evaluateBashCommand 拍.
      // 保守返 allow (bash tool 会自己再过一遍 evaluateBashCommand).
      return { decision: 'allow' };
    default: {
      // 兜底: 未注册 tool 走 deny. name cast never 让 TS 拍板 exhaustive.
      return { decision: 'deny', reason: `unknown tool: ${String(name as never)}` };
    }
  }
}

export const staticToolPolicy: ToolPolicy = {
  evaluate(toolCall: PolicyToolCall, _ctx: PolicyContext): PolicyDecision {
    return evaluateByToolName(toolCall.name, toolCall.argsDigest);
  },
  // confirm 留 undefined — REPL / RPC 模式注入自己的 confirm 实现 (D-13 MVP 留空)
};
