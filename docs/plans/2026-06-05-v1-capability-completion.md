# v1.0 Capability Completion Plan

**Sprint**: 1c-revive-4 (2026-06-05) — v1.0 capability completion
**Branch**: `feature/d19.5-repl-guard-cleanup` (D-19.6.1 docs cleanup 第二轮已 ship)
**Baseline**: `64b9296` (D-19.6 baseline 数字修正), 495 passed / 20 skipped (515 test)
**Goal**: 把 v1.0 必须具备的关键能力从"代码散在多文件 + 文档/测试 散点"提升到"用户路径打通 + 4 大机制有统一文档 + TUI v1 minimal 可用".

## 背景

D-13 (tool policy MVP) / D-15 (REPL y/N confirm) / D-19.5/6/6.1 (REPL guard cleanup) / D-12 (sandbox) 都已 ship, 但**v1.0 必须能力**还有 4 项缺口:

1. **TUI 完全缺失** — `packages/coding-agent/src/tui/` 目录不存在, 只有 CLI 4 mode (interactive/print/rpc/verify)
2. **Prefix-cache 4 大机制没有统一文档** — `cache_hit_rate` / canonical schema / cost 算式 / compaction 保 prefix 散在 5 个文件, 没"v1.0 Prefix-cache 4 机制"总集
3. **`cache_hit_rate` 没序列化到 session** — D-6 compaction 持久化 改了 replaced_range, 但 cache 命中率观测不到
4. **Docker sandbox 缺 resource limit** — `--pids-limit / --memory / --cpus` 没加, DDoS 防护弱

不修这 4 项, v1.0 release checklist 不能 close.

## 范围 (v1.0 must-have checklist)

### A. CLI 入口 (4 mode + 透传)
- ✅ `deepwhale` 默认 REPL 启动
- ✅ `deepwhale -p "<prompt>"` print mode
- ✅ `deepwhale --rpc` RPC mode
- ✅ `deepwhale --verify` verify mode (不依赖 key)
- ✅ `--provider` (deepseek | anthropic) 校验 + 透传
- ✅ `--model <id>` 透传
- ✅ `--yes` bypass require_confirmation, 不 bypass deny
- ✅ `--session <path>` JSONL 持久化
- ✅ `--max-steps <n>` 工具循环上限 (默认 5)
- ✅ `--no-tool-loop` 退化到单轮
- ✅ 退出码: passed=0 / failed=1 / 参数错=2 / FATAL=1
- ✅ `--help / --version` 友好输出

### B. TUI (P0 新建, v1 minimal)
- ⚠️ **当前: 完全缺失** — P0
- 🎯 **v1 范围 (minimal, 不做 full IDE)**:
  - 输入 prompt (multiline OK)
  - 显示 assistant stream
  - 显示 tool call / result
  - destructive tool 时 y/N confirm (复用 REPL confirm 逻辑, **不**绕过 ToolPolicy / session audit)
  - exit 不损坏 session (走 D-19.5 finish() SIGINT cleanup 路径)
  - 复用 D-15 readline y/N confirm 风格 (避免重建 prompt 机制)
  - session 路径持久化 (--session 透传, 默认 ~/.deepwhale/sessions/)
- 🛑 **v1 不做** (defer to v1.1+): 主题、syntax highlight、文件树、侧边栏、鼠标支持、autocomplete

### C. 6 tools (read/write/edit/grep/find/bash)
- ✅ `read_file` (1 happy path 测)
- ✅ `write_file` (D-19.6.1 Q4 强断言, 走 policy)
- ✅ `edit_file` (走 EditEngine, 走 policy)
- ✅ `grep` (本地 exec, 走 policy if 危险)
- ✅ `find` (本地 exec, 走 policy if 危险)
- ✅ `bash` (allowlist + dangerous pattern + sandbox 抽象)
- ✅ ToolPolicy chain: 透传, deny 不 bypass, --yes 仅 bypass require_confirmation
- ✅ `policy_decision` 落 session, argsDigest 不泄 raw args/API key
- ⚠️ **P1**: `find / grep` happy path 测覆盖度 spot check (D-19 加了 P1 测, 可能已经够)

### D. Linear Session
- ✅ SessionEvent union 7 kind: `user / assistant / tool / system / compaction / compaction_paused / verification / policy_decision`
- ✅ append-only 1 JSONL
- ✅ SessionReader 走 strict union, 旧 session 兼容不崩
- ✅ reload/replay 测: `session-jsonl.test.ts` + `session-adapter.test.ts`
- ✅ compaction replaced_range 跟 system prefix 解耦 (D-6 review P1)
- ✅ corrupted event 容错: `session-adapter.ts:166` start > out.length → skip
- ⚠️ **P1**: `cache_hit_rate` 没序列化到 session (缺观测)

### E. Prefix-cache 4 大机制 (P0 文档固化, P1 验证)
- ⚠️ **当前**: 4 件事在 5 个文件, **没**总集
- 🎯 **v1 范围**: 固化 4 大机制命名 + 验收标准
  1. **cache_hit_rate 字段** (types.ts:72 / parse.ts:85 / pricing-config.ts:67) — 算式 `cached_tokens / prompt_tokens`
  2. **canonical schema** (canonicalize-schema.ts) — JSON property 顺序稳定保 prefix-cache hash
  3. **cost_turn 算式** (pricing-config.ts:178) — `uncached * miss + cached * hit + completion * output` 三档
  4. **compaction 保 prefix** (session/compaction.ts) — replaced_range 不砍 prefix, 让 cache 继续命中
- 🛑 **每项必须有**: 代码入口 + 可观测输出 + ≥ 1 focused test
- ⚠️ **P1**: 缺"4 机制联动"端到端 snapshot (目前 pricing-config.test.ts 13 个测是单元)

### F. Docker Sandbox
- ✅ `DEEPWHALE_SANDBOX=docker` → DockerSandboxRunner
- ✅ `DEEPWHALE_SANDBOX=local` / unset → LocalSandboxRunner (默认不回退)
- ✅ 不传 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN
- ✅ `--user 1000:1000` (non-root)
- ✅ `--security-opt no-new-privileges`
- ✅ `--cap-drop=ALL`
- ✅ `--read-only` fs
- ✅ `--network none` 默认 (DEEPWHALE_DOCKER_NETWORK=bridge 显式允许)
- ✅ workspace mount `--volume abs:/workspace:rw`
- ✅ `--tmpfs /tmp:size=64m,noexec,nosuid`
- ✅ `--label deepwhale.sandbox.run_id=<uuid8>` 精筛 cleanup, 不误删其它 runner
- ⚠️ **P1**: 缺 `--pids-limit / --memory / --cpus` 资源限制
- ⚠️ **P1**: Windows / Docker Desktop 端 test 跨平台诚实 skip (`docker-sandbox.test.ts` 默认 skip 真接)

### G. Quality Gate
- ✅ `corepack pnpm typecheck` 0 errors
- ✅ `corepack pnpm lint` 0 warnings
- ✅ `corepack pnpm test` 495 passed / 20 skipped (baseline 12.86s)
- ✅ focused suites: REPL / ToolPolicy / session replay / compaction / sandbox / docker gate (全部 0 fail)
- ⚠️ **P1**: CLI/TUI smoke 缺 (TUI 还没建, P0 之后补)
- ⚠️ **P1**: prefix-cache "4 机制" 端到端 focused suite 缺

## 能力当前状态 (done / partial / missing / broken)

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| A. CLI 4 mode + 参数透传 | **done** | `bin/deepwhale.js` 实查, --provider/--model/--yes/--verify 全部透传 4 mode, 退出码 0/1/2 |
| B. TUI | **missing** | `packages/coding-agent/src/tui/` 目录**不存在** (rg 0 hit) |
| C. 6 tools + ToolPolicy + --yes | **done** | `tools.test.ts` 6 工具齐, `policy/chain.ts` 透传 deny 不 bypass, tool-loop.ts:64 --yes 注释 |
| D. Linear Session | **done** | session/jsonl.ts 7 kind union, session-adapter.ts corrupted event skip, 4 个 session test |
| E. Prefix-cache 4 大机制 (代码) | **partial** | 4 件事散在 5 文件, **无总集文档** |
| E. Prefix-cache 4 大机制 (验证) | **partial** | pricing-config.test.ts 13 单元测, **无端到端联动测** |
| F. Docker Sandbox | **done (核心 9/9)** | docker-runner.ts buildDockerArgs 实查全部到位, 缺 resource limit (P1) |
| G. Quality Gate | **done (baseline)** | typecheck 0 / lint 0 / test 495/20 skip, 缺 TUI smoke (P0 之后) |

## P0 / P1 / P2 修复清单

### P0 (能力缺失或安全红线)
1. **B-TUI**: 新建 `packages/coding-agent/src/tui/` — minimal Ink (或自写 ANSI) 端, 接 tool loop + session + D-19.5 finish() cleanup. **单 sprint 大工程**, 拆 2 段: (a) 启动 + 输入 + stream 闭环 (b) tool confirm + 退出 cleanup
2. **E-4 机制固化**: 写 `docs/design/prefix-cache-4-mechanisms.md` — 4 机制命名 + 代码入口 + 可观测输出 + 验收命令
3. **F-资源限制**: docker-runner buildDockerArgs 加 `--pids-limit=256 --memory=512m --cpus=1.0` (默认值, env 允许 override)
4. **A-CLI 错误友好**: `bin/deepwhale.js` 缺 key 时给 setup hint (D-15 review P3 还未补)

### P1 (可观测 / 跨平台 / 测试)
1. **E-联动测**: 新建 `packages/coding-agent/test/integration/prefix-cache-4-mechanisms.test.ts` — 4 机制端到端 (mock LLM 返 cache_hit_tokens)
2. **D-cache 持久化**: tool-loop.ts 写 session 时附 `usage.cache_hit_rate` (Sprint 1b 类型已支持, 缺持久化)
3. **F-跨平台 skip**: `docker-sandbox.test.ts` 显式 skip Windows / 非 Linux 真接 (当前默认 skip, 加注释)
4. **C-find/grep 测覆盖度 spot check**: 跑 `pnpm test test/tools.test.ts` 看 find/grep it 计数
5. **G-CLI smoke**: 新建 `test/integration/cli-smoke.test.ts` — 4 mode 启动 + --provider 校验 + --verify 退出码
6. **G-TUI smoke** (P0 之后): 新建 `test/integration/tui-smoke.test.ts` — TUI 启动 + 输入 + 退出

### P2 (UX polish)
1. README examples 写 v1.0 (4 mode + TUI + sandbox env)
2. 错误文案友好化 (i18n 扩 3-5 key)
3. 性能调优: compaction 阈值微调, cache_hit_rate 精度
4. TUI 主题 (defer to v1.1)

## NOT v1.0 范围 (defer)

- 完整 IDE-style TUI (文件树、侧边栏、syntax highlight、autocomplete) — v1.1
- Multi-session 切换 — v1.1
- Plan mode / 自动 recovery — v1.1
- 完整 seccomp / apparmor profile (用 Docker default) — v1.1
- 远程容器 (本地 docker socket) — v1.1
- DeepSeek V4-Pro / Anthropic Opus 4.5 production deploy — 已在 Sprint 1b.5 验证
- 增量 compaction (Sprint D-5-3 之后) — v1.1
- 第三方 API key 黑名单扩 (D-12 review 只列 deepseek/anthropic) — v1.1

## 风险与验收命令

### 风险
1. **TUI 实现风险**: 选 Ink 还是自写 ANSI? Ink 依赖 (React 17+), 包大小 +0.5MB; 自写 ANSI 风险高 (光标定位 / raw mode / SIGWINCH).
   - **拍板**: 先调研 Ink 兼容性, 备选自写 (参考 Codex 早期 TUI)
   - **接受风险**: TUI 单 sprint 不一定做完, **拆 2 commit cluster** (D-20.1 启动 / D-20.2 确认)
2. **Prefix-cache 端到端测风险**: mock LLM 返 cache_hit_tokens 容易, 但断言 4 机制"联动"语义需要真 cache 路径, 可能要 INTEGRATION=1
   - **拍板**: 先用 mock 写 unit-style 集成测, 标注 INTEGRATION=1 时跑真路径
3. **Docker 资源限制兼容性**: `--memory=512m` 在 Docker Desktop (Mac/Win) VM 走 cgroups-v1, 行为可能不同
   - **拍板**: Linux host 真测, Mac/Win 测时 `--memory` 标 "advisory" 注释
4. **Test baseline 漂移**: D-19.5/6/6.1 已加 2 测, v1.0 又要加测, 计数会再涨. README L73 拍板"持续漂移, 硬编码会过期" — 接受
5. **TUI 跟 REPL 重复风险**: TUI 不能跟 REPL 重复实现 confirm / finish cleanup, 必须**复用 D-15 readline y/N + D-19.5 finish() 路径**, 否则 2 套代码 = 2 套 bug

### 验收命令

```bash
# 1. baseline 锁定
cd /home/butterfly443/deepwhale-d19.5
git rev-parse HEAD   # 必须 64b9296
pnpm typecheck       # 0 errors
pnpm lint            # 0 warnings
pnpm test            # 495 passed / 20 skipped baseline

# 2. v1.0 验收 (P0 完成后)
pnpm test 2>&1 | tail -3   # ≥ 500 passed (TUI + 4 机制 + sandbox 资源限制 加 ≥ 5 测)

# 3. focused suites
pnpm test test/integration/tool-loop-policy.test.ts  # 0 fail
pnpm test test/repl/                                   # REPL 闭环全过
pnpm test test/sandbox/                                # sandbox 全过
pnpm test packages/core/test/session/                  # session reload/replay 全过

# 4. 审计命令
rg -n "console\.log" packages/                        # 0
rg -n -w "TODO|FIXME" packages/                       # 0
rg -n "DEEPSEEK_API_KEY|ANTHROPIC_AUTH_TOKEN" packages/coding-agent/src/sandbox  # 全部在黑名单/排除
rg -n "rm -rf" packages/coding-agent/src              # 0 (除 static-rules 注释 / 测试 fixture)

# 5. TUI smoke (P0 完成后)
echo "hello" | timeout 5 node packages/coding-agent/bin/deepwhale.js --tui  # (待 P0 拍板)
```

## commit cluster 计划 (D-20 series)

- **D-20.1 (P0-A CLI 错误友好 + P0-F 资源限制)**: 2 commits
  - `feat(cli): bin/deepwhale.js 缺 key 时给 setup hint (D-20.1 P0)`
  - `feat(sandbox): docker-runner 加 --pids-limit / --memory / --cpus 默认值 (D-20.1 P0)`
- **D-20.2 (P0-E 4 机制固化 + P1-E 联动测)**: 2 commits
  - `docs(design): prefix-cache 4 机制命名 + 验收标准 (D-20.2 P0)`
  - `test(prefix-cache): 4 机制联动端到端 focused suite (D-20.2 P1)`
- **D-20.3 (P1-D cache 持久化 + P1-C find/grep 测覆盖)**: 2 commits
  - `feat(session): tool-loop 写 session 时附 usage.cache_hit_rate (D-20.3 P1)`
  - `test(tools): find / grep happy path 测覆盖度 spot (D-20.3 P1)`
- **D-20.4 (P0-B TUI)**: 2-3 commits (大工程, 风险)
  - `feat(tui): TUI v1 minimal — 启动 + 输入 + stream 闭环 (D-20.4 P0)`
  - `feat(tui): tool confirm + 退出 cleanup 接 D-19.5 finish() 路径 (D-20.4 P0)`
  - `test(tui): TUI smoke focused suite (D-20.4 P1)`
- **D-20.5 (总集归档 + v1.0 release checklist)**: 1 commit
  - `docs(plans): v1.0 capability completion 收尾 (D-20.5)`

**总预算**: 9-10 commits, 拆 5 sprint sub-cluster, 单 sprint 推 1-2 cluster.

## v1.0 release checklist (P0 完后)

- [ ] A. CLI 4 mode 全过 focused suite
- [ ] B. TUI v1 minimal 启动 + 输入 + stream + confirm + 退出 闭环
- [ ] C. 6 tools 全过 happy path + policy
- [ ] D. Linear Session reload/replay/compaction/corrupted 全过
- [ ] E. Prefix-cache 4 机制文档 + 联动测
- [ ] F. Docker Sandbox 9 红线 + 3 资源限制 + 跨平台 skip
- [ ] G. typecheck 0 / lint 0 / test ≥ 500 passed (基线 495 + ≥ 5 新测)
- [ ] 审计命令 4 类全 0 / 黑名单类全在排除逻辑
- [ ] README v1.0 examples 写齐
- [ ] CHANGELOG 拍 v1.0.0

## 当前 4 自检 (写 plan 时跑)

- ✅ 0 placeholders
- ✅ 数字/计数全部来自实测 (495 passed / 20 skipped / 13.12s)
- ✅ 4 finding 跟 git log 实际 commit 对得上 (5119570 D-15 / 752aaed D-13 / 64b9296 baseline)
- ✅ 0 估算数字 vs 实测数字矛盾
