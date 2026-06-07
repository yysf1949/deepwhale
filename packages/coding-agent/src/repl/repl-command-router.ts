/**
 * REPL slash builtin command router — Sprint 1c-revive-3-D-29.1.3 (2026-06-07).
 *
 * 历史:
 *   Sprint 0.3: REPL 接 /help / /exit / exit / quit 4 个内建命令, 派发写在
 *     rl.on('line') 闭包内 (原 repl.ts L434-481). 后续 D-11 加 /verify (走
 *     runVerify + 写 verification event 到 session), D-19 加 confirm 期间 /exit
 *     dismiss-then-pendingExit 顺序红线, D-19.6.1 加 slash builtin guard
 *     (turnInFlight 时除 /exit /quit 外 deny 其它 slash builtin).
 *   D-29.1.3 (2026-06-07): 抽到独立文件, 跟 repl-confirm.ts / repl-signal-coordinator.ts
 *     / repl-session.ts 工厂形态对齐.
 *
 * 拍板 (D-29.1.3):
 *   - 入口: dispatchSlashBuiltin(line, ctx) → { handled: boolean }
 *   - 闭包内不持 state, 所有副作用 (out / err / writer / prompt) 通过 ctx 注入
 *     (跟 D-29.1.1 signal-coordinator 抽法 1:1 一致, 单测 mock ctx 即可).
 *   - 派发顺序保 1:1 (跟原 rl.on('line') L434-481): /help → /verify → /unknown slash.
 *   - 行为 1:1 等价, 5 红线 0 改: turnInFlight/lineQueue state machine 仍在 repl.ts
 *     (slash guard L409-418 + chat path L490+), router 只搬 dispatch 闭包.
 *   - 公共 API 0 改: 5 caller (src/index.ts, modes/print.ts, modes/tui.ts,
 *     test/repl/*, test/unit/repl-verify.test.ts) 全部走 '../repl.js' 公共 re-export
 *     路径, 0 改 import.
 *   - 0 加新依赖, runVerify / buildSummaryAndNext / formatReport / appendVerificationEvent
 *     走 ctx 注入 (test mock 用, prod 走 ./verify/index.js 真实 export).
 *
 * 拍板 (D-29.1.3 §out of scope):
 *   - 不接 turnInFlight guard — 那在 repl.ts L409-418, 跟 6afccc8 / D-19.5p 拍板
 *     "deny 非 /exit /quit slash builtin" 红线绑定, 不在本 router scope.
 *   - 不接 lineQueue defer — D-19.5 P1 "只排 chat line, 不排 slash builtin", 跟 router
 *     "handled: boolean" 二态返值绑定, 调用方决定 defer / deny / handle.
 *   - 不接 confirm 期间 /exit dismiss — D-19.5 P2-dismiss, 在 repl.ts L370-373
 *     confirm path, 不在本 router scope.
 */

import { t, type SessionWriter } from '@deepwhale/core'
import { appendVerificationEvent } from '../agent/index.js'
import { runVerify, buildSummaryAndNext, formatReport, type VerifyCheck } from '../verify/index.js'

export interface SlashContext {
  /** stdout writer for user-facing output */
  out: NodeJS.WritableStream
  /** stderr writer for error output */
  err: NodeJS.WritableStream
  /** session writer (optional, only set when session is enabled) */
  writer: SessionWriter | null
  /** REPL options.verifyChecks — test injects mocks, prod leaves undefined for 4 default steps */
  verifyChecks: VerifyCheck[] | undefined
  /** re-prompt the user (write prompt char + flush) */
  prompt: () => void
  /**
   * D-30.1α.3: /new 触发, 由 caller 注入 (createLineHandler 内部清 workingMessages).
   * 不在 router 里直接持 workingMessages — router "闭包内不持 state" 红线 (D-29.1.3).
   */
  onNewSession?: () => void
}

/**
 * Dispatch a slash builtin command (/help, /verify, unknown slash).
 *
 * Returns `handled: true` if the line was a recognized slash builtin and was
 * processed. Returns `handled: false` if the line should fall through to the
 * chat / lineQueue path.
 *
 * Order (跟原 repl.ts L434-481 1:1 保):
 *   1. /help   → out.write(i18n cli.builtin_help) + prompt + return
 *   2. /verify → runVerify → formatReport → out.write → if (writer)
 *                appendVerificationEvent + try/catch wrap (1ceef94 红线)
 *   3. /unknown slash (line.startsWith('/') 但不命中 /help /verify)
 *                → out.write(i18n cli.builtin_unknown) + prompt + return
 *
 * 5 红线 0 改 (跟 ship-quality-checks §7a + D-19/19.5/19.5p/6afccc8/1ceef94 一致):
 *   - /verify try/finally + appendVerificationEvent (1ceef94): 修法不在 try/finally,
 *     而在 try/catch — verify 失败 (e.g. 命令不存在) 不污染 session, 走 stderr i18n
 *     提示 + prompt 继续. appendVerificationEvent 仅 status='passed' 或 'failed' 时
 *     写, 不在 catch 块里 (跟 D-11-4 拍板一致).
 *   - turnInFlight guard (D-19.6.1 + 6afccc8): 不在本 router, 调用方 repl.ts L409-418
 *     决定是否调 dispatchSlashBuiltin.
 *   - confirm 期间 /exit dismiss (D-19.5 P2-dismiss): 不在本 router, repl.ts L370-373
 *     confirm path 处理.
 *   - /exit fast-path (D-19.5 P1): 不在本 router (line === '/exit' 走 turnInFlight guard
 *     L412 exclude, 不入 dispatch).
 *   - line.startsWith('/') unknown i18n (D-21.1): 跟原 L477-481 1:1 保.
 */
export async function dispatchSlashBuiltin(
  line: string,
  ctx: SlashContext,
): Promise<{ handled: boolean }> {
  if (line === '/help') {
    const help = [
      'Available slash commands:',
      '  /help      show this help',
      '  /clear     clear the screen',
      '  /new       start a new session (clears working messages)',
      '  /status    show current state (model, session, ema)',
      '  /verify    run verify checks',
      '  /theme     switch theme (default/solarized/monochrome)',
      '  /model     switch LLM model',
      '  /tools     list registered tools',
      '  /exit, /q, /quit   exit REPL',
    ].join('\n')
    ctx.out.write(`${help}\n\n`)
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/verify') {
    // Sprint 1c-revive-2-D-11-4 (2026-06-04): REPL `/verify` 内建命令.
    // 跟 CLI `deepwhale --verify` 走同一 runVerify() — 不走 LLM / tool loop.
    // 拍板 (D-11-4 review, 2026-06-04): REPL 里 /verify 走**异步** runVerify,
    // 跑完打 formatReport 到 out (跟其它内建命令风格一致), 然后**写 verification
    // event 到 session JSONL** (因为用户在 REPL 里跑了 verify, session 走 audit
    // 轨迹, 跟 CLI 不写 session 形成差异).
    // 退出: REPL 不退, 跑完回到 prompt 继续.
    try {
      const report = await runVerify(
        ctx.verifyChecks !== undefined ? { checks: ctx.verifyChecks } : {},
      )
      const filled = buildSummaryAndNext(report)
      const text = formatReport({
        ...report,
        summary: filled.summary,
        nextSuggestedAction: filled.nextSuggestedAction,
      })
      ctx.out.write(`${text}\n`)
      if (ctx.writer) {
        // 写 verification event 到 session (跟 CLI 不同: REPL 用户有 session, 应该审计)
        const failedCount = report.checks.filter((c) => c.status !== 'passed').length
        await appendVerificationEvent(ctx.writer, {
          status: report.overallStatus,
          durationMs: report.durationMs,
          commandCount: report.checks.length,
          failedCount,
          summary: filled.summary,
        })
      }
    } catch (e) {
      ctx.err.write(
        `error: verify failed to start: ${e instanceof Error ? e.message : String(e)}\n\n`,
      )
    }
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/clear') {
    // D-30.1α.2: ANSI clear screen + cursor home + redraw prompt.
    // 不调 console.clear (强耦合 stdout TTY 检测), 直接 ANSI escape 给 ctx.out.
    ctx.out.write('\x1b[2J\x1b[H')
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/new') {
    // D-30.1α.3: /new 走 onNewSession 回调清 workingMessages (注入端在 createLineHandler).
    // router 本身不持 workingMessages, 保 D-29.1.3 "闭包内不持 state" 红线.
    ctx.out.write('starting new session...\n\n')
    if (ctx.onNewSession) ctx.onNewSession()
    ctx.prompt()
    return { handled: true }
  }
  if (line.startsWith('/')) {
    ctx.out.write(`${t('cli.builtin_unknown', line)}\n`)
    ctx.prompt()
    return { handled: true }
  }
  return { handled: false }
}
