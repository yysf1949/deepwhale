/**
 * @deepwhale/tui-ink — slash command barrel (D-26 C2, 跟 Hermes 对齐).
 *
 * 跟 Hermes ui-tui/src/app/slash 5 类分目录 拍板 1:1, D-26 简化为 3 类:
 *   - core: 基础 (help / exit / clear / verify / status) - Hermes 1:1
 *   - session: session 管理 (model / resume / personality) - Hermes 1:1
 *   - debug: 内存 / 调试 (heapdump / mem) - Hermes 1:1
 *
 * 不做 (defer D-29+):
 *   - ops: ops 命令 (skills / tools), 跟 tui-ink 不重
 *   - setup: setup 命令 (provider / setup), 跟 tui-ink 不重
 *
 * 业务 0 改, 1:1 拍 Hermes 5 类的 3 类简化.
 */

export type { SlashCommand, SlashContext } from './types.js'
export { SLASH_COMMANDS, findSlashCommand, isSlashCommand } from './registry.js'
