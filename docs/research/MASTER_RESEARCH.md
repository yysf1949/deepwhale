# 🐋 deepwhale 总研究报告（v2 — 5 项目整合版）

> **整合 5 份深度调研：CodeWhale / Reasonix / pi / Hermes / oh-my-pi** + 一份 deepwhale 方案优化
> 生成时间：2026-06-03（v2 在 v1 2026-06-02 基础上加入 oh-my-pi）
> v1 备份: `MASTER_RESEARCH_v1_4projects.md.bak`

---

## ⚠️ 5 份报告里**最颠覆的发现**（v2 增量用 ⭐ 标出）

调研中**直接推翻了 5 个 deepwhale 原本设计假设**：

| 假设 | 真相 | 来源 |
|---|---|---|
| ❌ Reasonix 是 Node.js + Ink + Tauri | ✅ **Reasonix 1.0+ 是 Go + Bubbletea + Wails** | Reasonix `go.mod:1` `desktop/wails.json:1-19` |
| ❌ "CodeWhale 4 遍 tool-call repair" | ✅ **不是 4 遍，是 1 个 `SanitizeToolPairing` 函数处理 4 种 pairing cases** | Reasonix `provider.go:78-150` |
| ❌ "pi 用 TypeScript monorepo" | ✅ **pi 是 4 包结构（pi-ai / pi-agent-core / pi-tui / pi-coding-agent）**，pi-mom 已迁出 | pi `packages/` 目录 |
| ⭐ ❌ "str_replace 是 AI agent 编辑的标配" | ✅ **oh-my-pi 用 hashline 实现 6.7% → 68.3% 的 10× 提升（仅换 patch 格式）** | oh-my-pi `README.md:43-46` + `packages/hashline/src/prompt.md` |
| ⭐ ❌ "fork 知名项目是 5 月拿 10k star 的捷径" | ✅ **是；但有 upstream drift 代价**——issue #1736 实证 Qwen 在 omp 失败在 pi 通过 | oh-my-pi issue #1736 |

**v2 增量直接影响**：
- deepwhale 必须把 **hashline 格式**提到 **Sprint 0-1**（不是 Sprint 3 之后）
- **不能 fork pi-mono 整套**（ownstream drift 风险），**只借鉴原子能力**

---

## 1. 五个项目真实技术栈一览

| 项目 | 语言 | TUI | 桌面 | 后端协议 | 沙箱 | Skill 格式 | Star |
|---|---|---|---|---|---|---|---|
| **CodeWhale** | Rust | ratatui（推测） | Tauri（规划） | axum HTTP+JSON-RPC | Seatbelt/Landlock/JobObject | SKILL.md（对齐 Codex） | - |
| **Reasonix** | **Go 1.25+** | **Charm Bubbletea v2** | **Wails 2.12** | HTTP/SSE | 无 OS 沙箱 | .md + Anthropic Skills 兼容 4 目录 | - |
| **pi** | TypeScript | Ink / 自家 TUI | 无 | JSON-RPC stdio | 无 | SKILL.md frontmatter | 58.6k |
| **Hermes** | Python | textual | 无 | 飞书/Telegram/邮件 | plugin 沙箱 | 自由 | - |
| **oh-my-pi** ⭐ | **TS (54w 行) + Rust (27k 行)** | Ink + diff render | 无（4 入口 TUI/one-shot/RPC/ACP） | NDJSON stdio / ACP | **4 后端自动** (APFS/btrfs/zfs/overlayfs) | .md + Claude/Cursor/Windsurf 7 平台继承 | **10,034** (5 月) |

**v2 结论**：
- **TypeScript 栈整体可行**（pi 已验证 58.6k stars）
- **桌面选 Tauri**（生态成熟，Wails Go 借鉴不动）
- **沙箱双轨**：短期抄 CodeWhale（Windows Job Object / macOS Seatbelt / Linux Landlock），长期参考 oh-my-pi 的 4 后端自动解析
- **Skills 格式抄 Codex + pi 双兼容**
- **⭐ patch 格式抄 oh-my-pi hashline**（差异化关键）
- **⭐ 借鉴 oh-my-pi napi natives 思路**（grep / shell / ast 走 Rust 进程内）

---

## 2. 每个项目的关键可借鉴资产（v2 加 oh-my-pi）

### 2.5 oh-my-pi（can1357/oh-my-pi，v15.8.0，5 月 10k star）⭐

| 资产 | 真实出处 | deepwhale 价值 |
|---|---|---|
| **hashline patch 格式** | `packages/hashline/src/prompt.md` + `parser.ts` + `grammar.lark` | **P0** — 替代 str_replace，10× 提升 |
| **SnapshotStore + 3-hex TAG** | `packages/hashline/src/snapshots.ts` | **P0** — 抗陈旧锚点 |
| **Patcher 两阶段（prepare/commit）** | `packages/hashline/src/patcher.ts` | **P0** — multi-section all-or-nothing |
| **Filesystem 抽象** | `packages/hashline/src/fs.ts` | **P1** — 同一 patch 可在 disk/mem/远程 |
| **Recovery 3-way merge** | `packages/hashline/src/recovery.ts` | **P1** — stale tag 自动救回 |
| **Block 解析（tree-sitter）** | `packages/hashline/src/block.ts` | **P2** — `replace block N:` 语法 |
| **napi natives 27k 行** | `crates/pi-natives/src/` 11,658 行（grep/shell/ast/tokens/text/keys） | **P0** — hot path Rust 化 |
| **brush-shell vendored 整个 bash** | `crates/brush-core-vendored/` | **P2** — 进程内 bash 解释器 |
| **沙箱 4 后端自动** | `crates/pi-iso/src/lib.rs` 245 行 | **P1** — 长期多 OS |
| **mtime 共享 cache** | `crates/pi-natives/src/fs_cache.rs` 836 行 | **P1** — read/grep/lsp 共享 |
| **自研 edit benchmark** | `packages/typescript-edit-benchmark/` 6,554 行 | **P0** — 求职差异化，自证营销 |
| **4 入口设计** | README "Four entry points" 段 | **P1** — TUI / one-shot / RPC / ACP |
| **AGENTS.md 自动发现** | `crates/pi-natives/src/workspace.rs` 386 行 | **P2** — 单 pass 扫描 |
| **7 平台配置继承** | README "Discovery" 段 | **P2** — `.claude`/`.cursor`/`.windsurf` 等 |

---

## 3. 借鉴冲突仲裁（v2 含 oh-my-pi）

| 能力 | CodeWhale | Codex | Reasonix | pi | oh-my-pi | **deepwhale 决策** |
|---|---|---|---|---|---|---|
| 编辑格式 | str_replace | str_replace | str_replace | str_replace | **hashline** | **跟 oh-my-pi（hashline）** |
| 沙箱 | Tauri + Windows Job Object | E2B cloud | Docker | 进程内 | **4 后端自动** | **先 Windows Job Object（Sprint 2），后端自动留 Sprint 4** |
| 推理路由 | 直连 DeepSeek | - | - | 链 | 14 provider 链 | **不做 provider 链（v1 就 DeepSeek）** |
| 子 agent | 有 | 无 | 无 | 无 | **typed schema** | **延后到 Sprint 3** |
| TUI | Ink | OpenAI 官方 web | Bubbletea | Ink | Ink + diff render | **保持 Ink（已选）** |
| 桌面 | Tauri | - | - | - | 无 | **保留 Tauri（已选）** |
| 本地 embedding | 无 | 无 | 无 | 无 | **fastembed + onnx** | **不做（求职不需要）** |
| Browser | 无 | 有（官方） | 无 | 无 | Puppeteer | **延后到 Sprint 5** |
| LSP | 无 | 无 | 无 | 13 ops | **13 ops + workspace/willRenameFiles** | **保留 LSP 计划，参考 oh-my-pi 的 willRenameFiles 钩子** |
| DAP | 无 | 无 | 无 | 无 | 27 ops | **不做（成本高、价值对个人项目低）** |
| 编辑 benchmark | 无 | 无 | 无 | 无 | **6,554 行** | **P0 做自研** |
| napi 原生层 | 无 | 无 | 无 | 无 | **27k 行 Rust** | **Sprint 2 引入**（先 bun 子进程跑 grep 验证） |
| 进程内 bash | 无 | 无 | 无 | 无 | **brush vendored** | **不做（成本太高，留占位）** |

---

## 4. 优化后的设计（v2）

### 技术栈终版

- **语言**：TypeScript（主） + Rust（hot path napi）
- **运行时**：Bun 1.3+
- **TUI**：Ink 6 + 自家 diff render（参考 oh-my-pi `tui.ts`）
- **桌面**：Tauri 2（v2 留 v3）
- **沙箱**：Windows Job Object（短期） + pi-iso 4 后端（长期）
- **Provider**：DeepSeek 直连（v1） + 14 provider 链（v3 留位）
- **Patch 格式**：**hashline 自研**（替代 str_replace）
- **Benchmark**：**自研 edit-benchmark harness**（差异化）

### 关键模块划分

```
deepwhale/
├── packages/
│   ├── coding-agent/      # TUI + CLI（参考 pi-coding-agent）
│   ├── hashline/          # ★ 自研 patch 格式（参考 oh-my-pi）
│   ├── ai/                # provider（参考 pi-ai）
│   ├── tui/               # Ink diff render（参考 pi-tui）
│   ├── natives/           # napi 绑定（参考 pi-natives）
│   └── utils/
├── crates/
│   ├── dw-natives/        # ★ napi cdylib（参考 pi-natives）
│   ├── dw-ast/            # tree-sitter 包装（参考 pi-ast）
│   └── dw-iso/            # 沙箱后端解析（参考 pi-iso）
├── bench/
│   └── edit-benchmark/    # ★ 自研 harness（参考 typescript-edit-benchmark）
└── docs/research/
    ├── 01_codewhale.md
    ├── 02_codex_browser.md
    ├── 03_reasonix.md
    ├── 04_pi.md
    ├── 05_hermes.md
    ├── 06_oh-my-pi.md
    └── MASTER_RESEARCH.md  ← 本文件
```

### 关键架构决策（v2 新增 ⭐ 标）

| 决策 | 选择 | 理由 |
|---|---|---|
| 编辑格式 | **hashline（自研）** ⭐ | 10× 提升，仅换格式 |
| 是否 fork pi-mono | **不 fork** ⭐ | upstream drift 风险（issue #1736 实证） |
| hot path 实现 | **napi + Rust** ⭐ | fork/exec 性能差 |
| benchmark 来源 | **自研** ⭐ | 求职差异化、自证营销 |
| 4 入口优先级 | **TUI → one-shot → RPC → 跳过 ACP** ⭐ | ACP 绑 Zed 协议，性价比低 |
| 进程内 bash | **不做** ⭐ | brush vendored 成本太高 |

---

## 5. Sprint 重新排序（v2 含 hashline 提前）

| Sprint | 原计划（v1） | 优化后（v2） | 理由 |
|---|---|---|---|
| 0 | 骨架（Ink + DeepSeek） | 骨架 + **hashline 格式 MVP** ⭐ | 提前卡位差异化 |
| 1 | str_replace edit 工具 | **hashline 完整版 + Recovery 3-way** ⭐ | 行业瓶颈，10× 提升 |
| 2 | TUI 完善 + RPC 占位 | TUI + **napi natives（grep/tokens/ast）** ⭐ | hot path 性能 |
| 3 | LSP 集成 | LSP + **willRenameFiles** ⭐ | 优于普通 rename |
| 4 | 沙箱 Windows Job Object | **Windows + pi-iso 4 后端占位** ⭐ | 长期多 OS |
| 5 | Browser | **edit benchmark 公开报告** ⭐ | 求职差异化 |

**v2 Sprint 0-1 的关键变化**：从"能写文件"变成"用 hashline 写文件"。**这是单点决定 deepwhale 是否与众不同的关键**。

---

## 6. 风险与未决项（v2 新增 ⭐ 标）

| 风险 | 等级 | 决策 |
|---|---|---|
| hashline 写出来后 LLM 不会用 | 高 ⭐ | **prompt.md 完整翻译成中文 + 多示例** |
| napi build 跨平台麻烦 | 中 ⭐ | **Sprint 2 再决定，先用 bun 子进程跑 grep** |
| 借鉴 hashline 是否侵权 | 低 ⭐ | MIT 协议，**注明来源 + 保留 © Can Bölük** |
| benchmark 跑得太慢 | 中 ⭐ | **用 in-process client + 限定 fixture 数量** |
| upstream drift（fork pi-mono）| 已规避 ⭐ | **不 fork pi-mono 整套** |
| oh-my-pi 未来 API 变化 | 低 ⭐ | **不依赖其包，只学习设计** |

---

## 7. 关键文件路径速查（5 个项目）

| 项目 | 调研文件 | 关键源文件 |
|---|---|---|
| CodeWhale | `01_codewhale.md` | `crates/tui/src/prompts/base.md` + `crates/tui/src/sandbox/{seatbelt,landlock}.rs` |
| Codex | `02_codex_browser.md` | （Tauri 桌面 + E2B cloud） |
| Reasonix | `03_reasonix.md` | `provider.go:78-150` (SanitizeToolPairing) |
| pi | `04_pi.md` | `packages/{pi-ai,pi-agent-core,pi-tui,pi-coding-agent}/` |
| Hermes | `05_hermes.md` | （通道 + plugin 沙箱） |
| **oh-my-pi** ⭐ | `06_oh-my-pi.md` | `packages/hashline/src/` + `crates/pi-natives/src/` + `packages/typescript-edit-benchmark/src/` |

---

## 8. 一句话总结（v2）

> **v1 结论**：4 项目里 TypeScript 栈整体可行，深挖**沙箱 + Skills + 多 provider 链**。
>
> **v2 结论**：5 项目里 **oh-my-pi 用"自研 patch 格式 + napi natives + 自研 benchmark"3 件事在 5 个月内拿到 10k star**。deepwhale 最大的借鉴不是"抄它的代码"，而是抄它的"3 件事差异化"思路 —— **用 hashline 替代 str_replace**、**用 napi natives 替代 fork/exec**、**用自研 benchmark 替代"我比 X 强"的口号**。**不 fork pi-mono 整套**，**自己写引擎**，**借鉴原子能力**。
