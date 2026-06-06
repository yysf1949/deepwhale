/**
 * @deepwhale/tui-ink — debug slash commands (D-26 C3, 跟 Hermes 对齐).
 *
 * 2 debug 命令:
 *   - /heapdump   V8 heap snapshot + 内存诊断 (D-27 抽 memory.ts lib 时实做)
 *   - /mem        印 V8 heap + rss 数字 (现在拍只印, D-27 memory monitor 拍)
 *
 * 拍板 (D-26):
 *   - D-26 拍: /heapdump /mem 简单实现 (process.memoryUsage() 印, heap snapshot D-27 拍)
 *   - 0 memory 监控, 0 OOM 防护 (D-29+ 拍, 跟 Hermes 1:1)
 *   - D-26 B3 实战拍: process.memoryUsage() 永远 0 错
 *
 * 业务 0 重写, 1:1 拍 Hermes ui-tui/src/app/slash/commands/debug.ts 行为.
 */

import type { SlashCommand } from './types.js'

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb < 1 ? `${(bytes / 1024).toFixed(1)}KB` : `${mb.toFixed(1)}MB`
}

export const debugCommands: ReadonlyArray<SlashCommand> = [
  {
    name: 'heapdump',
    aliases: ['mem'],
    help: 'V8 heap snapshot + memory diagnostics (D-27 升级 full memory.ts)',
    category: 'debug',
    run: (_arg, ctx) => {
      // D-26 简化: 只印 process.memoryUsage(), D-27 升级 writeHeapDump.
      const mu = process.memoryUsage()
      const text = [
        '  /heapdump — process.memoryUsage()',
        '  ────────────────────────────────────────────────────',
        `  rss:           ${formatBytes(mu.rss)}`,
        `  heapTotal:     ${formatBytes(mu.heapTotal)}`,
        `  heapUsed:      ${formatBytes(mu.heapUsed)}`,
        `  external:      ${formatBytes(mu.external)}`,
        `  arrayBuffers:  ${formatBytes(mu.arrayBuffers)}`,
        '  ────────────────────────────────────────────────────',
        '  (D-27 升级: 写 v8.writeHeapSnapshot, D-29 升级: auto OOM 防护)',
      ].join('\n')
      ctx.pushEntry({ kind: 'assistant', text: `\n${text}\n` })
    },
  },
]
