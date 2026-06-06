/**
 * @deepwhale/tui-ink — core slash commands (D-26 C3, 跟 Hermes 对齐).
 *
 * 5 核心命令:
 *   - /help        印 9 命令列表 (代码块, 跟 REPL --help 风格一致)
 *   - /exit (q/quit) 退出 TUI, 跟 D-24.3 1:1
 *   - /clear       清空 transcript, 不关 session, 不写 session event
 *   - /verify      调 runVerify() 印到 transcript (D-26 拍: 调函数不 spawn bin)
 *   - /status      印 model + session path + usage 状态
 *
 * 拍板 (D-26):
 *   - /exit /exit /quit 走 D-24.3 1:1 行为, writer.close 走 finish 路径
 *   - /verify 调 coding-agent runVerify() (已 D-26 C3 export 链扩)
 *   - /clear 0 关 session, 0 写 session event (跟 D-19.5 finish 路径无关)
 *
 * 业务 0 重写, 1:1 拍 Hermes ui-tui/src/app/slash/commands/core.ts 行为.
 */

import type { SlashCommand } from './types.js'

/** /help 印的 9 命令行 (跟 D-26 §3.2 拍板一致, /help 拍板 9 命令). */
const HELP_LINES: ReadonlyArray<ReadonlyArray<string>> = [
  ['/help', 'list 9 commands'],
  ['/exit (q/quit)', 'exit TUI'],
  ['/clear', 'clear transcript (no session close)'],
  ['/verify', 'run verify (build/lint/typecheck/test)'],
  ['/status', 'show model + session path + usage'],
  ['/model <name>', 'switch model'],
  ['/resume', 'list session paths (D-28 picker)'],
  ['/personality <name>', 'switch system prompt personality'],
  ['/heapdump (mem)', 'V8 heap snapshot + memory diagnostics'],
]

export const coreCommands: ReadonlyArray<SlashCommand> = [
  {
    name: 'help',
    help: 'list 9 commands + hotkeys',
    category: 'core',
    run: (_arg, ctx) => {
      // 9 命令拍板, 按 core / session / debug 分类. 拍板: 飞书 DM 表格不渲染,
      // 印代码块格式 (跟 D-26 plan §3.2 拍板一致).
      const lines = HELP_LINES.map(([cmd, desc]) => `  ${cmd.padEnd(24)} ${desc}`)
      const helpText = [
        '  /help — 9 commands',
        '  ────────────────────────────────────────────────────',
        ...lines,
        '  ────────────────────────────────────────────────────',
        '  (slash registry 中央化, 跟 Hermes ui-tui 1:1)',
      ].join('\n')
      ctx.pushEntry({ kind: 'assistant', text: `\n${helpText}\n` })
    },
  },
  {
    name: 'exit',
    aliases: ['q', 'quit'],
    help: 'exit TUI (writer.close 走 D-19.5 finish 路径)',
    category: 'core',
    run: (_arg, ctx) => {
      // 跟 D-24.3 /exit /q /quit 1:1, writer.close 走 finish 路径
      // 1:1 跟 Hermes exit 拍板, 0 改业务
      ctx.exit({ exitCode: 0, reason: 'user-exit' })
    },
  },
  {
    name: 'clear',
    help: 'clear transcript (0 关 session, 0 写 session event)',
    category: 'core',
    run: (_arg, ctx) => {
      // D-26 C3 拍: /clear 只清 transcript, 0 关 session, 0 写 session event
      // 跟 tui.ts "clear" 不同 — tui.ts 拍 "new session", D-26 简化只清 transcript
      ctx.clearTranscript()
      ctx.pushEntry({ kind: 'assistant', text: '\n  transcript cleared\n' })
    },
  },
  {
    name: 'verify',
    help: 'run verify (build/lint/typecheck/test)',
    category: 'core',
    run: async (_arg, ctx) => {
      // D-26 拍: /verify 调 runVerify() 函数, 不 spawn bin
      // 原因: spawn child_process 复杂, 还可能重入 useRunToolLoop, 拍直接调函数
      // import 动态避免循环依赖 (跟 D-19 P1 教训一致)
      const { runVerify } = await import('@deepwhale/coding-agent')
      ctx.pushEntry({ kind: 'assistant', text: '\n  /verify running...\n' })
      try {
        const report = await runVerify()
        const status = report.overallStatus
        const summary = `\n  /verify done: ${status} (${report.checks.length} checks)\n`
        ctx.pushEntry({ kind: 'assistant', text: summary })
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        ctx.pushEntry({ kind: 'assistant', text: `\n  /verify error: ${err}\n` })
      }
    },
  },
  {
    name: 'status',
    help: 'show model + session path + usage',
    category: 'core',
    run: (_arg, ctx) => {
      const usage = ctx.ui.usage
      // Usage 字段是 snake_case (跟 OpenAI 协议), D-26 §3.2 拍板
      const usageStr = usage
        ? `${usage.prompt_tokens ?? 0} prompt / ${usage.completion_tokens ?? 0} completion / ${usage.total_tokens ?? 0} total`
        : '(no usage yet)'
      const statusText = [
        '  /status',
        '  ────────────────────────────────────────────────────',
        `  model:        ${ctx.model}`,
        `  mode:         ${ctx.ui.mode}`,
        `  session:      ${ctx.sessionPath ?? '(no session file)'}`,
        `  usage:        ${usageStr}`,
        `  transcript:   ${ctx.transcript.length} entries`,
        '  ────────────────────────────────────────────────────',
      ].join('\n')
      ctx.pushEntry({ kind: 'assistant', text: `\n${statusText}\n` })
    },
  },
]
