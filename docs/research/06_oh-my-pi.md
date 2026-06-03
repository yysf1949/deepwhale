# oh-my-pi (can1357) → deepwhale 借鉴清单

> 研究日期: 2026-06-03
> 完整研究见: `~/ObsidianVault/AI研究/技术文档/oh-my-pi/README.md`
> 完整 Obsidian 子文档: `01-项目概览` / `02-系统架构` / `03-hashline-patch` / `04-Rust-natives` / `05-编辑benchmark`

---

## 1. 关键事实速览

| 维度            | oh-my-pi                   | deepwhale 当前 | 差距        |
| --------------- | -------------------------- | -------------- | ----------- |
| Star            | 10,034 (5 月)              | 0 (Sprint 0)   | 体量差      |
| TypeScript      | ~540k 行                   | ~0             | 需建设      |
| Rust            | ~27k 行                    | 0              | 完全空白    |
| 自研 patch 格式 | hashline                   | str_replace    | **P0 差距** |
| 自研 benchmark  | 有（6,554 行）             | 无             | **P0 差距** |
| 4 入口          | TUI / one-shot / RPC / ACP | 仅 TUI（计划） | 中期        |
| 沙箱            | 4 后端自动                 | 0              | 长期        |
| Provider        | 40+                        | 计划 1-2       | 长期        |
| 编辑器集成      | ACP (Zed)                  | 0              | 长期        |

**结论**：oh-my-pi 是 deepwhale 的**最强单点对标**。它 fork 了 pi-mono 整套（`@oh-my-pi/pi-*` 命名空间），但通过 **hashline + natives + benchmark** 三件事**做出差异化**，5 个月拿到 10k star。

---

## 2. 颠覆性发现（影响 deepwhale 设计）

### 发现 1：str_replace 是**整个 AI agent 行业的瓶颈**

oh-my-pi README 第一张表（4 个模型提升数据）**全部来自 hashline vs str_replace**。这说明：

- 6.7% → 68.3% 的 Grok Code Fast 提升 = **10 倍**仅靠换 patch 格式
- -61% token 用量 = **节省 6 成** LLM 费用
- 2.1× pass rate = **同 prompt 同模型**，仅格式升级

**对 deepwhale 的影响**：v1 即使只抄 hashline 一种格式，**不写后端算法**，**已能拉开与"用 str_replace 的 agent"的差距**。

### 发现 2：Bash 解释器可以 vendored（不是必须 fork/exec）

`brush-shell` 整个 fork → vendored 到 `crates/brush-core-vendored/`。**这给了"进程内 bash"的可能性**。

**对 deepwhale 的影响**：v1 可以**只走 fork/exec**（简单），但要在 ROADMAP 留"v3 进程内 bash"的占位。

### 发现 3：自研 benchmark 是**自证营销的硬通货**

oh-my-pi 那张表**不是嘴上说** —— 6,554 行 harness 跑出来的，**任何人都能复现**。

**对 deepwhale 的影响**：求职作品集里**"自研 LLM edit benchmark"是一等公民**，比"多接了 N 个 provider"更稀罕。

### 发现 4：fork pi-mono 的**代价是 divergence 风险**

issue #1736 实证："Qwen 3.7/Minimax m3 from OpenCode Go fails in omp but works from pi" —— fork 维护有 **upstream drift** 风险，**未来 pi 上游修了 bug omp 不会自动得到**。

**对 deepwhale 的影响**：

- ❌ **不要盲目 fork pi-mono 整套**（omission 风险大）
- ✅ **只借鉴"原子能力"**：hashline 格式 / natives 思路 / benchmark 思路，**自己写引擎**（这是 deepwhale 当前定位）

### 发现 5：4 入口设计是**渐进式集成的标准答案**

| 入口     | 适用                        |
| -------- | --------------------------- |
| TUI      | 个人开发者                  |
| One-shot | CI / 脚本                   |
| RPC      | Web IDE / IDE 插件          |
| ACP      | Zed / VS Code（用官方协议） |

**对 deepwhale 的影响**：v1 只做 TUI，**RPC 留 v2**（给后续 Web 集成），**ACP 不做**（Zed 强绑定 Zed 技术栈，对个人项目性价比低）。

---

## 3. 借鉴冲突仲裁（与已有 4 份调研对照）

| 能力           | CodeWhale                  | Codex           | Reasonix    | pi          | oh-my-pi                               | **deepwhale 决策**                                         |
| -------------- | -------------------------- | --------------- | ----------- | ----------- | -------------------------------------- | ---------------------------------------------------------- |
| 编辑格式       | str_replace                | str_replace     | str_replace | str_replace | **hashline**                           | **跟 oh-my-pi（hashline）**                                |
| 沙箱           | Tauri + Windows Job Object | E2B cloud       | Docker      | 进程内      | **4 后端自动**                         | **先 Windows Job Object（Sprint 2），后端自动留 Sprint 4** |
| 推理路由       | 直连 DeepSeek              | -               | -           | 链          | 14 provider 链                         | **不做 provider 链（v1 就 DeepSeek）**                     |
| 子 agent       | 有                         | 无              | 无          | 无          | **typed schema**                       | **延后到 Sprint 3**                                        |
| TUI            | Ink                        | OpenAI 官方 web | Bubbletea   | Ink         | Ink + diff render                      | **保持 Ink（已选）**                                       |
| 桌面           | Tauri                      | -               | -           | -           | 无                                     | **保留 Tauri（已选）**                                     |
| 本地 embedding | 无                         | 无              | 无          | 无          | **fastembed + onnx**                   | **不做（求职不需要）**                                     |
| Browser        | 无                         | 有（官方）      | 无          | 无          | Puppeteer                              | **延后到 Sprint 5**                                        |
| LSP            | 无                         | 无              | 无          | 13 ops      | **13 ops + workspace/willRenameFiles** | **保留 LSP 计划，参考 oh-my-pi 的 willRenameFiles 钩子**   |
| DAP            | 无                         | 无              | 无          | 无          | 27 ops                                 | **不做（成本高、价值对个人项目低）**                       |

---

## 4. 借鉴清单（按 P0/P1/P2 排序）

### P0 — 必须做（Sprint 0-1）

| 借鉴点                          | 来源                                            | 实施位置                         | 状态                |
| ------------------------------- | ----------------------------------------------- | -------------------------------- | ------------------- |
| **hashline patch 格式**         | `packages/hashline/src/prompt.md` + `parser.ts` | `packages/edit/src/hashline/`    | TODO                |
| **SnapshotStore + 3-hex TAG**   | `packages/hashline/src/snapshots.ts`            | `packages/edit/src/snapshots.ts` | TODO                |
| **自研 edit benchmark harness** | `packages/typescript-edit-benchmark/`           | `bench/edit-benchmark/`          | TODO                |
| **不 fork pi-mono 整套**        | issue #1736 (upstream drift)                    | 决策                             | ✅ 已选（独立引擎） |

### P1 — 应该做（Sprint 2-3）

| 借鉴点                                 | 来源                                              | 实施位置                            | 状态 |
| -------------------------------------- | ------------------------------------------------- | ----------------------------------- | ---- |
| **Napi 原生层**（grep / tokens / ast） | `crates/pi-natives/src/`                          | `crates/deepwhale-natives/`         | TODO |
| **mtime 共享 cache**                   | `crates/pi-natives/src/fs_cache.rs` 836 行        | 同上                                | TODO |
| **TUI diff render**                    | `packages/tui/src/tui.ts` 2,179 行                | 调研 Ink + 自研                     | 调研 |
| **LSP `willRenameFiles` 钩子**         | `packages/coding-agent/src/lsp/index.ts` 2,306 行 | Sprint 3 LSP 模块                   | TODO |
| **多 mutation 类型 fixture**           | `mutations.ts` 1,423 行                           | `bench/edit-benchmark/mutations.ts` | TODO |
| **4 入口的 RPC 模式**                  | NDJSON over stdio                                 | Sprint 2 留 v2 占位                 | TODO |

### P2 — 可选（Sprint 4-5+）

| 借鉴点                       | 来源                                         | 实施位置               | 状态   |
| ---------------------------- | -------------------------------------------- | ---------------------- | ------ |
| **vendored brush-shell**     | `crates/brush-core-vendored/`                | 风险高、成本高，留占位 | 留占位 |
| **沙箱 4 后端自动解析**      | `crates/pi-iso/src/lib.rs` 245 行            | Sprint 4               | 留占位 |
| **Recovery 3-way merge**     | `packages/hashline/src/recovery.ts`          | Sprint 2               | 留占位 |
| **typed subagent schema**    | `packages/swarm-extension/`                  | Sprint 3               | 留占位 |
| **Puppeteer browser**        | `packages/coding-agent/src/tools/puppeteer/` | Sprint 5               | 留占位 |
| **Catpcha / 多 provider 链** | `packages/ai/src/providers/`                 | 长期                   | 留占位 |

---

## 5. 修订 deepwhale ROADMAP（基于本次研究）

| Sprint | 原计划                  | 优化后                                    | 理由               |
| ------ | ----------------------- | ----------------------------------------- | ------------------ |
| 0      | 骨架（Ink + DeepSeek）  | 骨架 + **hashline 格式 MVP**              | 提前卡位差异化     |
| 1      | str_replace edit 工具   | **hashline 完整版 + Recovery 3-way**      | 行业瓶颈，10x 提升 |
| 2      | TUI 完善 + RPC 占位     | TUI + **napi natives（grep/tokens/ast）** | hot path 性能      |
| 3      | LSP 集成                | LSP + **willRenameFiles**                 | 优于普通 rename    |
| 4      | 沙箱 Windows Job Object | **Windows + pi-iso 4 后端占位**           | 长期多 OS          |
| 5      | Browser                 | **edit benchmark 公开报告**               | 求职差异化         |

**Sprint 1 的关键变化**：从"能写文件"变成"用 hashline 写文件"。**这是单点决定 deepwhale 是否与众不同的关键**。

---

## 6. 风险与未决项

| 风险                         | 等级 | 决策                                         |
| ---------------------------- | ---- | -------------------------------------------- |
| hashline 写出来后 LLM 不会用 | 高   | **prompt.md 完整翻译成中文 + 多示例**        |
| napi build 跨平台麻烦        | 中   | **Sprint 2 再决定，先用 bun 子进程跑 grep**  |
| 借鉴 hashline 是否侵权       | 低   | MIT 协议，**注明来源 + 保留 © Can Bölük**    |
| benchmark 跑得太慢           | 中   | **用 in-process client + 限定 fixture 数量** |
| oh-my-pi 未来 API 变化       | 低   | **不依赖其包，只学习设计**                   |

---

## 7. 一句话总结

> **oh-my-pi 用 5 个月时间证明了一件事：fork pi-mono 整套 + 把 hot path Rust 化 + 自研 hashline 格式 + 自研 benchmark 自证 = 10k star。**
> **deepwhale 的最大借鉴不是"抄它的代码"，而是抄它的"3 件事差异化"思路 —— 用 hashline 替代 str_replace，用 napi natives 替代 fork/exec，用自研 benchmark 替代"我比 X 强"的口号。**
