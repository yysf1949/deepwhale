# 🐋 deepwhale

> **DeepSeek-first 开源 Claude Code 替代品 → Codex Clone → Agent OS**

[![Status](https://img.shields.io/badge/status-Phase%201-yellow)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-green)]()

## 一句话定位

**deepwhale v1.0 = Claude Code 的 DeepSeek-first 开源替代品**（单 Agent + Linear Session + Docker 沙箱）

**路线锚**：

| 版本     | 时长    | 目标                          | 关键能力                                                                            |
| -------- | ------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| **v1.0** | 3 个月  | Claude Code Lite              | CLI + TUI + 6 工具 + Linear Session + **Prefix-cache 4 大机制** + Docker 沙箱       |
| **v1.5** | +2 个月 | Codex Clone（**14/14 复刻**） | Approval + Task + Skills + Extension API + Hooks + StormBreaker + Cron + Compaction |
| **v2.0** | +2 个月 | +Browser Agent                | MCP + Browser Runtime + Session DAG + Memory 三层                                   |
| **v3.0** | +3 个月 | +Computer Use                 | Computer Runtime + Compaction 钩子化                                                |
| **v4.0** | +3 个月 | Agent OS                      | Multi-Agent + Plugin Marketplace + Desktop + Channels                               |

**核心交付节奏**：13 个月 5 阶段，单人开发，完成概率预估 70%（vs 初版 10 周 90% 失败概率）。

## 为什么需要 deepwhale

| 现状                                 | 痛点              | deepwhale 解决                                             |
| ------------------------------------ | ----------------- | ---------------------------------------------------------- |
| OpenAI Codex CLI 绑定 GPT 模型       | DeepSeek 用户难用 | ✅ **DeepSeek-first**（V4-Flash 默认，V4-Pro `/pro` 升级） |
| Claude Code 闭源、模型绑定 Anthropic | 不可定制          | ✅ MIT 开源，DeepSeek 优先（v1.0 单模型）                  |
| CodeWhale 偏 Rust 极客，无扩展平台   | 难以二次开发      | ✅ **v1.5 起 Extension API**                               |
| Reasonix Go 栈入门门槛高             | 社区贡献难        | ✅ **TypeScript 栈**（借鉴 Reasonix 机制，**不抄 Go 栈**） |
| Hermes 多渠道但不是 coding agent     | 渠道割裂          | ✅ **v1-v3 不做渠道，v4.0 重新评估**                       |
| Codex Client 不支持多模型            | 锁定 OpenAI       | ✅ **v1.0 = DeepSeek only，v1.5 起支持 4 家**              |

## 核心特性（v1.0 目标）

- 🐋 **DeepSeek 优先**：V4-Flash 默认（prefix-cache 99% 命中，单 turn $0.05 以内），V4-Pro `/pro` 升级
- ⚡ **Prefix-cache 4 大机制**（Reasonix 全抄，**v1.0 必带，deepwhale 核心优势**）：
  - System prompt 一次组装
  - `content: ""` 永序列化
  - Reasoning content 不打 wire
  - Schema canonicalize
- 🛡 **Docker 沙箱统一**（v1.0 起，**不抄 Seatbelt/Landlock/Windows Job Object**）：
  - 白名单 shell 走 Docker
  - 默认镜像 `node:22-alpine`
  - 网络默认禁用
- 📜 **Linear Session**（v1.0 = 简单 Linear，**DAG 砍掉，v2.0 升级**）
- 🔌 **Extension API**（**v1.5 起**）：21 个 `whale.*` 事件 + `defineTool` 零运行时
- 🧠 **多模型切换**（v1.0 = DeepSeek only；v1.5 = +OpenAI/Claude/Gemini/自定义）
- 🌐 **MCP**（v2.0 起）
- 🖥 **Tauri 桌面**（**v4.0 起**，v1-v3 不做）

## 快速开始（开发版，预览）

```bash
git clone https://github.com/yysf1949/deepwhale.git
cd deepwhale
pnpm install
echo "DEEPSEEK_API_KEY=***" > .env
pnpm dev
```

## 测试

### 单测（默认）

```bash
corepack pnpm build && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

纯 mock / 离线，**不会**调真实 LLM API。CI 必跑, 测试数以 `pnpm test` 当前输出为准 (持续漂移, 硬编码会过期).

### Integration tests（真接 DeepSeek + Anthropic shim）

> **Sprint 1b.5 Step 3**（2026-06-04）：X3 mock-only 风险（`1b5-s2.5` meta-rule "test passed ≠ production works"）要求真接验证 `cache_hit_rate` / `cost_turn` / `compaction` / `tool loop` 在真实响应上对得上。

**配置**（Sprint 1c-revive-2-D-7 起，2026-06-04）：

项目根 `.env` 文件**自动加载**（loader 见 [`packages/coding-agent/src/env/load-project-env.ts`](./packages/coding-agent/src/env/load-project-env.ts)）—— vitest 启动时调一次 `loadProjectEnv()`，CLI 入口 `bin/deepwhale.js` 同样。**只补缺不覆盖**（`process.env[key] ??= value`），所以 shell `export VAR=...` / CI 显式 set / PowerShell `$env:VAR=...` 永远最高优先。

```bash
# 1. 复制模板 (`.env.example` 是可进 commit 的模板; `.env` 在 .gitignore 里)
cp .env.example .env
chmod 600 .env

# 2. 填 key (`.env` 永**不**进 commit; 仓库里 `.env.example` 可进 commit)
#    .env 可**任一**填 (Sprint 1c-revive-2-D-9 改, 2026-06-04): 走 helper `hasUsableApiKey()`
#    自动过滤占位符 + 区分 provider, DeepSeek 和 Anthropic 子测按 key 分别 skip
#      DEEPSEEK_API_KEY=sk-xxx      # DeepSeek OAI shim (任一即可)
#      ANTHROPIC_AUTH_TOKEN=sk-ant  # Anthropic shim (任一即可)
#      INTEGRATION=1                # 显式开启真接 (默认 0 / skip)

# 3. 跑 integration (默认 skip; INTEGRATION=1 才真接)
corepack pnpm test
```

**Skip 行为**：

- `INTEGRATION !== 1` → 整个 integration test 文件 `it.skip`（**不**fail）
- `process.env.DEEPSEEK_API_KEY` / `process.env.ANTHROPIC_AUTH_TOKEN` 未设 → 对应 `it.skip`（Vitest 报 SKIPPED 计数）
- 没设 key 不会打印 fake-pass 假绿 —— F1 拍板 (D-8, 2026-06-04)

**红线**（X1 b + X4 c + D-8 拍板，2026-06-04）：

1. **test 代码不直接读 `.env` 文件** — 走 `loadProjectEnv()` → `process.env` 流动, test 只看 `process.env`
2. **test 不接受 `apiKey` 选项** — 只能通过 `process.env['DEEPSEEK_API_KEY' | 'ANTHROPIC_AUTH_TOKEN']`
3. **test 任何断言 / log 不含 key 字符串** — 防 `console.log(result)` 误打
4. **文件权限** — `.env` 必须是 `mode 600`（用户责任）
5. **真接最小化** — 单测 < ¥0.001 / turn (deepseek-v4-flash)；多 turn 测单次封顶 300s timeout

**当前覆盖**（D-8 2026-06-04 拍板）：

- `packages/llm/test/integration/deepseek-shim.test.ts` — DeepSeek V4 flash 1 turn 流式真接
- `packages/coding-agent/test/integration/*.test.ts` — 8 个跨协议 / 错误恢复 / 8-turn compaction / tool loop 真接

**未覆盖**（留 Step 3.5+）：

- `cache_hit_rate > 0`（需要多 turn / 重复 prompt 触发 prefix cache；8-turn 测已部分覆盖）
- Anthropic 原生直连（非 shim）— 等 1b.5 Step 4 启动
- v1.5 tool loop live 验收

### Verify（项目本地验证，不走 LLM）

> **Sprint 1c-revive-2-D-11**（2026-06-04）：`deepwhale --verify` 跟 REPL `/verify` 走同一 `runVerify()` —— 跑 4 步真验证（`corepack pnpm build` / `lint` / `typecheck` / `test`），**不走 LLM**、**不走 tool loop**、**不依赖 key**。生成 `VerificationReport` 摘要 + 退出码（0=pass / 1=fail）。

**CLI 用法**（CI 友好）：

```bash
deepwhale --verify            # 跑 4 步默认, 退出码 0=pass / 1=fail
if deepwhale --verify; then
  echo "all green, ready to commit"
else
  echo "fix failing check, see stderr tail above"
fi
```

**REPL 用法**（交互式）：

```bash
deepwhale                            # 启 REPL
deepwhale> /verify                  # 跑 4 步验证, 印 formatReport 到 stdout
                                     # 写 'verification' event 到 session JSONL (audit 轨迹)
deepwhale> /help                    # 看其它内建命令
deepwhale> /exit                    # 退
```

**VerificationReport schema**（`packages/coding-agent/src/verify/verify-runner.ts`）：

```ts
{
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  durationMs: number;
  overallStatus: 'passed' | 'failed';
  checks: ReadonlyArray<{
    name: string; // 'build' / 'lint' / 'typecheck' / 'test'
    command: string; // 人类可读 (e.g. "corepack pnpm build")
    status: 'passed' | 'failed' | 'timed-out' | 'spawn-error' | 'aborted';
    exitCode: number | null;
    startedAt: number;
    endedAt: number;
    durationMs: number;
    stdoutTail: string; // 截断 4 KB 尾, 防 session JSONL 撑爆
    stderrTail: string; // 截断 4 KB 尾
    errorMessage?: string; // timeout / spawn 错
  }>;
  summary: string; // "N/N checks passed" (formatter 拍)
  nextSuggestedAction: string; // "fix failing check: lint" 等
}
```

**拍板**（D-11 review, 2026-06-04）：

- **fail-fast**：任一 step 失败立即 break, 后续 step 不跑 (build fail 时 typecheck/test 必挂, 显式 fail-fast 比假绿诚实)
- **stdout/stderr 截断 4 KB 尾**（[D-11 review 必做红线]）
- **不写 .env，不动 LLM，不调 tool loop**——本地真 CLI 验证
- **CLI 不写 session event**（verify 不是 chat 行为, session JSONL 是 chat 持久化），**REPL 写 verification event**（用户在 REPL 跑了 verify, session 走 audit 轨迹, 跟 CLI 形成差异）

**Verification session event**（`packages/core/src/session/jsonl.ts` 'verification' kind, D-11-3 加）：

```ts
{ kind: 'verification'; ts: number; status: 'passed'|'failed';
  durationMs: number; command_count: number; failed_count: number;
  summary: string; meta?: Record<string, unknown>; }
```

跟 `compaction_paused` 同语义：metadata, reload session 时 `sessionEventsToMessages` 跳过, 不污染 LLM 看到的 messages。**旧 session reload 不崩**（strict union 兜底, D-11-3 拍板红线）。

## Sandbox (D-12, MVP)

> **Sprint 1c-revive-3-D-12**（2026-06-05）：BashTool 接入 Docker sandbox。默认仍走本地 exec，可通过 `DEEPWHALE_SANDBOX=docker` 切换到 Docker 隔离。**MVP，**不**等于完整安全审计**（看下面威胁模型 + 已知风险）。

### 快速启用

```bash
# 默认 (本地 exec, 现状行为)
pnpm dev

# 切到 Docker 隔离
DEEPWHALE_SANDBOX=docker pnpm dev

# 自定义镜像 + 允许网络
DEEPWHALE_SANDBOX=docker \
  DEEPWHALE_DOCKER_IMAGE=alpine:3.20 \
  DEEPWHALE_DOCKER_NETWORK=bridge \
  pnpm dev
```

| Env                        | 缺省             | 说明                                                          |
| -------------------------- | ---------------- | ------------------------------------------------------------- |
| `DEEPWHALE_SANDBOX`        | `local`          | `local` = 进程级本地 exec（v1.0 行为）；`docker` = 容器级隔离 |
| `DEEPWHALE_DOCKER_IMAGE`   | `node:22-alpine` | 容器镜像                                                      |
| `DEEPWHALE_DOCKER_NETWORK` | `none`           | `none` = 禁网（推荐 MVP）；`bridge` = 走 docker 默认 bridge   |

### 架构

```
BashTool (allowlist + dangerous pattern + cwd 校验)
  ↓
SandboxRunner (interface)
  ├─ LocalSandboxRunner  (默认, 现状 execFile 行为)
  └─ DockerSandboxRunner (opt-in, docker run --rm 隔离)
```

`BashTool` 入口的 allowlist / dangerous pattern / cwd 校验**不**依赖 runner —— runner 只跑过白名单的命令。两者解耦，**默认行为不变**（20 个 `tools.test.ts` 全过）。

### Local vs Docker 行为差异

| 维度     | Local (默认)            | Docker (opt-in)                                                                                                                                                                                                            |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件系统 | 看到宿主（限制 cwd 内） | 容器独立 fs + workspace bind mount                                                                                                                                                                                         |
| 网络     | 走宿主网络              | `--network=none` 缺省下无网                                                                                                                                                                                                |
| 环境变量 | `process.env` 全传      | 白名单 7 个 key（`PATH`/`HOME`/`USERPROFILE`/`DOCKER_HOST`/`DOCKER_CONFIG`/`DOCKER_TLS_VERIFY`/`DOCKER_TLS_CERTPATH`），显式剔除 `DEEPSEEK_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `DEEPWHALE_SESSION_KEY`（D-12 review 红线） |
| 性能     | ~直接 exec              | 容器启动 ~200-500ms 额外开销                                                                                                                                                                                               |
| 隔离强度 | 弱（进程级）            | 中（容器级，**不是** VM 级）                                                                                                                                                                                               |
| 失败模式 | execFile 错 / timeout   | docker 不存在 / 镜像未拉 / container start fail                                                                                                                                                                            |

### Docker command shape

```bash
docker run --rm \
  --label deepwhale.sandbox=true \
  --name deepwhale-sbx-${randomUUID8} \
  --user 1000:1000 \
  --read-only \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  --network none \
  -v ${workspaceAbs}:/workspace:rw \
  -w /workspace \
  --tmpfs /tmp:size=64m,noexec,nosuid \
  node:22-alpine \
  ${command} ${args[@]}
```

**安全红线**（grep 自查覆盖）：

- **不** 加 `--privileged`
- **不** 传 `--env-file` / `DEEPSEEK_API_KEY` / `ANTHROPIC_AUTH_TOKEN`
- **不** 挂宿主根目录（`--volume /:/host` 之类）
- 容器名加 `randomUUID().slice(0, 8)` 后缀避免冲突
- timeout 走 `docker stop` (5s grace) → `docker kill` (SIGKILL) 兜底
- cleanup 失败进 `console.warn`，不静默假成功

### 威胁模型

D-12 是 MVP，**不**是完整 sandbox：

| 威胁                        | Local 现状                     | Docker 修复                                               |
| --------------------------- | ------------------------------ | --------------------------------------------------------- |
| 跳出 cwd                    | `pathResolve` 防 `cd ../../..` | workspace bind mount + DockerRunner 入口 sandboxRoot 校验 |
| 读 `/etc/passwd` 等系统文件 | ❌ 未防                        | ✅ 容器默认只读 fs                                        |
| 网络下载 + 任意执行         | `curl\|sh` 模式黑名单挡一部分  | `--network=none` 缺省下无网                               |
| 提权 / 写 device            | `sudo` / `dd if=` 模式黑名单   | `--cap-drop=ALL` + `no-new-privileges`                    |
| privileged 容器逃逸         | N/A                            | **禁** `--privileged`                                     |
| workspace 内破坏            | 仍可能                         | 仍可能（靠 allowlist + dangerous pattern 兜底）           |
| timeout 不杀进程            | 60s timeout（`execFile` 内置） | 容器 `timeout` 后 `--rm` 触发；cleanup 兜底               |

### 已知风险 / 边界

1. **本机无 Docker** — `DOCKER_INTEGRATION=1` 时 `integration/docker-sandbox.test.ts` SKIPPED，**不**假绿
2. **容器启动开销** — 不适合 hot loop（数十次/秒），README 标注
3. **workspace mount 是 rw** — 与 Sprint 0.2 行为一致，未来可分 read-only mounts
4. **没有 seccomp profile** — 容器级隔离（Docker default），**不**等于完整 sandbox（gVisor/firecracker）
5. **mount escape** — BashTool 入口已校验 cwd 不出 `SANDBOX_ROOT`，但 Docker mount 内 `/workspace` 仍可被 `rm -rf /workspace`（容器视角）破坏 —— 靠 allowlist + dangerous pattern 兜底
6. **跨平台** — Linux 本机是真容器；Docker Desktop on Windows/Mac 用 VM，**不**在 D-12 验证范围
7. **cleanup 失败** — best-effort `docker rm -f` 兜底，stderr 警告

### 测试

```bash
# 单测 (默认, mock docker 不依赖本机 docker)
pnpm test

# Integration (真 docker, 默认 SKIPPED)
DOCKER_INTEGRATION=1 pnpm test -- docker-sandbox
```

单测覆盖：

- `sandbox/types.test.ts` — interface 形状 + default timeout/cap
- `sandbox/local-runner.test.ts` — 真跑 `node -e` 验证 stdout/stderr/cap/timeout/env
- `sandbox/docker-runner.test.ts` — mock `child_process`，断言禁 privileged / 禁宿主 mount / 禁 env-file / 容器名随机 / cleanup 失败进 warning
- `sandbox/bash-injection.test.ts` — BashTool 接受 runner 注入，默认 Local，注入 mock 不调真 exec
- `sandbox/env-gate.test.ts` — `resolveSandboxRunnerFromEnv` env 解析

### MVP 边界（不是）

- **不** 做完整 policy language（Sprint D-15）
- **不** 做 per-tool permission UI
- **不** 做 TUI / MCP / 远程容器
- **不** 做 rootless Docker 自动安装
- **不** 改 edit_file/hashline
- **不** 一次性把所有工具迁入 Docker（先 BashTool）

## Permission / Policy (D-13, MVP)

> **Sprint 1c-revive-3-D-13**（2026-06-05）：默认静态规则 + 可注入 `ToolPolicy`。
> bash/write/edit 在 destructive 路径上 require_confirmation;非交互模式默认 deny;
> `--yes` 只 bypass `require_confirmation`,不 bypass `deny`;session 记录 `policy_decision`（只
> deny/require_confirmation/user_approved/user_denied 写,`allow` 不写避免 JSONL 刷爆）。

### 3 mode × isInteractive × bypass 矩阵

> **Sprint 1c-revive-3-D-13 review P2 修复 (2026-06-05)**: 拍板 (用户 review) "REPL 现状是
> isInteractive=true **但** 静态 tool-loop 走 no confirm impl deny, 跟 print/rpc 行为几乎
> 相同. 文档必须拍准."

| 模式           | isInteractive | write/edit 默认                        | 危险 bash 默认       | --yes 加 yes    | confirm 实现                                                   |
| -------------- | ------------- | -------------------------------------- | -------------------- | --------------- | -------------------------------------------------------------- |
| REPL (default) | `true`        | **fail-closed deny** (无 confirm impl) | **fail-closed deny** | bypass → 真执行 | **D-15 拍板**（现状: readline prompt 留 D-15, MVP 用 `--yes`） |
| print (`-p`)   | `false`       | deny（**非交互默认 deny**）            | deny                 | bypass → 真执行 | D-15 协议扩                                                    |
| rpc (`--rpc`)  | `false`       | deny（D-15 扩 confirmedTools 协议）    | deny                 | bypass → 真执行 | D-15 协议扩                                                    |

**P2 修复后的拍板**:

- REPL **现状** (D-13 ship 时): `isInteractive=true` 但 `staticToolPolicy.confirm = undefined` → 走
  `no confirm impl` 分支 → fail-closed deny (跟 print/rpc 一致). **不是** y/N prompt 拍板.
- REPL **bypass**: 加 `--yes` (启动时) → `ctx.yes=true` → `require_confirmation` bypassed →
  落 `user_approved` 审计 → 工具真执行.
- REPL **未来** (D-15): 注入 `staticToolPolicy.confirm = readlinePrompt` 实现, 那时
  `isInteractive=true` 才有意义. **D-13 MVP 不实现, 拍板红线就是 fail-closed 不让破坏**.

⚠️ **REPL 现状 D-13 = fail-closed deny** (跟 print/rpc 一致). 如果你需要"REPL y/N 拍板"
行为, 当前 ship 版本下请用 `--yes` (D-13 拍板) 或等 D-15 拍板.

### `--yes` 标志

`deepwhale -p ... --yes` / `deepwhale --rpc --yes` / REPL 启动时 `--yes`:

- ✅ **bypass** `require_confirmation`（写文件/edit/危险 bash 自动 allow）
- ❌ **不** bypass `deny`（拍板红线, audit 不能被 yes 抹平）
- session 每次 `policy_decision` 事件都落 (除 `allow` 外)
- **拍板红线 (D-13 P1(b) 修复 2026-06-05)**: 每次 `--yes` bypass 都落 `user_approved` 事件
  (含 `meta.bypassedByYes: true`). audit 链不能被 yes 抹平. **拍板 (用户 review)**:
  "保持 PolicyDecision 简洁, 在 tool-loop.ts 里保留 raw decision, chain 不做 yes bypass".

### 默认静态规则 (src/policy/static-rules.ts)

| 工具                          | 决策                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `read_file` / `find` / `grep` | `allow`                                                                                                          |
| `write_file` / `edit_file`    | `require_confirmation` (`writes to filesystem`)                                                                  |
| `bash` (工具层静态)           | `allow`（bash 工具层用 allowlist + dangerous pattern 双重防御; 第二道防线是 tool-loop 调 `evaluateBashCommand`） |
| bash 危险模式                 | `require_confirmation` (D-13 review P1 拍板 2026-06-05, 12 pattern 详见 `src/policy/static-rules.ts`: `rm -rf /` / `rm -rf ~` / `mv *` / `cp *` / `chown` / `chmod` / `mkfs` / `dd if=` / `shutdown`+`reboot`+`halt`+`poweroff` / `> /dev/sda\|nvme*` / `curl\|sh\|bash\|python` / `curl -o /tmp/`) |

### 注入自定义 ToolPolicy

```ts
import { createDefaultRegistry, type ToolPolicy } from '@deepwhale/coding-agent';

const myPolicy: ToolPolicy = {
  evaluate(toolCall, ctx) {
    if (toolCall.name === 'bash' && /prod-db/.test(String(toolCall.argsDigest))) {
      return { decision: 'deny', reason: 'prod-db hash detected' };
    }
    return { decision: 'allow' };
  },
};

const registry = createDefaultRegistry({ sandboxRunner });
await runToolLoop(client, messages, {
  registry,
  policy: myPolicy,
  isInteractive: false,
  yes: false,
  writer, // 可选, 落 policy_decision 到 session
});
```

### SessionEvent policy_decision

拍板 (用户 2026-06-05):

- `'allow'` **不** 落盘 (避免 JSONL 刷爆)
- `'deny' | 'require_confirmation' | 'user_approved' | 'user_denied'` 落 `'policy_decision'` event
- 字段: `tool_call_id` (跟后续 `tool` event 配对) + `name` + `decision` + `argsDigest` (sha256:12hex) + `reason` (sanitize 后 ≤ 200 字符, 换行折叠, 去 NUL)
- `argsDigest` 拍板: 不存原始 args, 用稳定 JSON (key 排序) + sha256 前 12 位
- 跟 `'compaction'` / `'compaction_paused'` / `'verification'` 同语义: metadata, `sessionEventsToMessages` 跳过, 不进 LLM context

```jsonl
{"kind":"assistant","ts":2,"content":"","tool_calls":[{"id":"c1","name":"write_file","args":{"path":"/etc/hosts","content":"..."}}]}
{"kind":"policy_decision","ts":3,"tool_call_id":"c1","name":"write_file","decision":"deny","argsDigest":"sha256:abcdef012345","reason":"non-interactive mode: writes to filesystem","meta":{"isInteractive":false}}
{"kind":"tool","ts":4,"tool_call_id":"c1","name":"write_file","result":{"success":false,"content":"","error":"policy_blocked: non-interactive mode: writes to filesystem"},"duration_ms":0,"meta":{"argsDigest":"sha256:abcdef012345","policy":"require_confirmation","isInteractive":false}}
```

### 验收红线 (D-13 拍板)

1. ✅ 默认情况下 agent 不能无确认执行 destructive write/bash (`policy_blocked`)
2. ✅ 非交互模式不能假装确认 (`isInteractive=false` + `require_confirmation` → `deny`)
3. ✅ `--yes` 明确可追踪 (bypass `require_confirmation` 不 bypass `deny`, session 每次 bypass 落 `user_approved` event, `meta={bypassedByYes:true, isInteractive: ctx.isInteractive}`; D-13.5 review P1 重排 2026-06-05 把 `ctx.yes` 提到最前, 优先级: `--yes` > 非交互 deny > confirm > 兜底 deny)
4. ✅ **bash 危险模式覆盖完整** (D-13 review P1 修复 2026-06-05): `rm -rf /` / `mv` 全部 / `cp` 全部 / `chown` / `chmod` / `curl|sh` / `curl -o /tmp` 等都必过 tool-loop policy 层, 不绕过
5. ✅ **REPL 现状 fail-closed** (D-13 review P2 修复 2026-06-05): `isInteractive=true` 但
   `staticToolPolicy.confirm = undefined` → 走 `no confirm impl` → deny. 跟 README/UX 契约一致
   (D-15 注入真 confirm 才允许 y/N 拍板, 当前 D-13 MVP 必须 `--yes`)

### MVP 边界（不是）

- ❌ User config file 注入 ToolPolicy (D-15)
- ❌ Per-tool 详细权限 UI (D-15)
- ❌ RPC 协议扩 `confirm` 通知 / `confirmedTools` (D-15)
- ❌ Cross-process file lock / race 真防 (D-15+ inotify)
- ❌ Secret 强检测 (redact API key in reason) (D-15)
- ❌ 路径白名单/黑名单 (D-15)
- ❌ Bash argv deep parse (e.g. shlex) (D-15)

### 单测覆盖

- `policy/types.test.ts` — PolicyDecision union + PolicyContext 形状
- `policy/static-rules.test.ts` — 6 工具名分支 + bash 危险 regex (14 it: 12 模式命中 + 安全命令 allow 等)
- `policy/chain.test.ts` — chain 透传 raw decision (不做 yes bypass, P1 b 修复后 bypass 移到 tool-loop.ts) + deny 永远透传 (5 tests)
- `policy/args-digest.test.ts` — 稳定 JSON (key 排序) + sha256 12 hex + secret 不暴露 (7 tests)
- `policy/sanitize-reason.test.ts` — 长度 200 cap + 换行折叠 + NUL 去 (8 tests)
- `core/test/session/policy-decision.test.ts` — round-trip + 不进 LLM context + 旧 session reload 不崩 (4 tests)
- `integration/tool-loop-policy.test.ts` — 端到端 13 例覆盖验收红线 (D-13 11 例 + D-13.5 重排补 2 例: print/rpc + --yes 走 ctx.yes first 行为差异真证据)

## 4 包 Monorepo 结构（对齐 pi）

```
deepwhale/
├── packages/
│   ├── llm/           # @deepwhale/llm    — DeepSeek 客户端（v1.0 only） + Prefix-cache 4 大机制
│   ├── agent-core/    # @deepwhale/agent  — EventBus + Tool Registry + Docker 沙箱桥 + StormBreaker（v1.5）
│   ├── tui/           # @deepwhale/tui    — Ink 渲染层
│   └── coding-agent/  # @deepwhale/cli    — 产品层 = llm + agent-core + tui
└── docs/
    ├── ARCHITECTURE.md   # 4 层架构 + 5 阶段版本锚
    └── research/         # 5 份深度调研报告
```

## 路线图

详见 [ROADMAP.md](./ROADMAP.md) —— **5 阶段版本锚（13 个月，单人开发）**，关键决策：

- **v1.0 = Claude Code Lite**（3 个月，6 工具 + Linear Session + Docker 沙箱 + Prefix-cache 4 机制）
- **v1.5 = Codex Clone 14/14**（+2 个月，Skills / Extension / Hooks / Approval / Task / Automations / Compaction）
- **v2.0 = +Browser Agent**（+2 个月，MCP / Browser / DAG / Memory）
- **v3.0 = +Computer Use**（+3 个月，Computer Runtime）
- **v4.0 = Agent OS**（+3 个月，Multi-Agent / Desktop / Channels）

**已砍掉（延后到 vN）**：

- ❌ 飞书 / Telegram / Discord / 邮件 / 微信 渠道（**v4.0 重新评估**）
- ❌ macOS Seatbelt / Linux Landlock / Windows Job Object 沙箱（**v1-v4 统一 Docker**）
- ❌ Session DAG（**v1 = Linear，v2.0 升级**）
- ❌ Constitution 9 层权威（**永远不做**）
- ❌ Desktop / Web UI（**v4.0 起**）
- ❌ Plugin Marketplace / 文档站（**v1.5 / v4.0 起**）

详细砍掉清单见 [ARCHITECTURE.md §4](./docs/ARCHITECTURE.md)。

## 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer（v1.0 = CLI + TUI；v4.0 = +Desktop）                │
│  CLI │ TUI (Ink) │ Desktop (Tauri, v4.0) │ Web (v4.0)        │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Agent Layer（v1.0 = 单 Executor + ToolRouter + Session）    │
│  v1.0: Executor │ ToolRouter │ SessionManager (Linear)       │
│  v1.5: + Planner │ MemoryManager                             │
│  v4.0: + Researcher │ Reviewer（完整 Multi-Agent）           │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Runtime Layer                                                 │
│  v1.0: Tool Runtime │ Docker Sandbox                          │
│  v1.5: + Plugin Runtime (.dwp)                                │
│  v2.0: + MCP Runtime │ Browser Runtime                        │
│  v3.0: + Computer Runtime                                     │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  LLM Layer                                                     │
│  v1.0: DeepSeek V4-Flash/Pro only                             │
│  v1.5: + OpenAI/Claude/Gemini/自定义                          │
│  Prefix-cache 4 大机制 │ StormBreaker (v1.5) │ Sanitize (v1.5)│
└──────────────────────────────────────────────────────────────┘
```

## 技术栈

- **主语言**：TypeScript（strict）+ Node ≥ 22
- **包管理**：pnpm workspace + Turborepo
- **TUI**：Ink（React 19 终端渲染，pi 验证 58.6k stars）
- **沙箱**：**Docker only**（v1.0-v4.0 统一，**不抄 Seatbelt/Landlock/Windows Job Object**）
- **MCP**（v2.0）：`@modelcontextprotocol/sdk` 官方
- **Skills 格式**（v1.5）：对齐 [Codex Agent Skills 开放标准](https://developers.openai.com/codex/skills)
- **配置**：TOML（`~/.deepwhale/config.toml`）

## 致谢 / 灵感来源（基于 5 份深度调研）

deepwhale 站在以下开源项目肩膀上，每条都标注**真实代码出处**：

### 🐹 [earendil-works/pi](https://github.com/earendil-works/pi)（v0.78，58.6k stars，TypeScript 4 包）

- **4 包 monorepo 分层** — **对齐**（出处：`packages/{pi-ai, pi-agent-core, pi-tui, pi-coding-agent}/`）
- **EventBus 包装**（30 行 try/catch 隔离）— 抄（v1.5 起）
- **defineTool 零运行时**（5 行类型守卫）— 抄（v1.5）
- **21 个 ExtensionEvent** — 改前缀 `whale.*`（v1.5）
- **4 种运行模式**（interactive / print / rpc / sdk）— 抄（v1.0）
- **PackageManager `whale:` 前缀解析** — 抄（v1.5）
- **JSONL append-only Session** — 抄（v1.0 Linear，**DAG 砍掉**）

### 🐹 [esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)（1.0+ Go 重写，6000+ stars）

> ⚠️ Reasonix 1.0+ 是 **Go + Bubbletea + Wails**，**不是 Node + Ink + Tauri**。deepwhale **不抄 Go 栈**，只抄机制。

- **Prefix-cache 4 大机制** — **全抄**（v1.0 必带，deepwhale 核心优势）
  - 出处：`boot.go:120-148` + `openai.go:354-368` + `openai.go:131-137` + `schema_canonicalize.go:10-67`
- **Compaction = 唯一 cache-reset point** — 抄（v1.5）
- **StormBreaker 防死循环** — **全抄**（v1.5，工具增多后 P0）
- **SanitizeToolPairing（4 种 pairing cases）** — 抄 1 个函数，理解 4 cases（v1.5）
- **Skills 4 约定目录** — 抄（v1.5）
- **Hook 语义**（exit 0=pass, exit 2=block, other=warn）— 抄（v1.5）
- **Skills 索引 4KB 硬上限** — 抄（v1.5）

### 📜 [OpenAI Codex CLI](https://github.com/openai/codex) — v1.5 起 100% 复刻（14/14）

- Skills / Approval / Task / Browser / Computer Use / Automations / 14 项全功能（v1.5-v4.0 分阶段交付）

### 🦮 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（v2026.5.7-476，本地开发版）

- **Plugins 机制** — 跟 Extension 互补（v1.5）
- **Memory 三层分层**（v2.0 起）
- **Event Bus**（v1.5）
- **Hermes 踩坑经验**（避免重蹈）：
  - **i18n 路径第一行定对**（`from agent.i18n import t`，Sprint 0 已应用）
  - **hot-reload mtime 检测必须在 wrapper 内部**
  - **飞书 markdown 强制走 post payload**（v4.0 起需要时）
  - **footer 数字收敛时去冗余/加标签区分**
- **不吸收**：多渠道（v1-v3 砍掉，v4.0 重新评估）

### 🦀 [Hmbown/CodeWhale](https://github.com/Hmbown/CodeWhale)（v0.8.50，17 crates，Rust）

- **借鉴教训**（**不抄实现**）：
  - Constitution 9 层权威——**永远不做**（个人化产物）
  - Windows 沙箱 Job Object 假撑——**明确不假撑**（v1-v4 走 Docker）
  - Landlock "marker-only"——**明确不做**（v1-v4 走 Docker）
- **可借鉴**：白名单 shell 思路（v1.0 = 借鉴思路，**实现走 Docker**）

## 贡献

项目处于早期 MVP 阶段（**Phase 1 Sprint 0**），**欢迎任何形式的参与**：提 issue、PR、写 skill / extension、文档改进。

详见 [ROADMAP.md](./ROADMAP.md) 当前 Sprint 0 任务清单。

## License

[MIT](./LICENSE)
