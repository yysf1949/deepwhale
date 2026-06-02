# 🐋 deepwhale

> **DeepSeek-first AI coding client. 复刻 Codex 全功能 + 借鉴 4 大开源项目深度优化设计。**

[![Status](https://img.shields.io/badge/status-MVP-yellow)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-green)]()

## 一句话定位

**deepwhale = pi 的 4 包 monorepo + pi 的 Extension API + Reasonix 的 prefix-cache 4 大机制 + Reasonix 的 StormBreaker + CodeWhale 的 Rust 沙箱 + CodeWhale 的 Constitution 9 层权威 + CodeWhale 的飞书桥 + Hermes 的多渠道 + Hermes 的 MEMORY/library 分层 + Codex 的 Skills 开放标准**。

## 为什么需要 deepwhale

| 现状 | 痛点 | deepwhale 解决 |
|---|---|---|
| OpenAI Codex CLI 绑定 GPT 模型 | DeepSeek 用户难用 | ✅ **DeepSeek-first**（V4-Flash 默认，V4-Pro `/pro` 升级） |
| Claude Code 闭源、模型绑定 Anthropic | 不可定制 | ✅ MIT 开源，模型可换 |
| CodeWhale 偏 Rust 极客，无扩展平台 | 难以二次开发 | ✅ **借鉴 pi 的 4 包 monorepo + Extension API** |
| Reasonix Go 栈入门门槛高 | 社区贡献难 | ✅ **TypeScript 栈**（借鉴 Reasonix prefix-cache 4 机制，**不抄 Go 栈**） |
| pi 缺 OS 级沙箱 | 安全风险 | ✅ **借鉴 CodeWhale Rust 沙箱**（macOS Seatbelt + Linux Landlock + bwrap） |
| Hermes 多渠道但不是 coding agent | 渠道割裂 | ✅ 复用 Hermes channel 模式（飞书/Telegram/邮件/微信） |

## 核心特性（v1.0 目标）

- 🐋 **DeepSeek 优先**：V4-Flash 默认（prefix-cache 99% 命中，单 turn $0.05 以内），V4-Pro `/pro` 升级
- ⚡ **Prefix-cache 4 大机制**（Reasonix 全抄）：system prompt 一次组装 + `content: ""` 永序列化 + reasoning content 不打 wire + schema canonicalize
- 🛡 **StormBreaker 防死循环**（Reasonix 抄）：3 次相同 `(tool, error)` 签名触发暂停
- 🛡 **双层沙箱**（CodeWhale 抄）：白名单 shell + Rust OS 级（macOS Seatbelt / Linux Landlock + bwrap / Windows Job Object）
- 📜 **Constitution 9 层权威**（CodeWhale 抄）：7 Articles + Statutes + Regulations，注入 system prompt
- 🔌 **pi Extension API**：21 个 `whale.*` 事件 + `defineTool` 零运行时 + 4 种运行模式
- 🧠 **多模型切换**：DeepSeek / OpenAI / Anthropic / 自定义 OpenAI-compatible
- 🌐 **MCP 一等公民**：client + server
- 🖥 **Tauri 桌面**（生态成熟，CodeWhale 已规划）+ **多渠道 channel**（Hermes 飞书/Telegram/邮件 + CodeWhale 飞书桥 SDK 模式）
- ⏰ **Cron Automations**（Codex 复刻）：定时任务（日报、code review、test runner）
- 💾 **JSONL append-only DAG Session + 钩子化 Compaction**（pi 抄）

## 快速开始（开发版，预览）

```bash
git clone https://github.com/yysf1949/deepwhale.git
cd deepwhale
pnpm install
echo "DEEPSEEK_API_KEY=***" > .env
pnpm dev
```

## 4 包 Monorepo 结构（对齐 pi）

```
deepwhale/
├── packages/
│   ├── llm/           # @deepwhale/llm    — 多 provider 客户端
│   ├── agent-core/    # @deepwhale/agent  — 事件总线 + 工具注册 + 沙箱桥 + 缓存经济
│   ├── tui/           # @deepwhale/tui    — Ink 渲染层
│   └── coding-agent/  # @deepwhale/cli    — 产品层 = llm + agent-core + tui
└── docs/
    └── research/      # 4 份深度调研报告
```

## 路线图

详见 [ROADMAP.md](./ROADMAP.md) —— **基于 4 份调研深度优化**（10 周从 0 到 v1.0，含 StormBreaker / Schema canonicalize / Windows 沙箱明文 Job Object only 等关键决策）。

详细调研见 [docs/research/MASTER_RESEARCH.md](./docs/research/MASTER_RESEARCH.md)。

## 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  Channels（Hermes 借鉴 + CodeWhale 飞书桥 SDK）                │
│  CLI  │ Tauri 桌面 │ 飞书 │ Telegram │ 邮件 │ 微信 │ Web UI    │
└─────────────────────────┬────────────────────────────────────┘
                          ↓ 统一 JSON-RPC（CodeWhale app-server 模式）
┌──────────────────────────────────────────────────────────────┐
│  packages/coding-agent（产品层 = llm + agent-core + tui）    │
│  4 模式: interactive / print / rpc / library                 │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  packages/agent-core                                         │
│  EventBus │ Tools Registry │ Extension API │ Skills           │
│  Hooks    │ Sandbox 桥 │ StormBreaker │ Compaction 钩子化     │
│  21 个 whale.* 事件 │ JSONL append-only DAG Session          │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  packages/llm（多 provider + prefix-cache 4 大机制）          │
│  DeepSeek V4-Flash/Pro │ OpenAI │ Anthropic │ 自定义          │
│  Cache: 一次组装 + content 永序列 + reasoning 不重传 + schema │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Rust 沙箱（CodeWhale 抄）                                      │
│  macOS Seatbelt │ Linux Landlock + bwrap │ Windows Job Object │
└──────────────────────────────────────────────────────────────┘
```

## 技术栈终版

- **主语言**：TypeScript（strict）+ Node ≥ 22
- **包管理**：pnpm workspace + Turborepo
- **TUI**：Ink（React 19 终端渲染，pi 验证 58.6k stars）
- **桌面**：Tauri 2.x（生态成熟，CodeWhale 已规划）
- **沙箱**：Rust + napi-rs（CodeWhale 抄）
- **MCP**：`@modelcontextprotocol/sdk` 官方
- **Skills 格式**：对齐 [Codex Agent Skills 开放标准](https://developers.openai.com/codex/skills)
- **配置**：TOML（`~/.deepwhale/config.toml`，CodeWhale 验证）

## 致谢 / 灵感来源（基于 4 份深度调研）

deepwhale 站在以下开源项目肩膀上，每条都标注**真实代码出处**：

### 🦀 [Hmbown/CodeWhale](https://github.com/Hmbown/CodeWhale)（v0.8.50，17 crates，Rust）

- **Constitution 9 层权威** — 抄结构，注入 system prompt
  - 出处：`crates/tui/src/prompts/base.md:1-297`
- **双层沙箱** — 抄架构
  - 出处：`crates/execpolicy/src/lib.rs:1-729`（白名单 shell）+ `crates/tui/src/sandbox/{seatbelt,landlock}.rs`
- **飞书桥 SDK 模式** — 抄 `@codewhale/feishu-bridge`
  - 出处：`integrations/feishu-bridge/`（`@larksuiteoapi/node-sdk`）
- **app-server 双协议**（axum HTTP + JSON-RPC） — 抄多渠道接入方案
  - 出处：`crates/app-server/src/{main,lib}.rs`

### 🐹 [esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)（1.0+ Go 重写，6000+ stars）

> ⚠️ Reasonix 1.0+ 是 **Go + Bubbletea + Wails**，**不是 Node + Ink + Tauri**。deepwhale **不抄 Go 栈**，只抄机制。

- **Prefix-cache 4 大机制** — **全抄**（deepwhale 核心优势）
  - 出处：`boot.go:120-148` + `openai.go:354-368` + `openai.go:131-137` + `schema_canonicalize.go:10-67`
- **Compaction = 唯一 cache-reset point** — 抄
  - 出处：`compact.go:16-20`
- **StormBreaker 防死循环** — **全抄**（3 次阈值 + (tool, error) 签名）
  - 出处：`agent.go:690-729`
- **SanitizeToolPairing（4 种 pairing cases）** — 抄 1 个函数，理解 4 cases
  - 出处：`provider.go:78-150`
- **Skills 4 约定目录** — 抄（`.deepwhale/ .agents/ .agent/ .claude`）
  - 出处：`skill.go:154-156`
- **Hook 语义**（exit 0=pass, exit 2=block, other=warn） — 抄
  - 出处：`hook.go:31-54, 272-288`
- **Skills 索引 4KB 硬上限** — 抄
  - 出处：`index.go:10`

### 🐬 [earendil-works/pi](https://github.com/earendil-works/pi)（v0.78，58.6k stars，TypeScript 4 包）

- **4 包 monorepo 分层** — **对齐**
  - 出处：`packages/{pi-ai, pi-agent-core, pi-tui, pi-coding-agent}/`
- **EventBus 包装**（30 行 try/catch 隔离） — 抄
  - 出处：`core/event-bus.ts:1-33`
- **defineTool 零运行时**（5 行类型守卫） — 抄
  - 出处：`core/extensions/types.ts:491-495`
- **21 个 ExtensionEvent** — 改前缀 `whale.*`
  - 出处：`core/extensions/types.ts:959-981`
- **4 种运行模式**（interactive / print / rpc / sdk） — 改 `library`（不与 SDK 包重名）
  - 出处：`modes/{print-mode.ts, rpc/rpc-mode.ts, interactive/, core/sdk.ts}`
- **PackageManager `npm:` 前缀解析** — 抄正则
  - 出处：`core/package-manager.ts:1380-1403`
- **资源优先级 4 档** — 抄
  - 出处：`core/package-manager.ts:161-177`
- **JSONL append-only DAG Session** — 抄
  - 出处：`core/session-manager.ts:46-145`
- **Compaction 钩子化** — 抄
  - 出处：`core/compaction/compaction.ts:644-876` + `examples/extensions/custom-compaction.ts:20-126`
- **Skill = SKILL.md frontmatter** — 抄
  - 出处：`core/skills.ts:74-275`

### 🦮 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（v2026.5.7-476，本地开发版）

- **多渠道 channel 模式** — 复用（飞书/Telegram/邮件/微信）
  - 出处：`gateway/platforms/{feishu,telegram,email}.py`
- **Plugins 机制** — 跟 Extension 互补
  - 出处：`hermes-agent/plugins/`
- **MEMORY + library 分层** — 抄
  - 出处：`~/.hermes/{MEMORY.md, memories/library/}`
- **Context 压缩**（session-archiver 插件） — 跟 Reasonix compaction 对齐
- **Hermes 踩坑经验**（避免重蹈）：
  - **i18n 路径第一行定对**（`from agent.i18n import t`，不是 `gateway.i18n`）
  - **hot-reload mtime 检测必须在 wrapper 内部**（不是 register 内）
  - **飞书 markdown 强制走 post payload**（表格不渲染，message_id=om_x100b6ee7c17cfca0c2d94a6a3087ac5）
  - **footer 数字收敛时去冗余/加标签区分**（用户视角 = bug，不要辩护语义）

### 📜 [OpenAI Codex CLI](https://github.com/openai/codex) — 要复刻的功能基线

- Computer Use / Browser MCP / Skills / Plugins / Automations / 14 项全功能（详见 ROADMAP.md §14/14 对照表）

## 贡献

项目处于早期 MVP 阶段，**欢迎任何形式的参与**：提 issue、PR、写 skill / extension、文档改进。

详见 [ROADMAP.md](./ROADMAP.md) 当前 Sprint。

## License

[MIT](./LICENSE)
