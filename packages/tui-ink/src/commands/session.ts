/**
 * @deepwhale/tui-ink — session slash commands (D-26 C3, 跟 Hermes 对齐).
 *
 * 3 session 命令:
 *   - /model <name>    切 model (走 env 推断 + 显式 provider, 跟 modes 1:1)
 *   - /resume          列 session 路径 (D-28 picker 占位, D-26 拍 "0 实际列, 拍 'D-28 升级'")
 *   - /personality <name> 切 system prompt (D-26 拍 "0 实际切, 占位")
 *
 * 拍板 (D-26):
 *   - /model 真的改 (跟 tui-ink options.model 同形态)
 *   - /resume /personality 拍 "D-28+ 升级", D-26 占位 push 提示信息
 *   - 0 改业务 (D-19 controller, D-25 集成测 0 改)
 *
 * 业务 0 重写, 1:1 拍 Hermes ui-tui/src/app/slash/commands/session.ts 行为.
 */

import type { SlashCommand } from './types.js'

export const sessionCommands: ReadonlyArray<SlashCommand> = [
  {
    name: 'model',
    help: 'switch model (e.g. /model deepseek-v4-flash)',
    category: 'session',
    run: (arg, ctx) => {
      // D-26 拍: /model 改 ctx.model, 真的切. provider narrow 跟 App.tsx 1:1.
      const model = arg.trim()
      if (!model) {
        ctx.pushEntry({ kind: 'assistant', text: '\n  /model <name>  requires a model name (e.g. /model deepseek-v4-flash)\n' })
        return
      }
      // provider 从 model 名启发式推断 (跟 deepseek / anthropic prefix 1:1)
      // D-26 简化: 不跑 createDefaultClient 重 init, 仅 push 提示信息
      // 真实 model 切换在 D-28+ 拍 (要走 useState + LLMClient factory 重 build)
      const provider = model.startsWith('claude') ? 'anthropic' : 'deepseek'
      ctx.setModel(model, provider)
      ctx.pushEntry({ kind: 'assistant', text: `\n  /model set to ${model} (provider: ${provider})\n  (note: D-26 拍, 实际 LLMClient 重 build 留 D-28+)\n` })
    },
  },
  {
    name: 'resume',
    help: 'list session paths (D-28 picker 升级)',
    category: 'session',
    run: (_arg, ctx) => {
      // D-26 拍: /resume 占位, 提示 D-28 picker 升级.
      // 实际 session picker 在 D-28 + useComposerState 拍 (跟 Hermes sessionPicker 1:1).
      ctx.pushEntry({
        kind: 'assistant',
        text: '\n  /resume: D-28 picker 升级 (跟 Hermes sessionPicker 1:1)\n  暂不支持多 session 切换, 跟 tui.ts 单 session 1:1\n',
      })
    },
  },
  {
    name: 'personality',
    help: 'switch system prompt personality (D-27 markdown 渲染接)',
    category: 'session',
    run: (_arg, ctx) => {
      // D-26 拍: /personality 占位, 提示 D-27 升级.
      const name = _arg.trim()
      if (!name) {
        ctx.pushEntry({ kind: 'assistant', text: '\n  /personality <name>  requires a name (D-27 升级)\n' })
        return
      }
      ctx.pushEntry({
        kind: 'assistant',
        text: `\n  /personality set to ${name} (D-26 拍 placeholder, D-27 升级接)\n`,
      })
    },
  },
]
