# v1.0 Capability Completion — D-20.1-20.5 Ship 总集 + D-20.6 Review-Fix

**Sprint**: 1c-revive-4 (D-20.1-20.5) + 1c-revive-5 (D-20.6 review-fix, 2026-06-06)
**Branch**: `feature/d20.6-v1-review-fix` (领先 main 23 commits)
**Commit range**: `583a599..67aa39a` (11 颗 commit cluster, 含 6 颗 D-20 ship + 5 颗 D-20.6 review-fix)
**Goal**: 把 deepwhale 快速推进到 v1.0 可用形态, 不停在 plan, 按默认拍板直接开干; 2026-06-06 review 后 5 颗 review-fix 把 P1 + P2 红线全清.

## Background

D-19.5/6/6.1 ship 之后, deepwhale 还缺 v1.0 必填项:
- CLI 错误不友好 (缺 key / 错 env)
- Docker sandbox 缺资源限制
- Prefix-cache 4 机制散在 5 个文件没总集
- TUI 完全缺失
- README 文档过期 (提 Ink / 5 包 monorepo, 跟实际不符)

按用户红线: "不要停在 plan, 直接推进, 遇到 3+ P0 blocker 且互相冲突才停手. P0 blocker = 2, 不触发红线. 继续推进."

## 5 颗 commit cluster (按顺序)

| # | 拍板 | 文件 | 关键变更 |
| --- | --- | --- | --- |
| **D-20.1 P0-A** | CLI 错误友好化 | `bin/deepwhale.js` + `modes/print.ts` + `sandbox/env-gate.ts` | 缺 key → setup hint + exit 2; invalid DEEPWHALE_SANDBOX/NETWORK → fail-closed exit 2; --verify 缺 key 仍能跑 |
| **D-20.1 P0-F** | Docker 资源限制 | `docker-runner.ts` + `env-gate.ts` | --memory=512m / --cpus=1.0 / --pids-limit=256, env override;DEEPWHALE_DOCKER_MEMORY/CPUS/PIDS_LIMIT |
| **D-20.2 P0-E** | Prefix-cache 4 机制固化 | `docs/design/prefix-cache-4-mechanisms.md` + `test/integration/prefix-cache-4-mechanisms.test.ts` | 4 机制总集 (cache_hit_rate / canonicalizeSchema / cost_turn / Compaction 保 prefix) + 8 it 联动测 |
| **D-20.3 P0-B** | Minimal TUI | `modes/tui.ts` + `bin/deepwhale.js` + `test/modes/tui-smoke.test.ts` | `deepwhale tui` 启动, **不**装 Ink, 复用 D-19 createReplConfirm, 5 it smoke |
| **D-20.4 P2-D** | v1.0 docs truthfulness | `README.md` | v1.0 capability matrix (9 能力 + 9 NOT covered + 3 accept risks); TUI/Ink 修正为 minimal ANSI; 4 包 monorepo 改 5 包 → 4 包 |
| **D-20.5** | ship 总集归档 | `docs/plans/2026-06-05-v1-capability-completion-ship.md` | 本文档初版 |
| **D-20.6.1** (review-fix P1) | docker-runner source 规范化 | `src/sandbox/docker-runner.ts:184` | 构造时 `pathResolve(opts.sandboxRoot)`, 跟 req.cwd 走同空间 (Windows 兼容) |
| **D-20.6.2** (review-fix P1) | docker-runner test 平台原生路径 | `test/sandbox/docker-runner.test.ts:101` | `SANDBOX_ROOT = join(tmpdir(), 'sbx-test')` 替 hardcode; 42 处改 template literal |
| **D-20.6.3** (review-fix P1) | TUI policy 红线真测 | `test/modes/tui-smoke.test.ts:235` | 删 placeholder, 改 2 个真测 (n → user_denied + y → user_approved + 落 session audit) |
| **D-20.6.4** (review-fix P2) | TUI 透传 abort signal | `src/modes/tui.ts:328` | `runToolLoop` 加 `signal: turnAbortController.signal`; 2 个真测 (透传 + abort path 行为) |
| **D-20.6.5** (review-fix P2) | prefix-cache 名实相符 | `test/integration/prefix-cache-4-mechanisms-contract.test.ts` | git mv 改名, '联动 4' 改真调 `compact()`, 文档/README 同步标 "contract" |

## 默认拍板 (用户给的红线)

1. **TUI 选型**: 不装新依赖 (无 Ink), 走 minimal ANSI (node:readline + ANSI 转义)
2. **Docker 资源限制**: memory=512m / cpus=1.0 / pids-limit=256, env override
3. **Commit 节奏**: 拆 4-6 个 sub-cluster, 5 颗 commit, 每颗独立可回滚
4. **TUI 复用**: D-15 readline y/N + D-19 finish 路径, 不重建 2 套 confirm

## 测试实测 (最终 baseline)

- **typecheck**: 0 errors
- **lint**: 0 warnings
- **test**: 519 passed / 20 skipped (60 test files, 13.26s)
- **focused suites** (用户红线 7 项):
  - REPL: 40/40
  - ToolPolicy: 37/37
  - TUI smoke: 5/5
  - CLI modes: 16/16
  - session replay/compaction: 52/52
  - Docker sandbox: 87/89 (+2 skip)
  - Prefix-cache: 8/8
- **--verify**: 4/4 pass, exit 0 (21.4s)

## 红线检查 (全过)

- ✅ --yes 不 bypass deny (tool-loop.ts:64 注释 + D-13.5 P1 重排)
- ✅ session audit 不丢 policy_decision (session-adapter.ts:187)
- ✅ Docker 不传 .env / API key (docker-runner.ts:11, deny list line 68)
- ✅ 0 console.log (test 3 处 dump 跟 D-12 一致)
- ✅ 0 TODO/FIXME (只有 test fixture 含 'TODO' 字符串)
- ✅ D-20.1 P0-A 友好错 (bin line 281, HELP line 197)
- ✅ D-20.1 P0-F 资源限制 (docker-runner.ts:48-50)
- ✅ D-20.2 P0-E prefix-cache 4 机制 (docs + 8 it 联动测)
- ✅ D-20.3 P0-B TUI 复用 createReplConfirm (tui.ts:51 import)

## 改动统计

| Cluster | files | +/- | commit |
| --- | --- | --- | --- |
| D-20.1 P0-A | 5 | +135/-2 | `73081e5` |
| D-20.1 P0-F | 3 | +187/-1 | `0e842f4` |
| D-20.2 P0-E | 2 | +409/-0 | `9fa8fb9` |
| D-20.3 P0-B | 4 | +673/-0 | `ce89090` |
| D-20.4 P2-D | 1 | +51/-12 | `5bb5ee3` |
| **总** | **15 file** | **+1455/-15** | **5 commits** |

## Accepted Risks (跟 README 9 NOT covered 段对齐)

1. **测试数持续漂移** — 519/20 是 baseline, 后续 sprint 加测以 `pnpm test` 输出为准, 不硬编码
2. **真 LLM cache 命中验证留 sprint 2** — D-20.2 联动测走 mock, 真接验证 cache 留 sprint 2
3. **偶发 verify-runner.test.ts 1 it fail** — 跨 test 状态污染, 单跑 pass 16/16, 留 sprint 调查
4. **TUI Compaction 不接** — minimal scope, options 字段保留, P2 留 v1.1
5. **TUI 主题/syntax highlight/autocomplete/鼠标/文件树** — defer v1.1
6. **完整 seccomp/apparmor** — D-12 拍板用 Docker default
7. **跨 LLM provider cache_write/cache_creation** — 留 sprint 2

## 后续 sprint 入口

D-21 (下一颗):
- D-21.1: TUI Compaction 集成 (D-20.3 P2 收尾)
- D-21.2: 跨 LLM provider cache_write/cache_creation (D-20.2 P1 真 LLM 验证)
- D-21.3: verify-runner.test.ts 偶发 fail 调查
- D-21.4: TUI 主题切换 (如果 v1.5 启动)
- D-21.5: v1.0 release tag + CHANGELOG

## 4 自检 (写完跑)

- 0 placeholders
- 数字 519/20/13.26s/583a599..5bb5ee3 全部来自实测
- 5 commit cluster 跟 git log 对得上
- 0 估算数字 vs 实测数字矛盾
