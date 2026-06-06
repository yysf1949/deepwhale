/**
 * @deepwhale/tui-ink — useSubmission hook (D-26 C4, 跟 Hermes useSubmission 对齐).
 *
 * 跟 Hermes ui-tui/src/app/useSubmission.ts 简化版 (Hermes 87 行 + gateway RPC 抽象).
 * D-26 简化: 0 gateway RPC, 0 paste snip, 0 multi-line editor 拍 D-28 升级. 只做 input 路由:
 *   1. 检测 input 是否 slash 命令 (D-26 C2/C3 registry)
 *   2. slash 命令: 走 cmd.run(arg, ctx), ctx 由调用方注入
 *   3. 普通 chat: 调 caller 提供的 onChat(prompt) 回调
 *
 * 跟 ship-quality-checks §7a + D-25 B3 一致: 0 改业务, 1:1 拍 Hermes 1:1 行为.
 *
 * 不做 (defer D-28+):
 *   - paste 折 snip (D-28 composer 状态机)
 *   - $EDITOR 外部编辑器 (D-28)
 *   - double enter 检测 (Hermes DOUBLE_ENTER_MS, D-28)
 *   - 图片 / 文件 drop (Hermes 1:1, D-29 gateway bridge)
 */

import { useCallback } from 'react'
import { findSlashCommand, isSlashCommand, type SlashContext } from '../commands/index.js'

export interface UseSubmissionOptions {
  /** Slash 命令 ctx (由 App 容器构造, 透传 transcript / pushEntry / setModel / exit) */
  slashContext: SlashContext
  /** 普通 chat input 调 (跟 tui.ts runOneTurn 1:1, D-19 controller 拍) */
  onChat: (prompt: string) => Promise<void> | void
}

export interface UseSubmissionResult {
  /**
   * 提交 input (跟 Hermes useSubmission.send 1:1).
   * @param text raw input, 含 `/` prefix (slash) 或 chat text
   * @returns 同步: 'slash' | 'chat' | 'empty' (测断言用)
   */
  submit: (text: string) => 'slash' | 'chat' | 'empty'
}

/**
 * D-26 C4: 抽 input 提交路径到 hook, App.tsx handlePromptSubmit 减重.
 * 业务 0 改, 1:1 拍 Hermes useSubmission send() 行为.
 */
export function useSubmission(options: UseSubmissionOptions): UseSubmissionResult {
  const { slashContext, onChat } = options

  const submit = useCallback(
    (text: string): 'slash' | 'chat' | 'empty' => {
      const trimmed = text.trim()
      if (!trimmed) return 'empty'

      // 1. slash 命令路由 (D-26 C2 registry)
      if (isSlashCommand(trimmed)) {
        // 解析 `/cmd arg1 arg2` → cmd='cmd', arg='arg1 arg2'
        const spaceIdx = trimmed.indexOf(' ')
        const cmdName = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
        const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()
        const cmd = findSlashCommand(cmdName)
        if (cmd) {
          cmd.run(arg, slashContext)
          return 'slash'
        }
        // 找不到命令: 跟 Hermes 1:1 fallback (不抛错, push 提示)
        slashContext.pushEntry({
          kind: 'assistant',
          text: `\n  unknown command: /${cmdName}\n  (run /help for the 9 commands list)\n`,
        })
        return 'slash'
      }

      // 2. 普通 chat: 调 caller 提供的 onChat
      void onChat(trimmed)
      return 'chat'
    },
    [slashContext, onChat],
  )

  return { submit }
}
