# D-12 Plan: Docker Sandbox for BashTool

> Sprint 1c-revive-3-D-12 — 给 BashTool 接入 Docker sandbox，默认仍兼容现有本地执行路径，可通过配置/选项启用 Docker 隔离。

## 1. Scope

**In scope** (4 commits):
- 新增 `SandboxRunner` interface（命令/参数/cwd/env/timeout → 执行 → 返回 result）
- `LocalSandboxRunner`：包当前 `BashTool.execute()` 的本地 exec 行为（factored out）
- `DockerSandboxRunner`：`docker run --rm` + 数组 args，**禁止 privileged**，workspace 显式 mount，无网络默认
- `BashTool` 接受 `sandbox?: SandboxRunner` 构造参数（默认 = LocalSandboxRunner）
- 配置入口：`DEEPWHALE_SANDBOX=docker|local` env（resolveSandboxFromEnv helper），**仅实验**
- Docker integration test gate：`DOCKER_INTEGRATION=1` + `docker` 可用
- README 写清楚 MVP 边界 + local vs docker 差异

**Out of scope** (后续 sprint):
- 完整 policy language / per-tool permission UI / TUI / MCP / 远程容器 / rootless 自动安装
- 改 edit_file/hashline
- 一次性把所有工具迁入 Docker（先 BashTool）

## 2. Threat Model

D-12 是 MVP，**不是完整安全审计**。文档里要写清楚。

| 威胁 | Local mode 现状 | Docker mode 修复 |
|---|---|---|
| 跳出 cwd | `pathResolve` 防 `cd ../../..` 跳出 SANDBOX_ROOT | workspace bind mount 容器看不到宿主其他路径 |
| 读 /etc/passwd 等系统文件 | ❌ 未防（execFile 跑在宿主） | ✅ 容器默认只读 fs + 不可写宿主 |
| 网络下载 + 任意执行 | `curl\|sh` 模式黑名单挡一部分 | `--network=none` 缺省下无网 |
| 提权 / 写 device | `sudo`, `dd if=`, `mkfs` 模式黑名单 | `--cap-drop=ALL` + `--security-opt=no-new-privileges` |
| privileged 容器逃逸 | N/A | **禁 `--privileged`**, `--cap-drop=ALL` |
| workspace 内破坏 | 仍可能（`rm -rf` 在 workspace 内） | 仍可能（`rm -rf` 仍挡模式黑名单 + workspace 内允许） |
| timeout 不杀进程 | 60s timeout（`execFile` 内置） | 容器 `timeout` 后 `--rm` 触发；best-effort cleanup 兜底 |
| 容器清理失败 | N/A | `docker rm -f` 兜底，cleanup 失败 stderr warn |

## 3. Architecture

```
BashTool
  ↓ uses
SandboxRunner (interface)
  ├─ LocalSandboxRunner  (default, 现有行为)
  └─ DockerSandboxRunner (opt-in, MVP)
```

**接口设计**:
```ts
interface SandboxRunRequest {
  command: string;          // 已过 allowlist
  args: readonly string[];  // 已过 dangerous pattern
  cwd: string;              // 相对 workspace 根
  env?: Readonly<Record<string, string>>;  // 已过滤 (不传 DEEPSEEK_API_KEY)
  timeoutMs: number;        // 已 clamp (上限 10 分钟)
  stdoutCapBytes: number;   // default 4KB
}

interface SandboxRunResult {
  ok: boolean;              // exitCode === 0
  exitCode: number | null;  // null = killed by signal / spawn failed
  stdoutTail: string;       // 末尾 cap bytes
  stderrTail: string;
  durationMs: number;
  signal?: 'SIGTERM' | 'SIGKILL';  // timeout/cleanup 触发
  warning?: string;         // cleanup 失败等
}

interface SandboxRunner {
  readonly kind: 'local' | 'docker';
  run(req: SandboxRunRequest): Promise<SandboxRunResult>;
  /** 干净地清理 sandbox 资源 (容器等). 不抛错, 错误进 warning. */
  cleanup?(): Promise<void>;
}
```

## 4. Docker Command Shape

`docker run --rm -i --label deepwhale.sandbox=true
  --name deepwhale-sbx-${randomSuffix}
  --user 1000:1000
  --read-only
  --cap-drop=ALL
  --security-opt=no-new-privileges
  --network=none           # 默认禁网; DEEPWHALE_DOCKER_NETWORK=bridge 显式允许
  -v ${workspaceAbs}:/workspace:rw    # 显式 workspace bind mount
  -w /workspace
  --tmpfs /tmp:size=64m
  --env-file <never>       # **绝对不挂** .env / API key
  --env DEEPWHALE_SANDBOX_RUNTIME=1
  ${DEEPWHALE_DOCKER_IMAGE:-node:22-alpine}
  ${command} ${args[@]}
  < stdin (only when input piped, v1.0 不接)
  > stdout
  2> stderr`

**安全红线**（实现 + 自查）:
- **不** 拼 shell 字符串（数组 args, `execFile('docker', [...])`）
- **不** `--privileged`
- **不** 挂宿主根 (`/` → `/`)
- **不** 传 `--env-file`, **不** 传 `DEEPSEEK_API_KEY` / `ANTHROPIC_AUTH_TOKEN` 等敏感
- `cwd` 校验仍在 BashTool 入口做（防止 mount escape）
- 容器 name 用 `randomUUID().slice(0, 8)` 避免冲突
- timeout 后 → SIGTERM (`docker stop` 5s grace) → SIGKILL (`docker kill`)

## 5. Local vs Docker 行为差异

| 维度 | Local | Docker |
|---|---|---|
| 文件系统 | 看到宿主 (限制 cwd 内) | 容器独立 fs + workspace bind mount |
| 网络 | 走宿主网络 | `--network=none` 缺省 |
| 环境变量 | `process.env` 全传 (loadProjectEnv 已注入) | **只**传非敏感白名单 + 内部标记 |
| 性能 | ~直接 exec | 容器启动 ~200-500ms 额外开销 |
| 失败模式 | execFile 错 / timeout | docker 不存在 / 镜像未拉 / container start fail |
| 隔离强度 | 弱 (进程级) | 中 (容器级, **不是** VM 级) |

## 6. Test Plan

| Test | Type | Gate | 依赖 |
|---|---|---|---|
| `sandbox/types.test.ts` → interface 形状 + default timeout/cap | unit | 总是跑 | 无 |
| `sandbox/local-runner.test.ts` → LocalSandboxRunner = 现有 BashTool 行为 | unit | 总是跑 | 无 |
| `sandbox/docker-runner.test.ts` → **mock execFile**, 断言: 数组 args / 禁 privileged / 禁宿主 mount / 禁 env-file / 容器名随机 / cleanup 失败进 warning | unit | 总是跑 | mock child_process |
| `sandbox/docker-runner.test.ts` → timeout 触发 kill | unit | 总是跑 | mock |
| `tools/bash.test.ts` 新增 → BashTool 接受 runner 注入, 默认 = LocalSandboxRunner | unit | 总是跑 | 无 |
| `tools/bash.test.ts` 新增 → 显式传 mock runner 时不调真实 execFile | unit | 总是跑 | mock |
| `integration/docker-sandbox.test.ts` → 跑 `node:22-alpine echo hello` 端到端 | integration | `DOCKER_INTEGRATION=1` + `command -v docker` | 真 docker |

**Mock 策略**:
- `child_process.execFile` mock（vi.mock）→ 拦截 docker run 调用
- 断言：传 `['docker', 'run', '--rm', ...]` 给 execFile，**不会** 拼字符串
- 容器名 suffix: `${randomUUID().slice(0, 8)}` —— mock 时 stub `randomUUID`

## 7. Commit Sequence

| # | 内容 | 预估 LOC |
|---|---|---|
| 1 | sandbox interface + LocalSandboxRunner + types test + local-runner test | ~150 |
| 2 | DockerSandboxRunner + docker command builder + docker-runner test (mock) | ~250 |
| 3 | BashTool 接入 runner + 注入测试 + 现有 6 tools 全绿 | ~80 |
| 4 | Docker integration gate + README docs + 收尾 | ~80 |

## 8. 验收清单

- `corepack pnpm lint` clean
- `corepack pnpm typecheck` clean
- `corepack pnpm test` 331+ passed（持平或 +N）
- 集成测默认 SKIPPED（DOCKER_INTEGRATION 未设）
- 自我 review grep:
  - `grep -rn '\-\-privileged' packages/coding-agent/src/sandbox/ → 0`
  - `grep -rn 'shell: true' packages/coding-agent/src/sandbox/ → 0`
  - `grep -rn 'docker run' packages/coding-agent/src/sandbox/ → 0`（只用数组 args）
  - `grep -rn 'DEEPSEEK_API_KEY' packages/coding-agent/src/sandbox/ → 0`
  - `grep -rn '.env' packages/coding-agent/src/sandbox/ → 0`（除注释）
- 推送后 main 头是 D-12 commit
- 工作树干净

## 9. 已知风险 / 边界

1. **本机无 Docker** — DOCKER_INTEGRATION=1 时 SKIPPED，不会假绿
2. **container 启动开销** — 不适合 hot loop（数十次/秒），README 标注
3. **workspace mount 是 rw** — 与 Sprint 0.2 行为一致，未来可分 read-only mounts
4. **没有 seccomp profile** — 容器级隔离 (Docker default)，**不**等于完整 sandbox (gVisor/firecracker)
5. **mount escape** — BashTool 入口已校验 cwd 不出 SANDBOX_ROOT，但 Docker mount 内 `/workspace` 仍可被 `rm -rf /workspace`（容器视角）破坏 —— 仍靠 allowlist + dangerous pattern 兜底
6. **跨平台** — Docker Desktop on Windows/Mac 用 VM，不在 D-12 验证范围；Linux 本机是真容器
7. **cleanup 失败** — best-effort `docker rm -f` 兜底，stderr 警告
