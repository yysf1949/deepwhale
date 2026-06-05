/**
 * Sprint 1c-revive-3-D-13 (2026-06-05): 默认静态规则.
 * Sprint 1c-revive-3-D-13 review P1 修复 (2026-06-05):
 *   - 合并 command + args 成 1 条字符串再 regex match (解决 `mv a b` / `cp a b` 等
 *     command-only regex 漏判的问题). 不引 shlex dep, 拍板 MVP 接受 edge case 漏判.
 *   - 拍板 (用户 2026-06-05 review): "v1.0 红线是'未经确认不 mv', 不只是 /etc/系统路径;
 *     cp 一起收, 宁可多弹确认". 加 mv / cp 全部 → require_confirmation.
 *
 * 拍板 (用户 2026-06-05):
 *   - A1: 默认规则 (read/find/grep 全 allow, write/edit 全 require_confirmation)
 *   - B1: bash 用 regex/argv-light 检测危险模式 → require_confirmation (不直接 deny,
 *     误判只是多弹确认, 比 deny 漏判安全)
 *   - R-1: race 接受为 MVP 风险, D-15 用 inotify / mutex 收
 *   - R-2: bash 漏判 (e.g. shlex quote 拆分) 接受, 走 require_confirmation 而非 deny
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
// 注: tool-loop 调 evaluateBashCommand 时会把 command + args 合并成 1 条字符串再 match,
// 解决 `mv a b` / `cp a b` 等 command-only regex 漏判的问题
const DANGEROUS_BASH_PATTERNS: ReadonlyArray<RegExp> = [
  // === 文件破坏 (v1.0 红线) ===
  // rm -rf / or rm -fr / (path start with /)
  /\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*)+[^\n]*\//i,
  // rm -rf ~ (home dir wipe)
  /\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*)+[^\n]*~/i,
  // mv 全部 (用户 review 拍板: "v1.0 红线是'未经确认不 mv', 不只是 /etc/系统路径")
  // 拍板 (2026-06-05): 宁多弹确认, 漏 mv 风险太高
  /\bmv\b/,
  // cp 全部 (跟 mv 同拍板: 宁多弹确认)
  /\bcp\b/,
  // chown / chmod 改权限 (chmod 777 是经典写错场景)
  /\bchown\b/i,
  /\bchmod\b/i,

  // === 系统 / 磁盘 ===
  // mkfs (format filesystem)
  /\bmkfs(?:\.\w+)?\b/i,
  // dd if= (raw disk write)
  /\bdd\s+if=/i,
  // shutdown / reboot / halt / poweroff
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  // redirect to /dev/sda or /dev/nvme* (raw disk overwrite)
  />\s*\/dev\/(sda|nvme\d)/i,

  // === 远程下载 + 执行 (curl|sh, wget|bash) ===
  // curl ... | sh / bash / python
  /\bcurl\b[^\n]*\|\s*(sh|bash|python\d*|zsh|ksh|fish)/i,
  /\bwget\b[^\n]*\|\s*(sh|bash|python\d*|zsh|ksh|fish)/i,
  // curl -o /path + chmod + execute 套路 (远程 dropper)
  /\bcurl\b[^\n]*-o\s+\/tmp\//i,
  /\bwget\b[^\n]*-O\s+\/tmp\//i,
];

/**
 * bash regex 危险模式 — 暴露给 tool-loop 在 bash 工具自身层也用 (双重防线)
 *
 * Sprint 1c-revive-3-D-13 review P1 修复 (2026-06-05):
 *   拍板 (用户 2026-06-05): "bash 检测先轻量合并 command + args"
 *   不引 shlex dep, MVP 接受 quote 拆分漏判 (R-2 拍板).
 */
export function evaluateBashCommand(cmd: string, args: ReadonlyArray<string>): PolicyDecision {
  // 拍板: 合并 command + " " + args.join(" ") 一条字符串再 regex match.
  // 拍板: 不 strip quote, 不引 shlex (R-2 拍板). 漏判走 require_confirmation 而非 deny.
  const merged = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
  for (const pat of DANGEROUS_BASH_PATTERNS) {
    if (pat.test(merged)) {
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
      // 兜底: "未在白名单" 的 tool (含 caller 自注册 tool, e.g. test 'hanger') 走 allow.
      // 拍板 (D-13): 'tool-not-found' 已经在 executeToolCall 上层 (registry.get 拍)
      // 拦了, policy 这层不需要再判 unknown. 给 caller 自定义 tool 留口 (D-15 user config 接入
      // 也会用 default 分支).
      return { decision: 'allow' };
    }
  }
}

export const staticToolPolicy: ToolPolicy = {
  evaluate(toolCall: PolicyToolCall, _ctx: PolicyContext): PolicyDecision {
    return evaluateByToolName(toolCall.name, toolCall.argsDigest);
  },
  // confirm 留 undefined — REPL / RPC 模式注入自己的 confirm 实现 (D-13 MVP 留空)
};
