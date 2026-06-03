# 🐋 deepwhale 总研究报告（v3 — 6 项目整合版）

> **整合 6 份深度调研：CodeWhale / Reasonix / pi / Hermes / oh-my-pi / ECC** + 一份 deepwhale 方案优化
> 生成时间：2026-06-03（v3 在 v2 2026-06-03 基础上加入 ECC）
> v1 备份: `MASTER_RESEARCH_v1_4projects.md.bak`
> v2 同步：v2 = 5 项目（已合入 oh-my-pi）

---

## ⚠️ 6 份报告里**最颠覆的发现**（v3 增量用 🌟 标出）

调研中**直接推翻了 6 个 deepwhale 原本设计假设**：

| 假设                                        | 真相                                                                                                 | 来源                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ❌ Reasonix 是 Node.js + Ink + Tauri        | ✅ **Reasonix 1.0+ 是 Go + Bubbletea + Wails**                                                       | Reasonix `go.mod:1` `desktop/wails.json:1-19`                  |
| ❌ "CodeWhale 4 遍 tool-call repair"        | ✅ **不是 4 遍，是 1 个 `SanitizeToolPairing` 函数处理 4 种 pairing cases**                          | Reasonix `provider.go:78-150`                                  |
| ❌ "pi 用 TypeScript monorepo"              | ✅ **pi 是 4 包结构（pi-ai / pi-agent-core / pi-tui / pi-coding-agent）**，pi-mom 已迁出             | pi `packages/` 目录                                            |
| ❌ "str_replace 是 AI agent 编辑的标配"     | ✅ **oh-my-pi 用 hashline 实现 6.7% → 68.3% 的 10× 提升（仅换 patch 格式）**                         | oh-my-pi `README.md:43-46` + `packages/hashline/src/prompt.md` |
| ❌ "fork 知名项目是 5 月拿 10k star 的捷径" | ✅ fork 维护有 **upstream drift** 风险（issue #1736 实证）                                           | oh-my-pi issue #1736                                           |
| 🌟 ❌ "ECC 是 agent 本体"                   | ✅ **ECC 是"任何 agent 之上"的 operator 插件系统**（4.5 月 204k star）                               | ECC `README.md:46` + `agent.yaml:1-6`                          |
| 🌟 ❌ "skill 是 prompt 就行"                | ✅ **SKILL.md = YAML frontmatter + Markdown** 是革命性标准化（249 个 skill 互不污染）                | ECC `skills/agent-harness-construction/SKILL.md`               |
| 🌟 ❌ "agent 质量靠 review"                 | ✅ **4 维质量模型**（Action / Observation / Recovery / Context Budget）= 第一性原理                  | ECC `skills/agent-harness-construction/SKILL.md`               |
| 🌟 ❌ "verification 是手动的"               | ✅ **6 阶段 Verification Loop**（build / types / lint / tests / security / diff）+ 统一报告 = 自动化 | ECC `skills/verification-loop/SKILL.md`                        |

**v3 增量直接影响**：

- **Sprint 0 新增** SKILL.md 标准化目录（YAML frontmatter + 首批 3 个 skill）
- **Sprint 1 新增** Tool 返回 schema 统一（Observation 4 字段 + Recovery 3 字段）
- **v1.0 末新增** `/verify` slash command + VERIFICATION REPORT 格式
- **v2.0 Tier-1 落地** continuous-learning-v2 模式（instinct + confidence）

---

## 1. 六个项目真实技术栈一览

| 项目          | 语言                            | TUI                          | 桌面                              | 后端协议           | 沙箱                                      | Skill 格式                              | Star                 |
| ------------- | ------------------------------- | ---------------------------- | --------------------------------- | ------------------ | ----------------------------------------- | --------------------------------------- | -------------------- |
| **CodeWhale** | Rust                            | ratatui（推测）              | Tauri（规划）                     | axum HTTP+JSON-RPC | Seatbelt/Landlock/JobObject               | SKILL.md（对齐 Codex）                  | -                    |
| **Reasonix**  | **Go 1.25+**                    | **Charm Bubbletea v2**       | **Wails 2.12**                    | HTTP/SSE           | 无 OS 沙箱                                | .md + Anthropic Skills 兼容 4 目录      | -                    |
| **pi**        | TypeScript                      | Ink / 自家 TUI               | 无                                | JSON-RPC stdio     | 无                                        | SKILL.md frontmatter                    | 58.6k                |
| **Hermes**    | Python                          | textual                      | 无                                | 飞书/Telegram/邮件 | plugin 沙箱                               | 自由                                    | -                    |
| **oh-my-pi**  | **TS (54w 行) + Rust (27k 行)** | Ink + diff render            | 无（4 入口 TUI/one-shot/RPC/ACP） | NDJSON stdio / ACP | **4 后端自动** (APFS/btrfs/zfs/overlayfs) | .md + Claude/Cursor/Windsurf 7 平台继承 | **10,034** (5 月)    |
| **ECC** 🌟    | **Shell + TS + Markdown**       | 9 平台兼容层（不下沉到 TUI） | 无                                | 9 平台输出         | 无（plugin 不是 agent）                   | **SKILL.md YAML+MD（249 个）**          | **204,234** (4.5 月) |

**v3 结论**：

- **TypeScript 栈整体可行**（pi 已验证 58.6k stars）
- **桌面选 Tauri**（生态成熟，Wails Go 借鉴不动）
- **沙箱双轨**：短期抄 CodeWhale（Windows Job Object / macOS Seatbelt / Linux Landlock），长期参考 oh-my-pi 的 4 后端自动解析
- **Skills 格式抄 ECC 标准化**（YAML frontmatter + Markdown）+ 兼容 pi 现有 frontmatter
- **🌟 patch 格式抄 oh-my-pi hashline**（差异化关键）
- **🌟 v1.0 验收表抄 ECC 4 维质量模型**
- **🌟 v1.0 末加 `/verify` slash command 抄 ECC Verification Loop**
- **借鉴 oh-my-pi napi natives 思路**（grep / shell / ast 走 Rust 进程内）
- **借鉴 ECC continuous-learning-v2 模式**（v2.0 Tier-1）

---

## 2. 每个项目的关键可借鉴资产

### 2.6 ECC（affaan-m/ECC，v2.0.0-rc.1，4.5 月 204k star）🌟

| 资产                                                                         | 真实出处                                     | deepwhale 价值              |
| ---------------------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| **SKILL.md 格式**（YAML+MD）                                                 | `skills/<name>/SKILL.md`（249 个）           | **P0** — Sprint 0 标准化    |
| **4 维质量模型**                                                             | `skills/agent-harness-construction/SKILL.md` | **P0** — v1.0 验收表        |
| **Observation 4 字段 schema**（status / summary / artifacts / next_actions） | 同上                                         | **P0** — Sprint 1 tool 设计 |
| **Recovery 3 字段 schema**（root_cause_hint / safe_retry / stop_condition）  | 同上                                         | **P0** — Sprint 1 错误返回  |
| **6 阶段 Verification Loop**                                                 | `skills/verification-loop/SKILL.md`          | **P0** — v1.0 末 `/verify`  |
| **统一 VERIFICATION REPORT 格式**                                            | 同上                                         | **P0** — v1.0 末            |
| **agent.yaml 245 行 catalog**                                                | 顶层 manifest                                | P1 — v1.0 末                |
| **continuous-learning-v2**                                                   | `skills/continuous-learning-v2/`             | P1 — v2.0 Tier-1            |
| **rules-distill 思想**                                                       | `skills/rules-distill/`                      | P1 — v2.0 Tier-1            |
| **iterative-retrieval 子 agent 模式**                                        | `skills/iterative-retrieval/`                | P1 — v2.0 Tier-1            |
| **6 hook 类型**                                                              | `hooks/hooks.json`                           | P1 — Sprint 1 部分          |
| **19 语言 rules 结构**                                                       | `rules/<lang>/`                              | P2 — v1.5                   |
| **9 平台兼容层**（.claude/.codex/...）                                       | `scripts/codex/*` 等                         | **不做**（偏离主线）        |
| **ECC Pro 商业化**                                                           | Pro $19/seat + Sponsors                      | **不做**（单人项目）        |

---

## 3. 借鉴冲突仲裁（v3 含 ECC）

| 能力                | ECC                            | oh-my-pi                 | Reasonix    | pi                   | **deepwhale 决策**                                         |
| ------------------- | ------------------------------ | ------------------------ | ----------- | -------------------- | ---------------------------------------------------------- |
| 编辑格式            | str_replace（用 Claude Code）  | **hashline**             | str_replace | str_replace          | **跟 oh-my-pi（hashline）**                                |
| Skills 格式         | **SKILL.md YAML+MD（249 个）** | 0                        | .md         | SKILL.md frontmatter | **跟 ECC 标准化**（兼容 pi）                               |
| 4 维质量模型        | **4 维**                       | 0                        | 0           | 0                    | **v1.0 验收表**                                            |
| Verification        | **6 阶段**                     | benchmark（不同用途）    | 0           | 0                    | **v1.0 末 /verify**                                        |
| 沙箱                | 无（plugin 不是 agent）        | **4 后端自动**           | Docker      | 进程内               | **先 Windows Job Object（Sprint 2），后端自动留 Sprint 4** |
| 推理路由            | 无                             | 14 provider 链           | -           | 链                   | **不做 provider 链（v1 就 DeepSeek）**                     |
| 子 agent            | 63                             | typed schema             | 无          | 无                   | **v2.0 Tier-1 借鉴 iterative-retrieval**                   |
| TUI                 | 无                             | Ink + diff render        | Bubbletea   | Ink                  | **保持 Ink（已选）**                                       |
| 桌面                | 无                             | 无                       | Wails 2.12  | 无                   | **保留 Tauri（已选）**                                     |
| Browser             | 无                             | Puppeteer                | 无          | 无                   | **延后到 Sprint 5**                                        |
| LSP                 | 无                             | 13 ops + willRenameFiles | 无          | 13 ops               | **v1.5**                                                   |
| DAP                 | 无                             | 27 ops                   | 无          | 无                   | **不做**                                                   |
| 平台兼容            | 9 平台                         | 4 入口                   | -           | -                    | **只做 4 入口（TUI/one-shot/RPC/ACP）**                    |
| continuous-learning | v2                             | 0                        | 0           | 0                    | **v2.0 Tier-1**                                            |
| 编辑 benchmark      | 无                             | **6,554 行**             | 无          | 无                   | **P0 做自研**                                              |
| napi 原生层         | 无                             | **27k 行**               | 无          | 无                   | **Sprint 2 引入**（先 bun 子进程跑 grep 验证）             |
| 进程内 bash         | 无                             | **brush vendored**       | 无          | 无                   | **不做**（成本太高，留占位）                               |

---

## 4. 优化后的设计（v3）

### 技术栈终版

- **语言**：TypeScript（主） + Rust（hot path napi） + Markdown（skills）
- **运行时**：Bun 1.3+
- **TUI**：Ink 6 + 自家 diff render
- **桌面**：Tauri 2（v2 留 v3）
- **沙箱**：Windows Job Object（短期） + pi-iso 4 后端（长期）
- **Provider**：DeepSeek 直连（v1） + 14 provider 链（v3 留位）
- **Patch 格式**：**hashline 自研**（替代 str_replace）
- **Skill 格式**：**SKILL.md YAML+MD**（ECC 标准化，兼容 pi frontmatter）
- **Benchmark**：**自研 edit-benchmark harness**（差异化）
- **🌟 4 维质量模型**：v1.0 验收表
- **🌟 `/verify` slash command**：v1.0 末

### 关键模块划分

```
deepwhale/
├── packages/
│   ├── coding-agent/      # TUI + CLI
│   ├── hashline/          # 自研 patch 格式（oh-my-pi 借鉴）
│   ├── ai/                # provider
│   ├── tui/               # Ink diff render
│   ├── natives/           # napi 绑定
│   ├── utils/
│   └── skills/            # 🌟 SKILL.md 格式（ECC 借鉴）
│       ├── hashline/
│       │   └── SKILL.md
│       ├── coding-standards/
│       │   └── SKILL.md
│       └── verification-loop/
│           └── SKILL.md
├── crates/
│   ├── dw-natives/        # napi cdylib
│   ├── dw-ast/            # tree-sitter 包装
│   └── dw-iso/            # 沙箱后端解析
├── bench/
│   └── edit-benchmark/    # 自研 harness
└── docs/research/
    ├── 01_codewhale.md
    ├── 02_codex_browser.md
    ├── 03_reasonix.md
    ├── 04_pi.md
    ├── 05_hermes.md
    ├── 06_oh-my-pi.md
    ├── 07_ECC.md  ★ 新增
    └── MASTER_RESEARCH.md  ← 本文件（v3）
```

### 关键架构决策（v3 新增 🌟 标）

| 决策                           | 选择                                | 理由                                    |
| ------------------------------ | ----------------------------------- | --------------------------------------- |
| 编辑格式                       | **hashline（自研）**                | 10× 提升，仅换格式                      |
| 是否 fork pi-mono              | **不 fork**                         | upstream drift 风险（issue #1736 实证） |
| hot path 实现                  | **napi + Rust**                     | fork/exec 性能差                        |
| benchmark 来源                 | **自研**                            | 求职差异化、自证营销                    |
| 4 入口优先级                   | **TUI → one-shot → RPC → 跳过 ACP** | ACP 绑 Zed 协议，性价比低               |
| 进程内 bash                    | **不做**                            | brush vendored 成本太高                 |
| **🌟 Skill 格式**              | **SKILL.md YAML+MD**                | ECC 标准化 249 个 skill 验证            |
| **🌟 4 维质量模型**            | **v1.0 验收表**                     | ECC 第一性原理                          |
| **🌟 `/verify` slash command** | **v1.0 末**                         | 6 阶段流程 + VERIFICATION REPORT        |
| **🌟 9 平台兼容**              | **不做**                            | 偏离主线                                |
| **🌟 ECC Pro 商业化**          | **不做**                            | 单人项目                                |

---

## 5. Sprint 重新排序（v3）

| Sprint  | 原计划（v1）            | 优化后（v3 = ECC + oh-my-pi 借鉴）                                                  | 理由                          |
| ------- | ----------------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| 0       | 骨架（Ink + DeepSeek）  | 骨架 + **hashline 格式 MVP** ⭐ + **SKILL.md 标准化目录** 🌟                        | 提前卡位差异化（双借鉴）      |
| 1       | str_replace edit 工具   | **hashline 完整版 + Recovery 3-way** + **Tool 返回 schema 统一**（Obs 4 + Rec 3）🌟 | 行业瓶颈 10× + 4 维模型实现层 |
| 2       | TUI 完善 + RPC 占位     | TUI + **napi natives（grep/tokens/ast）**                                           | hot path 性能                 |
| 3       | LSP 集成                | LSP + **willRenameFiles**                                                           | 优于普通 rename               |
| 4       | 沙箱 Windows Job Object | **Windows + pi-iso 4 后端占位**                                                     | 长期多 OS                     |
| 5       | Browser                 | **edit benchmark 公开报告** + **`/verify` slash command** 🌟                        | 求职差异化 + ECC Verification |
| v1.0 末 | -                       | **`/verify` + VERIFICATION REPORT** 🌟                                              | 4 维模型 + Verification Loop  |
| v2.0    | Browser Agent           | **Memory Ranking + continuous-learning-v2** 🌟                                      | 借鉴 ECC v2 模式              |

---

## 6. 风险与未决项（v3 新增 🌟 标）

| 风险                                    | 等级      | 决策                                                        |
| --------------------------------------- | --------- | ----------------------------------------------------------- |
| hashline 写出来后 LLM 不会用            | 高 ⭐     | **prompt.md 完整翻译成中文 + 多示例**                       |
| napi build 跨平台麻烦                   | 中 ⭐     | **Sprint 2 先用 bun 子进程跑 grep 验证**                    |
| 借鉴 hashline 是否侵权                  | 低 ⭐     | MIT 协议，**注明来源 + 保留 © Can Bölük**                   |
| upstream drift（fork pi-mono）          | 已规避 ⭐ | **不 fork pi-mono 整套**                                    |
| **🌟 SKILL.md 格式过重**（v1.0 工具少） | 低        | **v1.0 至少用 frontmatter，body 简化**                      |
| **🌟 4 维模型执行成本**                 | 中        | **只用作 v1.0 验收表**，不强制每条规则都有对应代码          |
| **🌟 Verification Loop 增加 CI 时间**   | 中        | **跑并行**（build + types + lint + test + security + diff） |
| **🌟 Security scan 误报**               | 低        | **加白名单**（`*.test.ts` / `docs/`）                       |
| **🌟 ECC 9 平台兼容分散精力**           | **高**    | **明确不学**（深挖主线）                                    |
| **🌟 ECC 249 skills 是噪音**            | 低        | **不抄内容**，只抄格式                                      |

---

## 7. 关键文件路径速查（6 个项目）

| 项目       | 调研文件              | 关键源文件                                                                                        |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| CodeWhale  | `01_codewhale.md`     | `crates/tui/src/prompts/base.md` + `crates/tui/src/sandbox/{seatbelt,landlock}.rs`                |
| Codex      | `02_codex_browser.md` | （Tauri 桌面 + E2B cloud）                                                                        |
| Reasonix   | `03_reasonix.md`      | `provider.go:78-150` (SanitizeToolPairing)                                                        |
| pi         | `04_pi.md`            | `packages/{pi-ai,pi-agent-core,pi-tui,pi-coding-agent}/`                                          |
| Hermes     | `05_hermes.md`        | （通道 + plugin 沙箱）                                                                            |
| oh-my-pi   | `06_oh-my-pi.md`      | `packages/hashline/src/` + `crates/pi-natives/src/` + `packages/typescript-edit-benchmark/src/`   |
| **ECC** 🌟 | `07_ECC.md`           | `skills/agent-harness-construction/SKILL.md` + `skills/verification-loop/SKILL.md` + `agent.yaml` |

---

## 8. 一句话总结（v3）

> **v1 结论**：4 项目里 TypeScript 栈整体可行，深挖**沙箱 + Skills + 多 provider 链**。
>
> **v2 结论**：5 项目里 **oh-my-pi 用"自研 patch 格式 + napi natives + 自研 benchmark"3 件事在 5 个月内拿到 10k star**。
>
> **v3 结论**：6 项目里 **ECC 用"SKILL.md 标准化 + 4 维质量模型 + 6 阶段 Verification + 9 平台兼容"4 件事在 4.5 个月内拿到 204k star**。deepwhale 借鉴 ECC 的"**产品化哲学**"（不学 9 平台兼容，**学 SKILL.md 格式 + 4 维质量模型 + 6 阶段 Verification Loop**）。**不抄 ECC 的 249 skills 内容**，**只抄其格式与流程**。**不学 9 平台兼容 / 商业化 / 63 agents 完整角色**（偏离主线），但学"OSS 永远免费"价值观。
