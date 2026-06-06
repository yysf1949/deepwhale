/**
 * @deepwhale/tui-ink — slash command 中央 registry (D-26 C2, 跟 Hermes 对齐).
 *
 * 跟 Hermes ui-tui/src/app/slash/registry.ts 1:1 同形态 (中央 SLASH_COMMANDS
 * 数组 + findSlashCommand byName Map). D-26 简化: 5 类拍 3 类 (core/session/debug),
 * 0 gateway RPC 抽象 (D-29+ 拍).
 *
 * 拍板 (跟 Hermes 1:1):
 *   - name + aliases 共享 findSlashCommand 索引 (小写)
 *   - 找不到命令 → undefined, caller 决定 fallback (跟 Hermes 1:1)
 *   - 注册表是 ReadonlyArray, 不允许外部 push
 *
 * 业务 0 改, 1:1 抄 Hermes + JSDoc.
 */

import type { SlashCommand } from './types.js'
import { coreCommands } from './core.js'
import { sessionCommands } from './session.js'
import { debugCommands } from './debug.js'

/** 中央 slash command 列表 (D-26 3 类: core / session / debug, 跟 Hermes 5 类拍 3 类) */
export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  ...coreCommands,
  ...sessionCommands,
  ...debugCommands,
]

/**
 * name → command 索引, 包含 name + aliases (小写化), 跟 Hermes 1:1.
 * 找不到返 undefined, caller 处理 fallback.
 */
const byName: ReadonlyMap<string, SlashCommand> = new Map(
  SLASH_COMMANDS.flatMap(cmd =>
    [cmd.name, ...(cmd.aliases ?? [])].map(name => [name.toLowerCase(), cmd] as const)
  )
)

/** 找 slash 命令 by name (大小写不敏感, 跟 Hermes 1:1) */
export const findSlashCommand = (name: string): SlashCommand | undefined =>
  byName.get(name.toLowerCase())

/**
 * 解析 input 行是否是 slash 命令.
 * 跟 Hermes domain/slash.ts looksLikeSlashCommand 1:1.
 *  - true: input 以 `/` 开头, 是 slash 命令候选
 *  - false: 普通 chat input
 */
export const isSlashCommand = (input: string): boolean => input.startsWith('/')
