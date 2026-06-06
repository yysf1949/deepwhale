# D-26 slash registry + lib + useSubmission/useInputHandlers — 复盘

**Sprint Owner**: 周礼攀 / Hermes agent
**Date**: 2026-06-07 (Wed) 00:18 - 00:42 (24min 实际, plan 12h 估算)
**Status**: ✓ Git ship 完整
**Sprint commit**: 3 (C1 + C2+C3 + C4+C5)
**Test gain**: 607 (D-25) → **637 pass** (+30 测)
**跟 Hermes 对齐度**: 12% → **~30%** (slash 系统 + lib 奠基完成)

## 1. 3 commit 拍板链

| # | sha | 拍板 | files | 跟 plan 偏差 |
|---|---|---|---|---|
| C1 | 4ee6f97 | feat 5 lib 工具 | 6 / +451 / -0 | 0 变更 |
| C2+C3 | 5d4428a | slash registry + 9 命令 | 8 / +589 / -0 | **plan 合并** (C2+C3 一起, 5 vs plan 5 — 一致) |
| C4+C5 | 1c884f3 | useSubmission + App 减重 | 2 / +148 / -48 | **plan 合并** (C4+C5 一起, 4 vs plan 5 — useInputHandlers 留 D-28+) |

合计: **16 files changed, +1188 / -48**

## 2. 11 维度对齐度变化 (跟 D-25 baseline 比)

| 维度 | D-25 后 | D-26 后 | Δ |
|---|---|---|---|
| 1. slash | 5% | **70%** | +65% (5 lib 工具 + 中央 registry + 9 命令 + SlashContext) |
| 2. composer | 20% | 30% | +10% (useState 跟 useSubmission 抽出) |
| 3. turn | 10% | 10% | 0 (D-29+ 拍) |
| 4. submission | 15% | **60%** | +45% (useSubmission hook + SlashContext + 路由) |
| 5. markdown | 0% | 0% | 0 (D-27 拍) |
| 6. thinking | 0% | 0% | 0 (D-27 拍) |
| 7. completion | 0% | 0% | 0 (D-28 拍) |
| 8. virtual history | 0% | 0% | 0 (D-28 拍) |
| 9. queue | 0% | 0% | 0 (D-28 拍) |
| 10. memory | 0% | 0% | 0 (D-29+ 拍) |
| 11. lib | 0% | **40%** | +40% (5 lib 工具 ship) |
| **综合** | **12%** | **~30%** | **+18%** |

## 3. 5 lib 工具拍 Hermes 80% 行为 1:1 (C1)

| 工具 | Hermes 1:1 | D-26 行为 |
|---|---|---|
| text | 197 行 | **85 行** (D-26 简化: 5 函数, 不做 thinking/paste/tool trail) |
| circularBuffer | 48 行 | **68 行** (1:1 + size + capacityValue getter) |
| messages | 4 行 | **27 行** (1:1 + JSDoc + 类型 export) |
| platform | 15 行 | **28 行** (1:1 + JSDoc 中文) |
| gracefulExit | 47 行 | **63 行** (简化: 0 重入保护, D-29+ 拍) |

**8 个 Hermes lib 留 D-27+ 拍**: memory / memoryMonitor / clipboard / osc52 / externalCli / rpc / history / syntax / reasoning

## 4. 9 slash 命令拍 Hermes 80% 行为 1:1 (C3)

| 命令 | 类别 | D-26 行为 |
|---|---|---|
| /help | core | 印 9 命令列表 (代码块格式) |
| /exit (q/quit) | core | writer.close + onExit + exit() (D-19.5 finish 1:1) |
| /clear | core | $transcript.set([]) 0 关 session |
| /verify | core | 调 runVerify() 函数 (D-26 拍: 不 spawn bin) |
| /status | core | 印 model + mode + session + usage + transcript 5 字段 |
| /model | session | 切 model + provider narrow (deepseek/claude) |
| /resume | session | D-26 placeholder (D-28 picker 升级) |
| /personality | session | D-26 placeholder (D-27 升级) |
| /heapdump (mem) | debug | 印 process.memoryUsage() 5 字段 |

**Hermes 30+ 命令覆盖率 ~30%** (核心 5/9 真实, 3 placeholder 拍 D-27+ 升级, 1 debug 真支持)

## 5. 实战拍板变更 (跟 plan 偏差, 2 处)

### 5.1 C4 范围缩小
- **plan 拍**: useSubmission + useInputHandlers 2 hook
- **实战撞**: useInputHandlers 需要跟 Hermes 1:1 拍 Ctrl+K/L/R 等快捷键,但 tui-ink 还没接 ink 6 底层 key 抽象(走 ink-text-input),拍**只做 useSubmission**,useInputHandlers 留 D-28+ 拍(那时 tui-ink 已有自己的 key router)
- **用户拍板**: 0 (D-26 拍 "5 类拍 3 类简化, 0 重入保护" 拍板已含)
- **踩坑记录**: plan 拍 sprint 序列时,hook 拍板没考虑"前置基础设施缺失"

### 5.2 3 拍板 8 行 patch 实战撞
- **app.tsx patch 多 1 个闭合 `}`** (TS1128) — patch 工具跟 new_string 边界拍
- **sealLastAssistant + TranscriptEntry import 不用** (TS6133) — 改 useSubmission 删了引用
- **LSP cache stale** 报老错 — D-25 实战拍过,跑真 typecheck 验
- **mock state 用 let 闭包** (commands.test.ts 3 测) — return snapshot 错位,改对象引用

## 6. 4-bug-type 自检 (ship-quality-checks §7a)

| # | 类型 | 实战撞 | 修法 |
|---|---|---|---|
| 1 | 占位符残留 (P39) | 0 撞 | 3 commit message + diff stat 全干净 |
| 2 | 优先级 vs 文字矛盾 | 0 撞 (D-25 F5 自相矛盾已修) | 0 |
| 3 | 上游张冠李戴 | 0 撞 | 3 commit 跟 D-26 plan §3.2 C1-C5 1:1 锁 |
| 4 | **估算数字 vs 实测数字** ★ | mock state let 闭包 3 测 fail | 改对象引用 (state.setModelCall), 拍到 commit message |

## 7. 测试矩阵

| 包 | D-25 | D-26 | Δ |
|---|---|---|---|
| tui-ink | 26 | **56** | +30 (19 lib + 11 commands) |
| coding-agent util | 11 | 11 | 0 (D-25 已 ship) |
| coding-agent total | 74 | 74 | 0 (D-26 0 改 coding-agent 业务) |
| **root 总** | **607** | **637 pass** | **+30 测** |

## 8. 3 件套 (D-26 不发 tag 跟 publish, 留 D-27 拍)

| 件 | 状态 |
|---|---|
| git ls-remote main | `1c884f3` ✓ |
| 本地装出 1.0.10 banner | ✓ (D-25 B5 拍 v1.0.10 仍显示, D-27 bump 1.0.11) |
| TUI 真启 | ✓ (script -qfc 模拟 /help 输入, 0 崩) |
| npm publish 5 包 | ⏸ (D-25 留 OTP 未补, D-27 拍 1.0.11 一起补) |

## 9. D-26 实战撞坑沉淀 (跟 ship-quality-checks + deepwhale-tui-evolution skill 一致)

| 坑 | 类别 | 沉淀 |
|---|---|---|
| SlashContext.ui: snapshot vs useStore | tui-ink state 拍 | D-26 拍 `$uiState.get()` snapshot, D-29+ 优化 (用 store subscribe 自动 refresh) |
| estimateTokensRough 是 ceil 不是 1:1 | 测算法 | D-26 B1 实战撞: `(length+3)/4 ceil`, 1 char = 1, 4 chars = 2, 11 chars = 4, 100 chars = 26 |
| gracefulExit wired flag 跨测污染 | 测隔离 | beforeEach `process.removeAllListeners` + `vi.resetModules()` |
| mock state let 闭包 | 测错位 | 改对象引用 `const state = { x: null }`, 改+读同一对象 |
| app.tsx patch 多 1 闭合 } | 工具 patch | 跑 typecheck 验 (LSP cache stale) |
| sealLastAssistant unused | 工具 lint | 删 import |
| SlashContext setModel 真切 | 拍板 | 改 useState 响应, 不再硬编码 options.model ?? client.model |
| /verify 调 runVerify (不 spawn bin) | 拍板 | 防 child_process 重入, 跟 D-19 controller 拍板一致 |
| 找不到 slash 命令: fallback 推提示, 不抛 | 拍板 | 跟 Hermes 1:1 |

## 10. D-26 总结拍板

- 5 lib 工具 + 9 slash 命令 + 1 useSubmission hook 完 ✓
- 跟 Hermes 对齐度: 12% → **~30%** (+18%)
- 5 packages bump 1.0.9→1.0.11 留 D-27 拍 (跟 npm publish 一起)
- D-27 起点: markdown 引擎 + thinking 折叠 + MEDIA tag
- 跟 deepwhale-d25-d28-tui-parity-sprint.md §3.3 (D-27 拍板) 1:1 锁

## 11. 4 sprint 进度

| sprint | 状态 | 跟 Hermes 对齐度 | commit | 测试 |
|---|---|---|---|---|
| D-24.4 | ✓ ship (baseline) | 10% | 1 | 576 |
| D-25 | ✓ ship | 12% | 7 ship + 1 retro | 607 (+31) |
| **D-26** | **✓ ship** | **30%** | **3** | **637 (+30)** |
| D-27 | 待 D-26 + OTP 补 publish | 30% → 45% (目标) | 4 (估) | 估 +~15 |
| D-28 | 待 D-27 | 45% → 65% (目标) | 5 (估) | 估 +~25 |
| 累计 | | **10% → 65%** (估) | 17+1 (估) | **637 → ~700** (估) |

## 12. 自我审视

D-26 拍板 4 件事做对:
1. ✓ 5 lib 工具 + 9 命令 + useSubmission 1:1 拍 Hermes, 0 改业务
2. ✓ useSubmission 抽 input 路由, App.tsx 大幅减重
3. ✓ ship-quality-checks §7a 4-bug-type 实战撞 1 类 (第 4 类 估算 vs 实测, mock state), 立即拍板修正
4. ✓ 跟 D-25 ship ritual 一致: feature/d26-slash 分支 → 测 0 破坏 → ff merge → push main 远端

D-26 拍板 1 件事未完:
1. **5 packages bump + publish 留 D-27 拍** (跟 npm 2FA OTP 一起)

**D-26 ship 完整度: 80%** (git + code 100%, bump + publish 0%, D-27 拍)
