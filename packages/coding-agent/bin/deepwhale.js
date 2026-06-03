#!/usr/bin/env node
/**
 * deepwhale CLI 入口 — Sprint 0.3
 *
 * 用法：
 *   deepwhale                    # 启动 REPL
 *   deepwhale --version          # 输出版本号
 *   deepwhale --help             # 输出帮助
 *
 * Sprint 0.3 极简：只启动 REPL。v1.0+ 加 subcommands (run/serve/eval)。
 */

import { startRepl } from '../dist/index.js';

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  // 版本号跟 dist 包版本一致；不依赖外部 import（保持 single-file）
  process.stdout.write('deepwhale 0.1.0 (Sprint 0.3)\n');
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`deepwhale — Coding Agent CLI

Usage:
  deepwhale                Start interactive REPL
  deepwhale --version      Print version and exit
  deepwhale --help         Print this help

Environment:
  DEEPSEEK_API_KEY         Required. Set in ~/.deepwhale/config.toml or env.
  DEEPWHALE_LANG           Optional. 'en' (default) or 'zh-CN'.

Built-in REPL commands:
  /help, /exit, exit, quit
`);
  process.exit(0);
}

// 默认：启动 REPL
startRepl().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
