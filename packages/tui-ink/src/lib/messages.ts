/**
 * @deepwhale/tui-ink — messages 工具 (D-26 C1, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/lib/messages.ts 1:1 (upsert 函数).
 * Hermes 是 4 行极简, D-26 抄 + JSDoc + 类型 export 拍板.
 *
 * 用途: D-28 composer 状态机 hook 集成时, 连续同 role 消息合并 (跟 Hermes ui-tui
 * useMainApp 行为一致), tui transcript 显示更干净.
 *
 * 业务 0 改, 1:1 抄 Hermes.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface Msg {
  role: Role
  text: string
}

/**
 * 合并连续同 role 消息 (Hermes upsert 1:1).
 *  - prev 最后一条 role == role: 替换最后一条
 *  - 其它: 追加新条
 * 用途: 流式响应时, 同 role 增量累积, 不每次新增 entry.
 */
export const upsert = (prev: Msg[], role: Role, text: string): Msg[] =>
  prev.at(-1)?.role === role ? [...prev.slice(0, -1), { role, text }] : [...prev, { role, text }]
