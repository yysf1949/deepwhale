/**
 * @deepwhale/coding-agent — Verify runner
 *
 * Sprint 1c-revive-2-D-11 (2026-06-04): `deepwhale --verify` 跟 REPL `/verify`
 * 内部统一走 `runVerify()` — 跑 4 步真验证 (build / lint / typecheck / test),
 * 不走 LLM, 不走 tool loop, 生成 `VerificationReport`.
 *
 * 设计拍板:
 *   - 4 步默认: corepack pnpm build / lint / typecheck / test
 *   - 用户可覆盖 checks (单测用) / cwd (单测 tmpdir) / signal (取消)
 *   - 每步 spawn child_process 同步等 exit, **不**用 stream (避免长 stdout 卡 session)
 *   - stdout/stderr 截断: 默认 4 KB 尾, 防止 session JSONL 撑爆
 *   - timeout 默认 5 min/步, 总 timeout 默认 30 min (build+lint+typecheck+test 全跑)
 *   - 任何一步 fail → 整体 fail, **不**继续后续步 (用户拍的 D-11 review: fail-fast
 *     比继续跑节省时间, 而且后续步基于 build 产物, fail-fast 防止假绿)
 *   - 不读 .env, 不动 LLM, 不调 tool loop — 真·本地 CLI
 *
 * 不变量 (跟 D-10c 集成测语义 hotfix 一脉相承):
 *   - 不打印 / 不写 key 值
 *   - 不做 ASCII-only sanitize
 *   - 不读 .env 文件 (D-7 loadProjectEnv 是 caller 职责)
 *   - 不依赖 LLM client (跑 verify 不需要 key)
 *
 * @module @deepwhale/coding-agent/verify-runner
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * Verify context. 拍板 (D-21.0, 2026-06-06): verify 模式现在支持 2 种环境:
 *   - 'monorepo': 在 deepwhale 源码仓库根跑 (有 pnpm-workspace.yaml, 或根 package.json 含 workspaces 字段),
 *     跑 4 步真验证 (build/lint/typecheck/test), 跟 D-11 拍板保持一致
 *   - 'installed': 在 `npm install -g @deepwhale/coding-agent` 后的环境跑 (单包 node_modules,
 *     没 pnpm / vitest / eslint), 跑 4 步 sanity check (node --check / import / bin / exports),
 *     验证"装出来能跑" + "主入口能 import" + "bin 能装" + "至少 export 1 个 symbol"
 *
 * 判 monorepo: `cwd` 存在 `pnpm-workspace.yaml` **或** 根 `package.json` 含 `workspaces` 字段.
 * 拍板: 这两个 marker 在生态里都表示 monorepo. deepwhale 自己用的是 pnpm-workspace.yaml
 * 形式 (根 package.json 没有 workspaces 字段), npm/yarn workspaces 用 package.json#workspaces
 * 形式. 任一存在即 monorepo — 兼容两家. 都不存在 → installed.
 *
 * 不变量: detectContext 是 **同步纯函数** (不调外部命令, 不读 .env), 给定 cwd 返固定 context.
 */
export type VerifyContext = 'monorepo' | 'installed';

export function detectContext(cwd: string = process.cwd()): VerifyContext {
  const hasWorkspaceYaml = existsSync(join(cwd, 'pnpm-workspace.yaml'));
  let hasWorkspacesField = false;
  try {
    const rootPkgPath = join(cwd, 'package.json');
    if (existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8')) as {
        workspaces?: unknown;
      };
      hasWorkspacesField =
        rootPkg.workspaces !== undefined &&
        rootPkg.workspaces !== null &&
        (Array.isArray(rootPkg.workspaces) || typeof rootPkg.workspaces === 'object');
    }
  } catch {
    // package.json 读不到 / JSON 坏 → 视作 installed (保守)
    hasWorkspacesField = false;
  }
  return hasWorkspaceYaml || hasWorkspacesField ? 'monorepo' : 'installed';
}

/** 单步验证配置. */
export interface VerifyCheck {
  /** 人类可读步骤名 (报告里显示). */
  name: string;
  /** 完整命令 (报告里显示). 例: "corepack pnpm build". */
  command: string;
  /** 实际 spawn 的 argv (不含 corepack, corepack 处理自动). */
  args: ReadonlyArray<string>;
  /** spawn cwd. 不传走 options.cwd / process.cwd(). */
  cwd?: string;
  /** 该步 timeout (ms). 不传走 options.defaultTimeoutMs / 300_000. */
  timeoutMs?: number;
}

/** 单步结果. */
export type VerifyCheckStatus = 'passed' | 'failed' | 'timed-out' | 'spawn-error' | 'aborted';

export interface VerifyCheckResult {
  name: string;
  command: string;
  status: VerifyCheckStatus;
  /** spawn 退出码. spawn 失败或 timeout 时为 null. */
  exitCode: number | null;
  /** 该步 startedAt (epoch ms). */
  startedAt: number;
  /** 该步 endedAt (epoch ms). */
  endedAt: number;
  /** 该步 durationMs. */
  durationMs: number;
  /** stdout 末尾截断 (默认 4 KB). 永远不写原始大文件. */
  stdoutTail: string;
  /** stderr 末尾截断 (默认 4 KB). */
  stderrTail: string;
  /** spawn / abort 错时的 error.message. 否则 undefined. */
  errorMessage?: string;
}

/** 整体报告. */
export type VerificationOverallStatus = 'passed' | 'failed';

export interface VerificationReport {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  overallStatus: VerificationOverallStatus;
  checks: ReadonlyArray<VerifyCheckResult>;
  /** 一句话人类可读总结. */
  summary: string;
  /** 建议下一步. */
  nextSuggestedAction: string;
}

export interface RunVerifyOptions {
  /** 自定义 checks. 不传走默认 4 步. */
  checks?: ReadonlyArray<VerifyCheck>;
  /** 工作目录. 不传走 process.cwd(). */
  cwd?: string;
  /** 外部 AbortSignal (单测 / REPL / CLI 取消). */
  signal?: AbortSignal;
  /** 默认每步 timeout (ms). 默认 300_000 (5 min). */
  defaultTimeoutMs?: number;
  /** stdout/stderr 截断字节数. 默认 4096. */
  stdoutCapBytes?: number;
  /** 失败时是否继续. 默认 false (fail-fast). 单测可改. */
  continueOnError?: boolean;
}

const MONOREPO_CHECKS: ReadonlyArray<VerifyCheck> = [
  // 拍板: args[0] 是实际 spawn 的可执行 (e.g. 'corepack'), 后面是它的参数.
  // 4 步 default 用 corepack 跑 pnpm, 跟用户日常工作流一致
  // (corepack 自身 < 5MB, 启动 < 200ms, 不显著影响 verify 总耗时).
  //
  // Sprint 1c-revive-2-D-11-4 review P1 修复 (2026-06-04): args[0] 在 Windows 上
  // 由 resolveRunner() 转成 'corepack.cmd'. 默认仍写 'corepack' (Linux/macOS 不变,
  // 跟 1c 时代兼容性), 真 spawn 时再换. 单测可注入 platform = 'win32' 验证.
  {
    name: 'build',
    command: 'corepack pnpm build',
    args: ['corepack', 'pnpm', 'build'],
  },
  {
    name: 'lint',
    command: 'corepack pnpm lint',
    args: ['corepack', 'pnpm', 'lint'],
  },
  {
    name: 'typecheck',
    command: 'corepack pnpm typecheck',
    args: ['corepack', 'pnpm', 'typecheck'],
  },
  {
    name: 'test',
    command: 'corepack pnpm vitest run --exclude "packages/*/test/integration/**"',
    args: ['corepack', 'pnpm', 'vitest', 'run', '--exclude', 'packages/*/test/integration/**'],
  },
];

/**
 * Installed-context checks (D-21.0, 2026-06-06).
 *
 * 拍板: 当 `npm install -g @deepwhale/coding-agent` 之后, 用户的 cwd 一般是
 * "我的项目" 而非 "deepwhale 源码仓库". 此时 verify 不能再跑 pnpm build/lint/
 * typecheck/vitest — 这些 devDep 没 ship. 改成 4 步 "装出来能跑" 的 sanity:
 *
 *   1. syntax-check  : `node --check <main>`              — dist JS 能 parse
 *   2. import-check  : `node -e "import('${pkg}')"`       — 包名 (走 exports 重定向)
 *   3. bin-check     : `ls -la <bin-path>`                 — bin 文件存在
 *   4. exports-check : `node -e "import('${pkg}').then(m => Object.keys(m).length >= 1)"`
 *                                                       — 至少 export 1 个 symbol
 *
 * 关键设计: 不调 pnpm / vitest / eslint / tsc. 只用 node 内置 + 文件系统, 单包
 * 装出来后能跑. 拍板 (D-21.0, 2026-06-06, bugfix 2): import-check / exports-check
 * 用**包名** (e.g. '@deepwhale/coding-agent') 不是**绝对路径**. Node 22 ESM
 * 不支持 `import('/abs/path/to/dir')` (Directory import), 必须用包名让 Node 走
 * node_modules 解析 + package.json#exports 重定向. 绝对路径只用于 syntax-check /
 * bin-check (--check + ls 不解 import).
 *
 * 拍板 (D-21.0, 2026-06-06, bugfix 1): import-check / exports-check 的 args[2]
 * **必须**是完整 JS 字符串, 内含 `import('${pkg}')` 调用, 渲染时只替换包路径.
 * 不能让 `args[2]` 等于包路径 (那是 shell exec 的 bug, 不是 JS 源码).
 *
 * 已知局限: installed check 不验证"工具调用"/"session JSONL"等运行时行为 — 这
 * 些靠 v1.0.1 真实跑 print / REPL 模式覆盖. verify 在 installed 模式下定位是
 * "装出来能装能 import", 不是 "功能 100% 端到端".
 */
const INSTALLED_CHECKS_TEMPLATE: ReadonlyArray<Omit<VerifyCheck, 'command'> & { commandTemplate: string }> = [
  {
    name: 'syntax-check',
    commandTemplate: 'node --check ${CWD}/dist/index.js',
    args: ['node', '--check', '__CWD__/dist/index.js'],
  },
  {
    name: 'import-check',
    commandTemplate: 'node -e "import(\'${PKG}\').then(m => process.exit(0)).catch(e => { process.stderr.write(e.message); process.exit(1) })"',
    args: [
      'node',
      '-e',
      "import('__PKG__').then(m => process.exit(0)).catch(e => { process.stderr.write(e.message); process.exit(1); })",
    ],
  },
  {
    name: 'bin-check',
    commandTemplate: 'test -f ${CWD}/bin/deepwhale.js',
    args: ['test', '-f', '__CWD__/bin/deepwhale.js'],
  },
  {
    name: 'exports-check',
    commandTemplate: 'node -e "import(\'${PKG}\').then(m => process.exit(Object.keys(m).length >= 1 ? 0 : 1)).catch(e => { process.stderr.write(e.message); process.exit(1) })"',
    args: [
      'node',
      '-e',
      "import('__PKG__').then(m => process.exit(Object.keys(m).length >= 1 ? 0 : 1)).catch(e => { process.stderr.write(e.message); process.exit(1); })",
    ],
  },
];

/**
 * 给定"装出来的 coding-agent 包的根路径" 渲染 INSTALLED_CHECKS_TEMPLATE: 替换
 * args 里的占位符, 同时生成可读的 command 字符串. 模板 → 实例 是纯映射.
 *
 * 拍板: 包根 = "包含 dist/ + bin/ + package.json 的目录". 1.0.1 实测路径:
 *   global install: `<prefix>/lib/node_modules/@deepwhale/coding-agent`
 *   local install: `<proj>/node_modules/@deepwhale/coding-agent`
 *
 * 拍板 (D-21.0, 2026-06-06, bugfix 3): import-check / exports-check 必须把
 * cwd 设到 `dirname(packageRoot)` (即 node_modules 的**父目录**), 不然 Node
 * 在用户 cwd (/tmp 或别的项目) 跑 `import('@deepwhale/coding-agent')` 时报
 * "Cannot find package" — Node 解析包名从 cwd 向上找 node_modules, cwd 错
 * 就找不到. 把 cwd 设到包根**之上**, Node 解析时能找到 node_modules/@deepwhale/...
 *
 * 调用方 (pickChecksForContext) 用 resolveInstalledPackageRoot() 拿这个路径.
 * 包名 (PKG) 硬编码 '@deepwhale/coding-agent' — 这是 verify 验证的唯一目标包.
 */
function renderInstalledChecks(packageRoot: string): ReadonlyArray<VerifyCheck> {
  const pkgName = '@deepwhale/coding-agent';
  // 包根的父目录 = node_modules 所在目录. global: `<prefix>/lib/node_modules`;
  // local: `<proj>/node_modules`. Node 从这个目录起能找到包.
  const nodeModulesDir = dirname(packageRoot);
  return INSTALLED_CHECKS_TEMPLATE.map((t) => {
    const renderedCommand = t.commandTemplate
      .replace(/\$\{CWD\}/g, packageRoot)
      .replace(/\$\{PKG\}/g, pkgName);
    const renderedArgs = t.args.map((a) =>
      a
        .replace(/__CWD__/g, packageRoot)
        .replace(/__CWD_DIST__/g, `${packageRoot}/dist/index.js`)
        .replace(/__PKG__/g, pkgName),
    );
    // import-check / exports-check 需要 cwd = node_modules 所在目录才能解析包名.
    // syntax-check / bin-check 用绝对路径, 不需要特殊 cwd.
    const needsNodeModulesCwd = t.name === 'import-check' || t.name === 'exports-check';
    return {
      name: t.name,
      command: renderedCommand,
      args: renderedArgs,
      ...(needsNodeModulesCwd ? { cwd: nodeModulesDir } : {}),
    };
  });
}

/**
 * 解析"装出来的 @deepwhale/coding-agent 包的根目录" (绝对路径).
 *
 * 拍板 (D-21.0, 2026-06-06): verify 验证的目标是这个**包本身**, 不是用户
 * cwd. 跟用户跑 `deepwhale --verify` 在哪个目录无关. resolveInstalledPackageRoot
 * 必须**独立于 cwd** — 否则用户在 /tmp 跑, verify 就跑去 /tmp 检查, 完全错.
 *
 * 实现策略: ESM 里用 `import.meta.url` 不行 (verify-runner 不是 entry). 用
 * `require.resolve('@deepwhale/coding-agent/package.json')` 找自身包的 package.json,
 * 再 dirname 拿根. CommonJS require 在 ESM module 里走 createRequire. 兼容 tsc
 * 输出 CommonJS 跟 ESM 两种 module 格式.
 */
export function resolveInstalledPackageRoot(): string {
  // createRequire 在 ESM 文件里是合法用法 (Node 12+). 注意: 装出来的 dist/verify/
  // verify-runner.js 跟 @deepwhale/coding-agent/package.json 在同一 node_modules
  // 树下, require.resolve 一定能找到 (前提是这个包真被 require).
  //
  // 拍板 (D-21.0, 2026-06-06): 用 fileURLToPath(import.meta.url) 拿当前 ESM
  // module 的 file:// URL, 换成本地 path, 再 createRequire 拿 req. 这是 ESM
  // 文件里 "走 require" 的官方推荐姿势 — 直接写 `require(...)` 在 ESM 顶层
  // ReferenceError (strict mode 报 require is not defined).
  const req = createRequire(fileURLToPath(import.meta.url));
  const pkgJsonPath = req.resolve('@deepwhale/coding-agent/package.json');
  return dirname(pkgJsonPath);
}

/**
 * 给定 cwd 选对应 context 的 check 集. 拍板 (D-21.0): 单点决策, 后续要加
 * 'ci' (GitHub Actions) 或 'docker' (容器内) 上下文, 改这里.
 *
 * 重要: cwd 参数**只用于 detectContext** (判 monorepo). installed 模式的
 * check 始终以 coding-agent 包自身根为基准, 不受 cwd 影响.
 */
export function pickChecksForContext(cwd: string = process.cwd()): ReadonlyArray<VerifyCheck> {
  const ctx = detectContext(cwd);
  if (ctx === 'monorepo') return MONOREPO_CHECKS;
  return renderInstalledChecks(resolveInstalledPackageRoot());
}

/**
 * Sprint 1c-revive-2-D-11-4 review P1 修复: Windows 上 `corepack` 在 PATH 解析不到
 * (Node `spawn('corepack', ...)` 在 Win32 默认走 CreateProcessW, 不接 .cmd shim).
 * 实际 `where corepack` 只返 `corepack.cmd`. 修复: Win32 上把 'corepack' → 'corepack.cmd'.
 *
 * 设计: 接受 platform 参数, 默认用 process.platform, 单测可注入 'win32' 验证.
 * 仅在 args0 严格 === 'corepack' 时转换; 其它可执行 (node / bash / .exe) 透传,
 * 跟单测里 mock 各种 runner 的行为兼容.
 */
export function resolveRunner(args0: string, platform: NodeJS.Platform = process.platform): string {
  if (args0 === 'corepack' && platform === 'win32') {
    return 'corepack.cmd';
  }
  return args0;
}

/**
 * 判定 child close 时的 stderr / stdout 是不是 "启错" 文本 (Win32 shell:true
 * 路径下, "命令不存在" / "No such file" 走 cmd.exe exit 1, 不会 sync spawn
 * 抛). 跨 Win32 shell 启错模式: cmd.exe "X is not recognized" + PowerShell
 * "term not recognized" + POSIX shell 偶发 (e.g. via /bin/sh -c) "No such
 * file". 命中返 true, caller 报 'spawn-error' 跟 POSIX 语义对齐.
 *
 * 设计: 故意**不**用 ENOENT (Node child 不暴露), 也不查 PATH. 简单字符串匹配
 * 几个高置信度关键词, 误伤率低. 留 D-20.8 用 stderr 双检 + Node fs.access
 * 再强化.
 *
 * 拍板 (D-20.7.7, 2026-06-06): 保守匹配, 不命中普通命令 exit 1 (e.g. 编译失败,
 * 测试 fail) 误报.
 */
export function looksLikeSpawnError(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): boolean {
  if (exitCode === 0) return false;
  const text = `${stdout}\n${stderr}`;
  // 关键词按 Win32 cmd / PowerShell / POSIX /bin/sh 优先级排
  // D-25 A2 (F5, 2026-06-06) **更激进删** (用户 22:50 拍板):
  //   - 修前: 6 patterns 含 `/No such file/i` 短匹配, 误伤 Vitest ENOENT 业务错误
  //   - 用户 plan 原拍"删短匹配保留完整短语", 实测 plan §1.2 自相矛盾:
  //     完整短语 `/No such file or directory/i` 仍命中 Node ENOENT 业务文本
  //     (`Error: ENOENT: no such file or directory, open '/x'`)
  //   - 用户 22:50 拍板"更激进删", 同时删短匹配 + 完整短语, 只留
  //     cmd.exe / bash / PowerShell 5 个非 POSIX 关键词
  //   - 跟 memory §10c 7 关键词 shape 不变量兼容 (实测 7 关键词里 POSIX
  //     文本只在 spawn-error 真实场景出现, 业务 ENOENT 走 status='failed' 真实路径)
  //   - 同步: 删 plan 写的"保留完整短语"那段, 拍板更新到 .hermes/plans/d19/
  const patterns = [
    /is not recognized/i, // cmd.exe: 'X' is not recognized as an internal or external command
    /not recognized as/i, // cmd.exe 长串前段
    /command not found/i, // POSIX bash 完整短语
    /cannot find the (path|file)/i, // cmd.exe 'The system cannot find the path specified'
    /is not a (recognized|valid) command/i, // PowerShell
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * 跑 4 步验证 (默认), 返回 `VerificationReport`.
 *
 * 拍板 (D-11, 2026-06-04):
 *   - 任一 step 失败 → 整体 fail, **不**继续后续 step (fail-fast).
 *     后续 step 基于 build 产物, 跑也是浪费; 而且 build fail 时 typecheck/test 必挂,
 *     显式 fail-fast 比假绿更诚实.
 *   - 步骤间**不**共享 stdout/stderr buffer: 每步清零 Buffer 防止污染.
 *   - 返回的报告 `overallStatus` = 'failed' iff 任一 step status ∈ {failed, timed-out, spawn-error}.
 *   - summary / nextSuggestedAction 由调用方 (REPL/CLI/format-report) 写.
 *     runner 不写自然语言, 保持纯函数语义 (便于单测 / roundtrip).
 */
export async function runVerify(options: RunVerifyOptions = {}): Promise<VerificationReport> {
  // Sprint D-21.0 (2026-06-06): 默认走 pickChecksForContext(cwd) — 根据 cwd 是
  // monorepo 还是 installed, 选对应 check 集. 调用方仍可传 options.checks 显式覆盖
  // (单测, REPL 强制 4 步等).
  const checks = options.checks ?? pickChecksForContext(options.cwd ?? process.cwd());
  const cwd = options.cwd ?? process.cwd();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 300_000;
  const stdoutCapBytes = options.stdoutCapBytes ?? 4096;
  const continueOnError = options.continueOnError ?? false;
  const overallStart = Date.now();

  const results: VerifyCheckResult[] = [];
  let aborted = false;

  // 监听外部 signal: 任何 step 跑时如果外部 abort, 立即停止后续 step
  const onAbort = (): void => {
    aborted = true;
  };
  if (options.signal) {
    if (options.signal.aborted) {
      aborted = true;
    } else {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    for (const check of checks) {
      if (aborted) {
        // 外部 signal 触发: 后续 step 全 mark 跳过, 不跑
        const now = Date.now();
        results.push({
          name: check.name,
          command: check.command,
          status: 'spawn-error',
          exitCode: null,
          startedAt: now,
          endedAt: now,
          durationMs: 0,
          stdoutTail: '',
          stderrTail: '',
          errorMessage: 'aborted by external signal',
        });
        if (!continueOnError) break;
        continue;
      }
      // Sprint 1c-revive-2-D-11-4 review P2 修复: 传 signal 进 runOneCheck 让
      // 当前 child 在外部 abort 触发时被 kill, 跟"取消不能卡住"目标一致.
      // 之前 signal 只在 runVerify 主循环设 aborted, **不**影响当前 child,
      // 只能"等下 step 跳过" — race 时 child 跑完才看到 abort.
      const result = await runOneCheck(check, {
        cwd,
        defaultTimeoutMs,
        stdoutCapBytes,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
      results.push(result);
      if (result.status !== 'passed' && !continueOnError) {
        break;
      }
    }
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  const overallEnd = Date.now();
  const overallFailed = results.some((r) => r.status !== 'passed');
  const overallStatus: VerificationOverallStatus = overallFailed ? 'failed' : 'passed';

  return {
    startedAt: overallStart,
    endedAt: overallEnd,
    durationMs: overallEnd - overallStart,
    overallStatus,
    checks: results,
    // summary / nextSuggestedAction 由 caller 写 (保持 runner 纯函数)
    summary: '',
    nextSuggestedAction: '',
  };
}

interface RunOneCheckOpts {
  cwd: string;
  defaultTimeoutMs: number;
  stdoutCapBytes: number;
  /**
   * Sprint 1c-revive-2-D-11-4 review P2 修复 (2026-06-04): 传外部 AbortSignal 进
   * runOneCheck, signal 触发时 kill 当前 child (SIGTERM → 1s grace → SIGKILL),
   * 返回 status='aborted'. 之前 signal handler 只在 runVerify 主循环设 aborted,
   * **不**影响当前正在跑的 child, race 时 child 跑完才看到 abort, 语义跟"取消/
   * timeout 不能卡住" 目标不一致.
   */
  signal?: AbortSignal;
}

async function runOneCheck(check: VerifyCheck, opts: RunOneCheckOpts): Promise<VerifyCheckResult> {
  const start = Date.now();
  const timeoutMs = check.timeoutMs ?? opts.defaultTimeoutMs;
  const cwd = check.cwd ?? opts.cwd;
  const cap = opts.stdoutCapBytes;

  return new Promise<VerifyCheckResult>((resolve) => {
    let stdoutBuf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderrBuf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let resolved = false;
    let child: ReturnType<typeof spawn> | null = null;
    let timer: NodeJS.Timeout | null = null;
    // Sprint 1c-revive-2-D-11-4 review P2 修复: 独立于 runVerify 主循环的 aborted,
    // 标 "当前 child 因外部 signal 被 kill". 避免跟 runVerify 的 "跳过下一 step" 语义混淆.
    let childAborted = false;
    // Sprint D-20.7.2 (2026-06-06): 标 timer-fired 状态. 不再在 timer fired 时
    // 立刻 finalize, 改在 child.on('close') 判定 → 避免 Windows 上 child cwd
    // 句柄没释放时 caller rmSync(workDir) EPERM.
    let timedOut = false;
    // Sprint D-20.7.7.1 (2026-06-06): hoist useShell 到外层, 让 try 块内 (line 363)
    // 和 try 块**外**的 child.on('close') handler (line 524+) 都能闭包访问.
    // 之前 try 块内 const, close handler 在 try 块外, ReferenceError. 拍板: useShell
    // 是 "platform → boolean" 的纯计算, 无副作用, hoist 安全.
    const useShell = process.platform === 'win32';
    // Sprint 1c-revive-2-D-11-4 review P2 修复: signal abort 触发的 1s grace timer,
    // 提前到 finalize 前声明 (闭包共享). child 不响应 SIGTERM 时用它兜底 SIGKILL.
    let sigkillTimer: NodeJS.Timeout | null = null;
    // Sprint 1c-revive-2-D-11+4 review P2 修复 (2026-06-05): 闭包持有的 "child 已
    // 退出" 标记. child.on('close', ...) 里设 true. 用这个代替 Node 内置 child.killed,
    // 因为 child.killed 表示"信号已发送" 不是"进程已退出" — 后者才是 grace timer
    // 判断要不要发 SIGKILL 兜底的依据.
    let childClosed = false;
    // Sprint 1c-revive-3-D-12 review P3 修复 (2026-06-05, 基于 fea52d1 review):
    // 提到外层, 让 finalize() 能 removeEventListener 兜底 listener leak.
    // 之前 onAbort 是 if 块内的 const, finalize 拿不到引用; listener 在
    // addEventListener { once: true } 时 fire 后自动移除, 但**未 fire** 走
    // (正常 step 跑完 + finalize) 时 listener 永远挂 signal 上. 多 checks /
    // 自定义 checks 链路下 listener 累积, 主流程影响小, 但顺手收干净.
    // 声明 () => void 而非 Event listener 签名, 避免 onAbort() 调用 TS2554.
    let onAbort: (() => void) | null = null;

    const finalize = (result: VerifyCheckResult): void => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      // Sprint 1c-revive-2-D-11-4 review P2 修复: 清 sigkill grace timer, 避免
      // child 已 close 后被 SIGKILL 错杀.
      if (sigkillTimer) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
      if (opts.signal && onAbort) {
        // Sprint 1c-revive-3-D-12 review P3 修复 (2026-06-05, 基于 fea52d1 review):
        // 显式 removeEventListener 兜底. onAbort 在 spawn 成功后 addEventListener
        // { once: true }, fire 后 Node 自动移除; 但**未 fire** 走 (正常 step
        // 跑完 + finalize, 没触发外部 abort) 时 listener 永远挂 signal 上.
        // 主流程影响小 (resolved guard 兜住重复 fire), 但多 checks 链路下
        // listener 累积, 顺手收干净.
        opts.signal.removeEventListener('abort', onAbort);
        onAbort = null;
      }
      if (child && !childClosed) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* best-effort */
        }
      }
      resolve(result);
    };

    try {
      // 拍板 (D-11, 2026-06-04): 透传 args[0] 给 spawn, 不写死 corepack.
      // 调用方可以传 'node' / 'bash' / 'corepack' / 任何 spawn 兼容的可执行.
      // 4 步 default 用 corepack, 跟用户日常工作流一致.
      // Sprint 1c-revive-2-D-11-4 review P1 修复: spawn 前用 resolveRunner 转换
      // runner 字符串, Windows 上 'corepack' → 'corepack.cmd'.
      const rawRunner = check.args[0];
      if (typeof rawRunner !== 'string' || rawRunner.length === 0) {
        throw new Error(
          `VerifyCheck '${check.name}' args[0] must be a non-empty string (the runner binary)`,
        );
      }
      const runner = resolveRunner(rawRunner);
      const subArgs = check.args.slice(1);
      // useShell 必须在 try 块内声明, 但 close handler 在 try 块**外** (line 524+)
      // 闭包共享. hoist 到 try 块前的外层 (line 335) 让两边都能访问. Sprint
      // D-20.7.7.1 (2026-06-06): 修 useShell ReferenceError, 原代码 try 块内 const
      // 闭包不外传, child.on('close') 报 'useShell is not defined' → 测全 fail.
      // 不再重复声明.
      child = spawn(runner, subArgs, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env, // 透传 env, 不注入任何东西 (loadProjectEnv 是 caller 职责)
        shell: useShell,
      });
    } catch (e) {
      // spawn 同步失败 (e.g. corepack 不在 PATH)
      const end = Date.now();
      finalize({
        name: check.name,
        command: check.command,
        status: 'spawn-error',
        exitCode: null,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: '',
        stderrTail: '',
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    // Sprint 1c-revive-2-D-11-4 review P2 修复: spawn 成功后立刻注册 signal 监听,
    // 外部 abort 触发时:
    //   1. 设 childAborted = true (close handler 用它返回 status='aborted')
    //   2. kill 当前 child (SIGTERM 优先, 1s grace 后 SIGKILL 兜底, sigkillTimer 见 Promise 开头声明)
    // 之前不传 signal 进 runOneCheck, 当前 child 不被 kill, 只能"等下 step 跳过"
    // — 跟"取消不能卡住"目标不一致, 也会造成资源泄漏.
    //
    // Sprint 1c-revive-2-D-11+4 review P2 修复 (2026-06-05): 改用 childClosed 闭包
    // 变量判断"child 真的退出了", 不再用 child.killed (Node 标记"信号已发", 跟
    // "进程已退出" 语义不同). 否则 child 忽略 SIGTERM (e.g. 阻塞 IO / 自定义
    // handler trap) 时, 1s 后 grace timer 判 !child.killed = false 跳过 SIGKILL,
    // 子进程仍卡到 timeout 之前的所有步骤.
    if (opts.signal) {
      onAbort = (): void => {
        if (resolved) return;
        childAborted = true;
        if (child && !childClosed) {
          try {
            child.kill('SIGTERM');
          } catch {
            /* best-effort */
          }
          // 1s grace: 给 child 清理时间. 真不响应 (e.g. blocking IO) → SIGKILL.
          // close 完成后 finalize 会清掉这个 timer (见下), 避免错杀.
          sigkillTimer = setTimeout(() => {
            if (child && !childClosed) {
              try {
                child.kill('SIGKILL');
              } catch {
                /* best-effort */
              }
            }
          }, 1000);
        }
      };
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    // 装 stdout/stderr 流, 保留 cap bytes 尾.
    // 用 Buffer.concat 重建 (subarray 共享内存但类型 Buffer<ArrayBufferLike> 不赋给
    // Buffer<ArrayBuffer>, ts 5.x 严格模式抓得到, 改 Buffer.from(merged) 重新建独立 Buffer)
    const capAppend = (buf: Buffer, chunk: Buffer): Buffer => {
      const merged = Buffer.concat([buf, chunk]);
      if (merged.length <= cap) return merged;
      return Buffer.from(merged.subarray(merged.length - cap));
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf = capAppend(stdoutBuf, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf = capAppend(stderrBuf, chunk);
    });

    // Sprint D-20.7.2 (2026-06-06): timer fired 不再立刻 finalize.
    // 之前直接 resolve → Windows 上 child cwd 句柄还占着, 测里 rmSync(workDir)
    // EPERM. 修法: 标 timedOut=true, 调 child.kill, 等 'close' 才 finalize.
    // 双重保险: 5s 后 child 还没 close, 走 grace kill + 再 finalize (避免永远 hang).
    timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child && !child.killed) {
          // Windows 上 SIGTERM 等价 kill 进程, Node 内部走 TerminateProcess.
          child.kill('SIGTERM');
        }
      } catch {
        // best-effort; 如果 kill 失败, 走 grace timer SIGKILL 兜底
      }
      // grace timer: 5s 内 child 没 close → SIGKILL
      sigkillTimer = setTimeout(() => {
        try {
          if (child && !childClosed) {
            child.kill('SIGKILL');
          }
        } catch {
          // best-effort
        }
        // grace 仍 timeout 时强制 finalize, 避免 caller 永远 hang
        const end = Date.now();
        finalize({
          name: check.name,
          command: check.command,
          status: 'timed-out',
          exitCode: null,
          startedAt: start,
          endedAt: end,
          durationMs: end - start,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          errorMessage: `timeout after ${timeoutMs}ms (grace SIGKILL fired, child still not closed)`,
        });
      }, 5_000);
    }, timeoutMs);

    child.on('close', (code, signal) => {
      // Sprint 1c-revive-2-D-11+4 review P2 修复 (2026-06-05): close 触发 = child 真退出.
      // sigkillTimer 内部据此判断, 不再依赖 child.killed (Node 标记语义不对).
      childClosed = true;
      const end = Date.now();
      // Sprint D-20.7.2 (2026-06-06): timeout 路径优先于 signal 判定. 如果 timer
      // 先 fired, 我们 kill 了 child, 那 close 触发时 timedOut=true 应当报 'timed-out',
      // 不报 'spawn-error' (SIGTERM 误报) 或 'aborted' (跟外部 signal 混淆).
      // 同时清 sigkillTimer, 避免 grace 错杀.
      if (timedOut) {
        if (sigkillTimer) {
          clearTimeout(sigkillTimer);
          sigkillTimer = null;
        }
        finalize({
          name: check.name,
          command: check.command,
          status: 'timed-out',
          exitCode: code,
          startedAt: start,
          endedAt: end,
          durationMs: end - start,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          errorMessage: `timeout after ${timeoutMs}ms (killed, child closed)`,
        });
        return;
      }
      // Sprint 1c-revive-2-D-11-4 review P2 修复: childAborted 优先, 返回 'aborted'
      // 让 caller 知道是外部 signal 触发的 kill, 不是 child 自身崩溃.
      if (childAborted) {
        finalize({
          name: check.name,
          command: check.command,
          status: 'aborted',
          exitCode: code,
          startedAt: start,
          endedAt: end,
          durationMs: end - start,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          errorMessage: 'aborted by external signal during execution',
        });
        return;
      }
      // signal 触发 kill → 'spawn-error' (用户主动取消)
      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        finalize({
          name: check.name,
          command: check.command,
          status: 'spawn-error',
          exitCode: code,
          startedAt: start,
          endedAt: end,
          durationMs: end - start,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          errorMessage: `killed by signal ${signal}`,
        });
        return;
      }
      // Sprint D-20.7.7 (2026-06-06): Win32 shell:true 后, "命令不存在" 不再 sync
      // spawn 抛, 而是 shell 跑完调不存在的 binary, exit=1 + stderr 'is not
      // recognized'. 旧代码直接 'failed' 让语义边界乱: POSIX 走得到 'spawn-error',
      // Win32 走不到. 修法: shell 用过的路径 (useShell=true) + 启错文本命中 →
      // 'spawn-error', 跟 POSIX 行为对齐. 非 shell 路径不动 (Linux/macOS 默认
      // shell:false, ENOENT 由 child.on('error') 接, 不会到这条分支).
      //
      // Sprint D-20.7.7.1 (2026-06-06): exitCode 归一为 null. POSIX 同步 spawn 抛
      // (child.on('error') 路径) 不暴露 exit code (line 540+). Win32 shell 路径
      // 现在也归一, 保持两路 shape 一致 — caller 不必区分 "启错 exit=1 vs 启错 sync 抛"
      // 只看 status='spawn-error' + exitCode=null. D-20.7.7 初版留 code 实际值
      // (e.g. 1), 测 expect null fail. 修法: 强制 null.
      if (
        useShell &&
        code !== 0 &&
        looksLikeSpawnError(stdoutBuf.toString('utf8'), stderrBuf.toString('utf8'), code)
      ) {
        finalize({
          name: check.name,
          command: check.command,
          status: 'spawn-error',
          exitCode: null,
          startedAt: start,
          endedAt: end,
          durationMs: end - start,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          errorMessage: `command not found / not callable (shell detected: stderr contains "is not recognized" or "No such file")`,
        });
        return;
      }
      const status: VerifyCheckStatus = code === 0 ? 'passed' : 'failed';
      finalize({
        name: check.name,
        command: check.command,
        status,
        exitCode: code,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: stdoutBuf.toString('utf8'),
        stderrTail: stderrBuf.toString('utf8'),
      });
    });

    child.on('error', (e) => {
      const end = Date.now();
      finalize({
        name: check.name,
        command: check.command,
        status: 'spawn-error',
        exitCode: null,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: stdoutBuf.toString('utf8'),
        stderrTail: stderrBuf.toString('utf8'),
        errorMessage: e.message,
      });
    });
  });
}
