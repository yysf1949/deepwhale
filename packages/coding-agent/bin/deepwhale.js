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
 *   --provider <name>   显式 provider (deepseek | anthropic); 走 createDefaultClient
 *                       的 env 推断会被覆盖. 拍板 2026-06-04 review P2: 之前
 *                       解析没接, --provider 走 'unknown flag' 分支当 print prompt.
 *   --model <id>        显式 model id. 跟 createDefaultClient 的 model 字段对接.
 *   --no-tool-loop      退化到 Sprint 0.3 单轮 chat（不调工具）
 *   --max-steps <n>     工具循环上限（默认 5）
 *   --yes               Sprint 1c-revive-3-D-13 (2026-06-05): bypass require_confirmation
 *                       (write_file / edit_file / 危险 bash), 不 bypass deny.
 *   --version | -v      输出版本
 *   --help | -h         输出帮助
 */

import { resolve as pathResolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
// Sprint 1c-revive-2-D-7 (review, 2026-06-04): 启动时加载项目根 .env (补缺不覆盖,
// CI / shell export 优先级最高). 必须在 import dist 之前调, 让 createDefaultClient
// factory 看到 process.env['DEEPSEEK_API_KEY'] / ['ANTHROPIC_AUTH_TOKEN'] 已就位.
import { loadProjectEnv } from '../dist/env/load-project-env.js';
loadProjectEnv();
import { startRepl } from '../dist/index.js';
import { runPrintMode } from '../dist/modes/print.js';
import { runRpcMode } from '../dist/modes/rpc.js';
import { runTuiMode } from '../dist/modes/tui.js';
import { runVerify } from '../dist/verify/index.js';
import { buildSummaryAndNext, formatReport } from '../dist/verify/index.js';
// Sprint 1c-revive-4-D-20.1 (2026-06-05): 友好错误处理.
//  - APIKeyMissingError: REPL/print/rpc/tui 缺 key 时 → 印 setup hint + exit 2.
//  - "invalid DEEPWHALE_SANDBOX=..." / "invalid DEEPWHALE_DOCKER_NETWORK=...":
//    env-gate throw, CLI 入口接住转 stderr + exit 2.
import { APIKeyMissingError } from '@deepwhale/llm';

/**
 * @typedef {Object} CliArgs
 * @property {'interactive'|'print'|'rpc'|'verify'} mode
 * @property {string|undefined} prompt
 * @property {string|undefined} sessionPath
 * @property {string|undefined} provider
 * @property {string|undefined} model
 * @property {boolean} enableToolLoop
 * @property {number} maxSteps
 * @property {boolean} [yes]    Sprint 1c-revive-3-D-13: --yes flag, 透传 3 mode.
 */

/**
 * @param {ReadonlyArray<string>} argv
 * @returns {CliArgs}
 */
// Sprint D-21.0.1 (2026-06-06): --version 写死 "0.1.0 (Sprint 1a)" 跟 npm 1.0.1 /
// GitHub v1.0.1 不一致, 用户在 Windows 装出来看到 stale string. 改读自身 package.json.
//
// 拍板 (D-21.0.1, 2026-06-06):
//   - 用 createRequire(import.meta.url) 拿 `../package.json` (相对 bin 路径).
//   - 装出来: bin 在 `<prefix>/lib/node_modules/@deepwhale/coding-agent/bin/`,
//     `../package.json` 走 `<root>/package.json` ✅. 1.0.1 / 1.0.2 / 1.1.0 自动跟.
//   - monorepo: bin 在 `packages/coding-agent/bin/`, `../package.json` 走
//     `packages/coding-agent/package.json` ✅. dev workflow 也对.
//   - 输出格式跟 `npm -v` 一致 (多行, 字段对齐). 不再带 "(Sprint X)" — sprint 名
//     是设计历史, 写在 CHANGELOG / 注释里, 不进 user-facing version 字符串.
//
// 不变量: pkg 读不到 (异常路径) → fallback 旧字符串, 不让 bin 直接 crash. 跟
// Sprint 1c-revive-2-D-7 容错语义一致 (启动期不抛, 走 best-effort).
const req = createRequire(fileURLToPath(import.meta.url));
function readPkgVersion() {
  try {
    const pkg = req('../package.json');
    return {
      name: typeof pkg.name === 'string' ? pkg.name : '@deepwhale/coding-agent',
      version: typeof pkg.version === 'string' ? pkg.version : '0.0.0-unknown',
      description:
        typeof pkg.description === 'string' ? pkg.description : 'DeepWhale coding agent',
    };
  } catch {
    return { name: '@deepwhale/coding-agent', version: '0.0.0-unknown', description: '' };
  }
}
function formatVersion() {
  const { name, version, description } = readPkgVersion();
  // 跟 `npm -v` 一样, 一行 version, 一行 name+description. Windows 友好 (没 ANSI).
  return `${version}\n${name}: ${description}\n`;
}

function parseArgs(argv) {
  const args = {
    mode: 'interactive',
    prompt: undefined,
    sessionPath: undefined,
    provider: undefined,
    model: undefined,
    enableToolLoop: true,
    maxSteps: 5,
    yes: undefined,
  };

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--version' || a === '-v') {
      // Sprint D-21.0.1 (2026-06-06): 改读 package.json, 跟 npm registry / GitHub
      // release 对齐. 旧实现写死 '0.1.0 (Sprint 1a)' → 用户在 Windows 装出 1.0.1
      // 但 --version 显示 stale, 看着像 bug. 现在 npm 1.0.2 / 1.1.0 / 2.0.0 自动跟.
      process.stdout.write(formatVersion());
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
    // Sprint 1c-revive-4-D-20.3 (2026-06-05): TUI mode (D-20.3 P0-B)
    // `deepwhale tui` 启动 minimal ANSI TUI. 必须出现在 -p/--prompt 检查之前,
    // 否则 'tui' 会被当 print mode 的 prompt (D-15 拍板: 非 '-' 开头的 argv 走 print).
    if (a === 'tui') {
      args.mode = 'tui';
      i += 1;
      continue;
    }
    if (a === '--verify') {
      // Sprint 1c-revive-2-D-11-4 (2026-06-04): CLI 接入 verify 模式.
      // 走 runVerify() → formatReport() 印到 stdout, 不走 LLM / tool loop / session.
      // 退出码: 0 = passed, 1 = failed (跟 runVerify overallStatus 对应),
      //         2 = 参数错 (跟现有 mode 退出码一致)
      args.mode = 'verify';
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
    if (a === '--provider') {
      // 拍板 2026-06-04 review P2: 之前未接, --provider X 被当 prompt 进入 print 模式.
      // 校验: deepseek | anthropic (跟 llm-factory.ts 的 Provider 拍板一致).
      const v = argv[i + 1] ?? '';
      if (v !== 'deepseek' && v !== 'anthropic') {
        process.stderr.write(`Error: --provider must be 'deepseek' or 'anthropic', got '${v}'\n`);
        process.exit(2);
      }
      args.provider = v;
      i += 2;
      continue;
    }
    if (a === '--yes') {
      // Sprint 1c-revive-3-D-13 (2026-06-05): --yes 透传 3 mode.
      // 拍板: bypass require_confirmation (write_file/edit_file/bash 危险模式),
      //       不 bypass deny. 跟 R-3 拍板一致.
      args.yes = true;
      i += 1;
      continue;
    }
    if (a === '--model') {
      args.model = argv[i + 1] ?? '';
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
  deepwhale --verify                Verify mode: run build/lint/typecheck/test in
                                   monorepo, or syntax/import/bin/exports sanity
                                   checks in npm-installed context. No LLM.
  deepwhale --rpc                   RPC mode: NDJSON over stdio (Sprint 1a stub)
  deepwhale tui                     TUI mode: minimal ANSI TUI (D-20.3, ships in v1.0)

Options:
  --session <path>    Persist session to JSONL file
  --provider <name>   LLM provider: deepseek | anthropic (overrides env detection)
  --model <id>        LLM model id (e.g. deepseek-v4-flash, claude-sonnet-4-5)
  --no-tool-loop      Disable tool calling (single-turn chat only)
  --max-steps <n>     Max tool-loop steps (default 5)
  --yes               Bypass require_confirmation (write/edit/dangerous bash).
                      Does NOT bypass deny. Sprint 1c-revive-3-D-13.
  --version, -v       Print version and exit
  --help, -h          Print this help

Environment:
  DEEPSEEK_API_KEY        Required for deepseek (or --provider).
  ANTHROPIC_AUTH_TOKEN    Required for anthropic (or --provider). May also be
                          DEEPWHALE_SESSION_KEY for session-at-rest encryption.
  DEEPWHALE_LANG          Optional. 'en' (default) or 'zh-CN'.
  DEEPWHALE_SANDBOX       Optional. 'local' (default) or 'docker'.
  DEEPWHALE_DOCKER_IMAGE  Optional. default 'node:22-alpine'.
  DEEPWHALE_DOCKER_NETWORK  Optional. unset|'none' (default) or 'bridge'.
                            D-20.1: invalid value → fail-closed (exit 2).

Built-in REPL commands:
  /help, /verify, /exit, exit, quit

Setup hint:
  If you see "API key not set" on first run:
    1. Set DEEPSEEK_API_KEY=<your-key>  (or ANTHROPIC_AUTH_TOKEN=...)
    2. Or place it in ./.env (project root, see .env.example)
    3. --verify does not require any key. It auto-detects monorepo vs npm-
       installed context: in monorepo it runs build/lint/typecheck/test; in
       installed context it runs syntax-check / import-check / bin-check /
       exports-check to confirm the package is usable.
`;

/**
 * 路由到 3 种模式之一。
 * Sprint 1a:interactive/print 接 tool loop + session;rpc 是 NDJSON 框架 stub。
 * Sprint 1c-revive-2-D-5+ (review P2, 2026-06-04): --provider/--model 透传
 * 3 mode, 跟 createDefaultClient factory 对接.
 *
 * @returns {Promise<number>}
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.mode) {
    case 'interactive':
      return startRepl({
        ...(args.sessionPath !== undefined ? { sessionPath: args.sessionPath } : {}),
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.yes ? { yes: true } : {}),
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
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.yes ? { yes: true } : {}),
        enableToolLoop: args.enableToolLoop,
        maxSteps: args.maxSteps,
      });
    case 'rpc':
      return runRpcMode({
        ...(args.sessionPath !== undefined ? { sessionPath: args.sessionPath } : {}),
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.yes ? { yes: true } : {}),
        maxSteps: args.maxSteps,
      });
    case 'tui':
      return runTuiMode({
        ...(args.sessionPath !== undefined ? { sessionPath: args.sessionPath } : {}),
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.yes ? { yes: true } : {}),
        enableToolLoop: args.enableToolLoop,
        maxSteps: args.maxSteps,
      });
    case 'verify': // Sprint 1c-revive-2-D-11-4: 走 runVerify (4 步 default), formatReport 印到 stdout.
    // 退出码: passed=0, failed=1 (跟 runVerify overallStatus 对应). 跟 Unix
    // 惯例一致 (CI 脚本 \`if deepwhale --verify; then ...\`).
    // 注: 不写 session event (verify 不是 chat 行为, session JSONL 是 chat 持久化,
    //     verify 跑完不污染 session). 后续 sprint 如要 audit log, 留 --verify-log 选项.
    {
      const report = await runVerify();
      const filled = buildSummaryAndNext(report);
      const text = formatReport({
        ...report,
        summary: filled.summary,
        nextSuggestedAction: filled.nextSuggestedAction,
      });
      process.stdout.write(text + '\n');
      return report.overallStatus === 'passed' ? 0 : 1;
    }
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // Sprint 1c-revive-4-D-20.1 (2026-06-05) review-fix: 友好错误处理, 退出码 2 (跟参数错一致).
    //  - APIKeyMissingError: REPL/print/rpc/tui 缺 key → 印 setup hint
    //  - env-gate 抛 'invalid DEEPWHALE_SANDBOX=...' / 'invalid DEEPWHALE_DOCKER_NETWORK=...'
    //    → 直接 stderr 打印 (message 拼齐了 hint), exit 2
    if (err instanceof APIKeyMissingError) {
      process.stderr.write(
        'Error: API key not set. deepwhale needs DEEPSEEK_API_KEY (or ANTHROPIC_AUTH_TOKEN),\n' +
          '       or pass --provider. See --help for full setup.\n' +
          '       Hint: --verify runs build/lint/typecheck/test and does NOT need a key.\n' +
          `       Underlying: ${err.message}\n`,
      );
      process.exit(2);
    }
    if (err instanceof Error && /^invalid DEEPWHALE_SANDBOX=/.test(err.message)) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(2);
    }
    if (err instanceof Error && /^invalid DEEPWHALE_DOCKER_NETWORK=/.test(err.message)) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
