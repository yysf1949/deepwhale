/**
 * SandboxRunner 抽象 — BashTool 跟执行环境 (local / docker) 解耦
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05): 把 BashTool 里的 execFile 抽出来, 让 docker
 * sandbox 可以替换而不动工具逻辑. interface 设计原则:
 * - 命令/参数已过 allowlist + dangerous pattern (BashTool 入口做), sandbox 不重复
 * - cwd 已过 SANDBOX_ROOT 校验, sandbox 不再防 cd 跳出
 * - env 由 caller 过滤 (不传 DEEPSEEK_API_KEY / .env 之类)
 * - timeoutMs 走调用方 clamp, 内部不再二次检查
 * - 失败分两种: 命令跑挂 (ok=false, exitCode != 0) vs spawn 失败 (exitCode=null)
 *
 * MVP 边界: 这是执行环境抽象, **不是** 完整安全策略语言. 文档 .hermes/plans/d12/D12-PLAN.md
 * 写了威胁模型 + 已知风险.
 */

/** 一个 sandbox 执行请求 — 已经过 BashTool 入口校验. */
export interface SandboxRunRequest {
  /** 已被 allowlist 通过的命令名 (e.g. 'ls', 'node', 'pnpm'). 不再二次校验. */
  readonly command: string;
  /** 命令参数, 已是 string[]. 不再二次 dangerous pattern 检查. */
  readonly args: readonly string[];
  /** 工作目录, **绝对路径**, 已被 pathResolve + SANDBOX_ROOT 防跳出检查. */
  readonly cwd: string;
  /** 环境变量. MVP: 由 caller 过滤敏感 (DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN 不传). */
  readonly env?: Readonly<Record<string, string>>;
  /** 超时毫秒. BashTool 默认 60_000, Docker mode clamp 到 10 分钟. */
  readonly timeoutMs: number;
  /** stdout 保留尾 N bytes. MVP 默认 4KB (跟 VerifyCheck 一致). */
  readonly stdoutCapBytes: number;
}

/** 一个 sandbox 执行结果. */
export interface SandboxRunResult {
  /** exitCode === 0 时为 true. 包含 timeout / signal / spawn 失败都 false. */
  readonly ok: boolean;
  /** 进程退出码. spawn 失败 / signal kill 时为 null. */
  readonly exitCode: number | null;
  /** 末尾 N bytes stdout (utf8 decode). */
  readonly stdoutTail: string;
  /** 末尾 N bytes stderr (utf8 decode). */
  readonly stderrTail: string;
  /** 实际耗时. */
  readonly durationMs: number;
  /** 超时 / 主动 kill 时记录信号名. */
  readonly signal?: 'SIGTERM' | 'SIGKILL';
  /** Cleanup 失败 / docker 不存在等非致命警告. 真实失败进 error 而非 warning. */
  readonly warning?: string;
}

/** 沙箱执行器抽象. */
export interface SandboxRunner {
  /** 区分实现 — 给 caller 用于 log / 调试 / 拒绝某个 kind. */
  readonly kind: 'local' | 'docker';
  /**
   * 执行命令. 不抛异常 (除非参数类型根本不对, 那是 caller bug):
   * - 命令跑挂 → result.ok=false
   * - spawn 失败 → result.exitCode=null
   * - 超时 → result.signal=SIGTERM/SIGKILL, result.ok=false
   * - cleanup 失败 → result.warning 含 stderr tail
   */
  run(req: SandboxRunRequest): Promise<SandboxRunResult>;
  /**
   * 主动清理资源 (docker container 等). **不抛异常**, 错误进 stderr warning.
   * Local mode 是 noop. 多次调用幂等.
   */
  cleanup?(): Promise<void>;
}

/** 默认 sandbox 选项 — BashTool 构造时没传 runner 用这套. */
export interface SandboxDefaults {
  readonly defaultTimeoutMs: number;
  readonly defaultStdoutCapBytes: number;
  /**
   * 沙箱根目录, BashTool 入口 cwd 校验用. Default = process.cwd() at construct time.
   **必须**给 — 类型故意必填, 避免 process.cwd() 漂移. factory 拿不到时抛错给 caller.
   */
  readonly sandboxRoot: string;
}

/**
 * 默认值常量. 故意只填 defaultTimeoutMs + defaultStdoutCapBytes. sandboxRoot 留空
 * 字符串 — caller 必须传真值, 拿到空字符串时 BashTool ctor 会拒绝 (见构造实现).
 */
export const DEFAULT_SANDBOX_DEFAULTS: SandboxDefaults = {
  defaultTimeoutMs: 60_000,
  defaultStdoutCapBytes: 4 * 1024,
  // 占位, 实际 BashTool ctor 拿到 sandboxRoot 为空字符串时 throw
  sandboxRoot: '',
};
