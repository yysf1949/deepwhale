#!/usr/bin/env node
/**
 * deepwhale CLI 入口 — Sprint 1a
 *
 * 3 种运行模式：
 *   deepwhale                       # interactive REPL（默认）
 *   deepwhale -p "..."               # print 模式：一次性 chat + tool loop
 *   deepwhale --rpc                 # RPC 模式：NDJSON over stdio（Sprint 1a stub）
 *
 * Sprint 0.3 极简：只启动 REPL。Sprint 1a 加 3 模式路由。
 *
 * 通用参数：
 *   --session <path>    JSONL 持久化路径
 *   --no-tool-loop      退化到 Sprint 0.3 单轮 chat（不调工具）
 *   --max-steps <n>     工具循环上限（默认 5）
 *   --version | -v      输出版本
 *   --help | -h         输出帮助
 */

import { resolve as pathResolve } from 'node:path';
import process from 'node:process';
import { startRepl } from '../dist/index.js';
import { runPrintMode } from '../dist/modes/print.js';
import { runRpcMode } from '../dist/modes/rpc.js';

/**
 * @typedef {Object} CliArgs
 * @property {'interactive'|'print'|'rpc'} mode
 * @property {string|undefined} prompt
 * @property {string|undefined} sessionPath
 * @property {boolean} enableToolLoop
 * @property {number} maxSteps
 */

/**
 * @param {ReadonlyArray<string>} argv
 * @returns {CliArgs}
 */
function parseArgs(argv) {
  const args = {
    mode: 'interactive',
    prompt: undefined,
    sessionPath: undefined,
    enableToolLoop: true,
    maxSteps: 5,
  };

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--version' || a === '-v') {
      process.stdout.write('deepwhale 0.1.0 (Sprint 1a)\n');
      process.exit(0);
    }
    if (a === '--help' || a === '-h') {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (a === '--rpc') {
      args.mode = 'rpc';
      i += 1;
      continue;
    }
    if (a === '-p' || a === '--prompt') {
      args.mode = 'print';
      args.prompt = argv[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (a === '--session') {
      args.sessionPath = pathResolve(argv[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (a === '--no-tool-loop') {
      args.enableToolLoop = false;
      i += 1;
      continue;
    }
    if (a === '--max-steps') {
      const n = Number.parseInt(argv[i + 1] ?? '5', 10);
      args.maxSteps = Number.isFinite(n) && n > 0 ? n : 5;
      i += 2;
      continue;
    }
    // 未知参数 → 当作 print 模式的 prompt(Sprint 0.3 兼容)
    if (!a.startsWith('-')) {
      args.mode = 'print';
      args.prompt = a;
    }
    i += 1;
  }
  return args;
}

const HELP_TEXT = `deepwhale — Coding Agent CLI

Usage:
  deepwhale                         Start interactive REPL (default)
  deepwhale -p "<prompt>"           Print mode: single-shot chat + tool loop
  deepwhale --rpc                   RPC mode: NDJSON over stdio (Sprint 1a stub)

Options:
  --session <path>    Persist session to JSONL file
  --no-tool-loop      Disable tool calling (single-turn chat only)
  --max-steps <n>     Max tool-loop steps (default 5)
  --version, -v       Print version and exit
  --help, -h          Print this help

Environment:
  DEEPSEEK_API_KEY    Required. Set in ~/.deepwhale/config.toml or env.
  DEEPWHALE_LANG      Optional. 'en' (default) or 'zh-CN'.

Built-in REPL commands:
  /help, /exit, exit, quit
`;

/**
 * 路由到 3 种模式之一。
 * Sprint 1a:interactive/print 接 tool loop + session;rpc 是 NDJSON 框架 stub。
 *
 * @returns {Promise<number>}
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.mode) {
    case 'interactive':
      return startRepl({
        ...(args.sessionPath !== undefined ? { sessionPath: args.sessionPath } : {}),
        enableToolLoop: args.enableToolLoop,
      });
    case 'print':
      if (!args.prompt) {
        process.stderr.write('Error: print mode requires -p "<prompt>" argument\n');
        return 2;
      }
      return runPrintMode({
        prompt: args.prompt,
        ...(args.sessionPath !== undefined ? { sessionPath: args.sessionPath } : {}),
        enableToolLoop: args.enableToolLoop,
        maxSteps: args.maxSteps,
      });
    case 'rpc':
      return runRpcMode({
        ...(args.sessionPath !== undefined ? { sessionPath: args.sessionPath } : {}),
        maxSteps: args.maxSteps,
      });
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
