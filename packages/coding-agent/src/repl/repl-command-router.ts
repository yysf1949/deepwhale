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
  /**
   * D-30.1α.4: /status 触发, 由 caller 提供当前 REPL/TUI 状态快照.
   * Sub-burst α 不接 REPL/TUI 端 wiring (留给后续 sub-burst), undefined 时走 fallback.
   */
  getStatus?: () => ReplStatus
  /**
   * D-30.1β.1: /theme 触发, 由 caller 注入 theme setter (REPL/TUI 各自接 store / useState).
   * 不在 router 里直接持 theme — 跟 D-30.1α.3 onNewSession 1:1, 保 "闭包内不持 state" 红线.
   */
  setTheme?: (name: string) => void
  /**
   * D-30.1β.1: /theme 无 arg 时列出当前 theme 名. 跟 setTheme 1:1 配对.
   */
  getThemeName?: () => string
  /**
   * D-30.1β.2: /model 触发, 由 caller 注入 model setter (REPL/TUI 各自接 client swap).
   */
  setModel?: (id: string) => void
  /**
   * D-30.1β.2: /model 无 arg 时列出当前 model id.
   */
  getCurrentModel?: () => string
  /**
   * D-30.1β.4: /tools 触发, 由 caller 提供 tool registry 列表.
   * 返回 tool 数组 (name + description), router 渲染对齐输出.
   */
  listTools?: () => ReadonlyArray<{ name: string; description: string }>
  /**
   * D-30.1δ.2: /memory 触发, 由 caller 提供 MemoryStore read 回调.
   * router 渲染当前 MEMORY.md 内容; 有 arg 时改走 appendMemory.
   */
  getMemory?: () => Promise<string>
  appendMemory?: (text: string) => Promise<void>
  /**
   * D-30.1δ.3: /skills 触发, caller 提供 skill 列表 + 内容回调.
   */
  listSkills?: () => Promise<string[]>
  readSkill?: (name: string) => Promise<string>
  /**
   * D-30.1δ.11: /cron 触发, caller 提供 cron job 列表回调 (CronStore.list 注入).
   * D-30.1δ 重命名 (d51b12e 拍板 listCronJobs → listCron), shape 1:1 保.
   */
  listCron?: () => Promise<Array<{ id: string; schedule: string; prompt: string; enabled: boolean }>>
  /**
   * D-30.1δ.12: /sessions 触发, caller 提供 session 列表回调 (SessionIndex.list 注入).
   * D-30.1δ 重命名 (d51b12e 拍板 searchSessions → listSessions), shape 扩 messageCount /
   * createdAt, 0 query param (caller 自己 search + filter).
   */
  listSessions?: () => Promise<
    Array<{ id: string; path: string; messageCount: number; firstUser: string; createdAt: number }>
  >
  /**
   * D-30.1δ.13: /load 触发, caller 提供 session 加载回调 (side-effect, 无 return).
   * D-30.1δ 重命名 + 改 shape (d51b12e loadSessionById 返 path → loadSession 返 void),
   * caller 自己内部 load + 切 workingMessages.
   */
  loadSession?: (id: string) => Promise<void>
  /**
   * D-30.1δ.14: /plan 触发, caller 注入 enter plan mode 副作用 (TUI Plan mode D-30.2 接).
   * D-30.1δ 重命名 (d51b12e getPlan 返 string → enterPlanMode 返 void).
   */
  enterPlanMode?: () => void
  /**
   * D-31.3.7: /profile 触发, caller 提供 profile-store 注入.
   * - listProfiles:    无 arg 列出所有 profile
   * - currentProfile:  /profile current 显当前
   * - switchProfile:   /profile <name> 切, 失败抛 (router 兜底 stderr)
   * - createProfile:   /profile create <name> (留 D-31.4+, 本 sub-burst 未接 CLI)
   */
  listProfiles?: () => Promise<string[]>
  switchProfile?: (name: string) => Promise<{ model?: string; theme?: string; [k: string]: unknown }>
  currentProfile?: () => Promise<{ name: string; config: { model?: string; theme?: string; [k: string]: unknown } } | null>
  createProfile?: (name: string) => Promise<void>
}

/**
 * D-30.1α.4: REPL/TUI 状态快照 (/status 输出).
 * model: 当前 LLM model id; sessionPath: session JSONL 路径 (undefined = 无 session);
 * emaSampleCount: D-21.1 EMA 平滑累计样本数; theme: UI 主题; uptimeMs: REPL 启动至今毫秒.
 */
export interface ReplStatus {
  model: string
  sessionPath: string | undefined
  emaSampleCount: number
  theme: string
  uptimeMs: number
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
      '',
      '  Session:',
      '    /new         start a new session',
      '    /sessions    list past sessions',
      '    /load <id>   resume a session',
      '',
      '  State:',
      '    /status      show model/session/ema',
      '    /theme [n]   switch theme (default/solarized/monochrome)',
      '    /model [id]  switch LLM model',
      '    /tools       list registered tools',
      '    /profile [name|current]   switch user profile (config.json + theme + model)',
      '',
      '  Knowledge:',
      '    /memory      view MEMORY.md',
      '    /skills      list loaded skills',
      '    /cron        list cron jobs',
      '',
      '  Mode:',
      '    /plan        enter plan mode',
      '    /verify      run verify checks',
      '    /clear       clear the screen',
      '    /help        show this help',
      '',
      '  Exit:',
      '    /exit, /q, /quit   exit REPL',
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
  if (line === '/status') {
    // D-30.1α.4: /status 走 getStatus 回调拉 ReplStatus, REPL/TUI 各自提供.
    // Sub-burst α 不接 REPL 端 wiring (留给后续 sub-burst), undefined 时走 fallback.
    // 格式: `key: value` 简单对齐 (跟 test 断言 1:1 spec, TDD-driven).
    if (ctx.getStatus) {
      const s = ctx.getStatus()
      const status = [
        'Current status:',
        `  model: ${s.model}`,
        `  session: ${s.sessionPath ?? '(no session)'}`,
        `  ema samples: ${s.emaSampleCount}`,
        `  theme: ${s.theme}`,
        `  uptime: ${Math.floor(s.uptimeMs / 1000)}s`,
      ].join('\n')
      ctx.out.write(`${status}\n\n`)
    } else {
      ctx.out.write('status: (no status provider wired)\n\n')
    }
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/theme' || line.startsWith('/theme ')) {
    // D-30.1β.1: /theme 走 setTheme 回调切主题. 拍板 valid: default, solarized, monochrome
    // (跟 tui-ink/src/theme/index.ts THEMES 3 preset 1:1 对齐).
    const arg = line.slice('/theme'.length).trim()
    if (!arg) {
      const current = ctx.getThemeName?.() ?? 'default'
      ctx.out.write(`current theme: ${current}\nvalid: default, solarized, monochrome\n\n`)
      ctx.prompt()
      return { handled: true }
    }
    if (!['default', 'solarized', 'monochrome'].includes(arg)) {
      ctx.out.write(`unknown theme: ${arg}\nvalid: default, solarized, monochrome\n\n`)
      ctx.prompt()
      return { handled: true }
    }
    ctx.setTheme?.(arg)
    ctx.out.write(`theme: ${arg}\n\n`)
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/model' || line.startsWith('/model ')) {
    // D-30.1β.2: /model 走 setModel 回调切 LLM model.
    const arg = line.slice('/model'.length).trim()
    if (!arg) {
      const current = ctx.getCurrentModel?.() ?? 'unset'
      ctx.out.write(`model: ${current}\n\n`)
      ctx.prompt()
      return { handled: true }
    }
    ctx.setModel?.(arg)
    ctx.out.write(`model: ${arg}\n\n`)
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/tools') {
    // D-30.1β.4: /tools 走 listTools 回调拉 tool registry, 列出 name + description.
    if (!ctx.listTools) {
      ctx.out.write('no tool registry wired\n\n')
      ctx.prompt()
      return { handled: true }
    }
    const tools = ctx.listTools()
    ctx.out.write(`${tools.length} tools:\n`)
    for (const t of tools) {
      ctx.out.write(`  ${t.name.padEnd(20)} ${t.description}\n`)
    }
    ctx.out.write('\n')
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/memory' || line.startsWith('/memory ')) {
    // D-30.1δ.2: /memory 走 getMemory / appendMemory 回调.
    // - 无 arg: 列出 MEMORY.md 内容
    // - 有 arg: append 到 MEMORY.md
    const arg = line.slice('/memory'.length).trim()
    if (arg) {
      if (!ctx.appendMemory) {
        ctx.out.write('memory append not wired\n\n')
        ctx.prompt()
        return { handled: true }
      }
      await ctx.appendMemory(arg)
      ctx.out.write(`memory appended: ${arg}\n\n`)
      ctx.prompt()
      return { handled: true }
    }
    const mem = (await ctx.getMemory?.()) ?? '(empty)'
    ctx.out.write(`=== MEMORY.md ===\n${mem}\n\n`)
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/skills' || line.startsWith('/skills ')) {
    // D-30.1δ.3: /skills 走 listSkills / readSkill 回调.
    // - 无 arg: 列出 skills 目录
    // - 有 arg: 读 SKILL.md
    const arg = line.slice('/skills'.length).trim()
    if (arg) {
      if (!ctx.readSkill) {
        ctx.out.write('skill read not wired\n\n')
        ctx.prompt()
        return { handled: true }
      }
      try {
        const content = await ctx.readSkill(arg)
        ctx.out.write(`=== ${arg}/SKILL.md ===\n${content}\n\n`)
      } catch (e) {
        ctx.err.write(`error: ${e instanceof Error ? e.message : String(e)}\n\n`)
      }
      ctx.prompt()
      return { handled: true }
    }
    if (!ctx.listSkills) {
      ctx.out.write('skill list not wired\n\n')
      ctx.prompt()
      return { handled: true }
    }
    const skills = await ctx.listSkills()
    if (skills.length === 0) {
      ctx.out.write('no skills installed\n\n')
    } else {
      ctx.out.write(`${skills.length} skills:\n`)
      for (const s of skills) {
        ctx.out.write(`  - ${s}\n`)
      }
      ctx.out.write('\n')
    }
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/cron' || line.startsWith('/cron ')) {
    // D-30.1δ.11: /cron 走 listCron 回调 (CronStore.list 注入).
    // 拍板: 列出所有 jobs, 0 query param. 加 /add / /remove 子命令留 D-30.2.
    if (!ctx.listCron) {
      ctx.out.write('cron list not wired\n\n')
      ctx.prompt()
      return { handled: true }
    }
    const jobs = await ctx.listCron()
    if (jobs.length === 0) {
      ctx.out.write('no cron jobs\n\n')
    } else {
      ctx.out.write(`${jobs.length} cron jobs:\n`)
      for (const j of jobs) {
        const flag = j.enabled ? '✓' : '✗'
        ctx.out.write(`  ${flag} ${j.id} (${j.schedule}): ${j.prompt}\n`)
      }
      ctx.out.write('\n')
    }
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/sessions' || line.startsWith('/sessions ')) {
    // D-30.1δ.12: /sessions 走 listSessions 回调 (SessionIndex.list 注入).
    // 拍板: 0 query param, caller 自己 search + filter; router 只渲染.
    if (!ctx.listSessions) {
      ctx.out.write('session list not wired\n\n')
      ctx.prompt()
      return { handled: true }
    }
    const sessions = await ctx.listSessions()
    if (sessions.length === 0) {
      ctx.out.write('no sessions found\n\n')
    } else {
      ctx.out.write(`${sessions.length} sessions:\n`)
      for (const s of sessions) {
        ctx.out.write(`  ${s.id} (${s.messageCount} msgs): ${s.firstUser}\n`)
      }
      ctx.out.write('\n')
    }
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/load' || line.startsWith('/load ')) {
    // D-30.1δ.13: /load <id> 走 loadSession 回调 (side-effect, 无 return).
    // caller (createLineHandler) 内部 load + 切 workingMessages.
    const arg = line.slice('/load'.length).trim()
    if (!arg) {
      ctx.out.write('usage: /load <session-id>\n\n')
    } else if (ctx.loadSession) {
      await ctx.loadSession(arg)
      ctx.out.write(`loaded: ${arg}\n\n`)
    }
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/plan' || line.startsWith('/plan ')) {
    // D-30.1δ.14: /plan 走 enterPlanMode 副作用 (TUI Plan mode D-30.2 接).
    ctx.enterPlanMode?.()
    ctx.out.write('plan mode: enter\n\n')
    ctx.prompt()
    return { handled: true }
  }
  if (line === '/profile' || line.startsWith('/profile ')) {
    // D-31.3.7: /profile 走 profile-store 注入.
    // - 无 arg:      listProfiles 列所有
    // - 'current':   currentProfile 显当前
    // - '<name>':    switchProfile 切 (fallback 兜底 not-found)
    const arg = line.slice('/profile'.length).trim()
    if (!ctx.listProfiles) {
      ctx.out.write('profile store not wired\n\n')
      ctx.prompt()
      return { handled: true }
    }
    if (!arg) {
      const profiles = await ctx.listProfiles()
      if (profiles.length === 0) {
        ctx.out.write('no profiles\n\n')
      } else {
        ctx.out.write(`${profiles.length} profiles:\n`)
        for (const p of profiles) ctx.out.write(`  - ${p}\n`)
        ctx.out.write('\n')
      }
      ctx.prompt()
      return { handled: true }
    }
    if (arg === 'current') {
      const cur = await ctx.currentProfile?.()
      if (!cur) {
        ctx.out.write('no current profile\n\n')
      } else {
        ctx.out.write(`current: ${cur.name}\n  ${JSON.stringify(cur.config)}\n\n`)
      }
      ctx.prompt()
      return { handled: true }
    }
    try {
      const cfg = await ctx.switchProfile?.(arg)
      if (cfg) ctx.out.write(`profile: ${arg}\n  ${JSON.stringify(cfg)}\n\n`)
    } catch (e) {
      ctx.err.write(`error: ${e instanceof Error ? e.message : String(e)}\n\n`)
    }
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
