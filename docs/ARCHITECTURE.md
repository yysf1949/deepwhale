# 🏛 deepwhale 终极架构

> **核心变更（vs 初版）**：
> 1. **锁定 4 层架构**（LLM / Agent / Runtime / UI）
> 2. **锁定 5 阶段版本锚**（v1.0 = Claude Code Lite，v1.5 = Codex Clone，v2.0 = +Browser，v3.0 = +Computer Use，v4.0 = Agent OS）
> 3. **明确砍掉清单**：8 项延后到 vN（详见末节"砍掉清单"）
> 4. **单人开发 13 个月节奏**（10 周 v1.0 在单人情况下是 scope explosion 后的 90% 失败概率——**已弃**）

## 1. 项目定位

**deepwhale 是一个完全基于 DeepSeek 的 AI Agent Operating System。**

目标（按版本锚分阶段交付）：

| 阶段 | 版本 | 目标能力 | 等价于 |
|---|---|---|---|
| Phase 1 | v1.0 | Claude Code Lite | Claude Code 替代品 |
| Phase 2 | v1.5 | Codex Clone | 一比一复刻 Codex Client |
| Phase 3 | v2.0 | +Browser Agent | 加上 Browser Use |
| Phase 4 | v3.0 | +Computer Use | 加上 Computer Use |
| Phase 5 | v4.0 | Agent OS | MCP + Skills + Plugins + Multi-Agent + Desktop |

**核心原则**：

1. **先成为 Claude Code 替代品**（v1.0），再成为 Agent Operating System（v4.0）
2. **CLI 优先，Desktop 其次**（v4.0 之前的 UI 形态只有 CLI + TUI）
3. **不直接复制其它项目，只吸收成熟设计**（详见 §3 技术来源映射）

---

## 2. 4 层架构

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer（v1 = CLI + TUI；v4 = +Desktop）                    │
│  CLI │ TUI (Ink) │ Desktop (Tauri, v4) │ Web (v4)            │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Agent Layer（核心）                                            │
│  Planner │ Executor │ Reviewer │ Researcher                   │
│  MemoryManager │ ToolRouter │ SessionManager                 │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Runtime Layer                                                 │
│  Tool Runtime │ Plugin Runtime │ MCP Runtime                  │
│  Browser Runtime (v2) │ Computer Runtime (v3) │ Sandbox       │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  LLM Layer                                                     │
│  ModelProvider（v1 = DeepSeek only；v1.x = +OpenAI/Claude/...）│
│  Prefix Cache 4 大机制 │ StormBreaker │ SanitizeToolPairing   │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 LLM Layer

**职责**：模型适配

**v1.0 只支持**：DeepSeek（V4-Flash 默认，V4-Pro `/pro` 升级）

**v1.x 起扩展**：OpenAI / Anthropic / Gemini / 自定义 OpenAI-compatible

**统一接口**：`ModelProvider`（参考 pi `pi-ai/` 抽象）

**核心机制**（**v1 必带**，deepwhale 核心优势）：
- **Prefix-cache 4 大机制**（Reasonix 全抄）
  - 机制 1：System prompt 一次组装（按 session ID 缓存）
  - 机制 2：`content: ""` 永远序列化（防 wire-level hash 变化）
  - 机制 3：Reasoning content 不打 wire（DeepSeek thinking tokens session 内保留）
  - 机制 4：Schema canonicalize（map 顺序稳定）
- **StormBreaker 防死循环**（Reasonix 抄，**Sprint 2 工具增多后 P0**）
- **SanitizeToolPairing**（Reasonix 抄，**1 个函数 4 cases**）

### 2.2 Agent Layer

**职责**：核心 agent 循环

**v1.0 包含**（单 Agent）：
- **Executor**（必需）
- **ToolRouter**（必需）
- **SessionManager**（必需，v1 = Linear Session）

**v1.5 起扩展**：
- **Planner**（基础规划）
- **MemoryManager**（Short/Long/Summary 三层）

**v4.0 起扩展**（完整 Multi-Agent）：
- **Researcher**
- **Reviewer**
- **完整 Planner-Researcher-Executor-Reviewer 流水线**

### 2.3 Runtime Layer

**v1.0 包含**：
- **Tool Runtime**（bash 白名单 + 6 个核心工具）
- **Plugin Runtime**（v1.0 暂不开 runtime，Extension API 优先）
- **Sandbox Runtime**（v1.0 = **Docker only**，详见 §4 砍掉清单）

**v1.5 起扩展**：
- **Plugin Runtime**（`.dwp` 格式）

**v2.0 起扩展**：
- **MCP Runtime**（stdio / http / sse 动态注册）
- **Browser Runtime**（Playwright + 统一 API：navigate/click/type/extract/screenshot/download/upload）

**v3.0 起扩展**：
- **Computer Runtime**（mouse_move/mouse_click/keyboard_input/keyboard_hotkey/screen_capture/window_control）

### 2.4 UI Layer

**v1.0 包含**：
- **CLI**（`interactive` / `print` / `rpc` 三种模式）
- **TUI**（Ink 渲染）

**v4.0 起扩展**：
- **Desktop**（Tauri 2.x，**v4.0 之前不做**）
- **Web**（v4.0 可选，**默认不做**）

---

## 3. 技术来源映射

> 原则：**不直接复制其它项目，只吸收成熟设计**

### 3.1 DeepSeek-TUI
**吸收**：
- TUI 交互模式
- Streaming UI
- Terminal UX

**不吸收**：
- 业务逻辑

### 3.2 DeepSeek-Reasonix
**吸收**：
- Prefix Cache 4 大机制
- Tool Pairing（SanitizeToolPairing）
- Prompt Sanitizer
- StormBreaker 防死循环
- 4 个 Skills 约定目录
- Hook 退出码语义
- Skills 索引 4KB 硬上限
- Compaction = 唯一 cache-reset point

**不吸收**：
- DeepSeek 耦合实现
- Go 栈（**不抄 Wails**）
- **编译为独立的 CacheProvider 抽象**（TS 接口，与 DeepSeek 解耦）

### 3.3 Hermes
**吸收**：
- Plugin System
- Memory 三层分层
- Event Bus
- **Hermes 踩坑经验**（避免重蹈）：
  - i18n 路径第一行定对
  - hot-reload mtime 检测必须在 wrapper 内部
  - 飞书 markdown 强制走 post payload（v4.0 起需要时）
  - footer 数字收敛时去冗余/加标签区分

**不吸收**（**砍掉清单 §4**）：
- 多渠道（飞书/Telegram/Discord/邮件/微信）——**v1-v3 全砍**
- v4.0 重新评估

### 3.4 Pi-Agent
**吸收**：
- Session（v1 = Linear，**DAG 延后到 v2.x**）
- Extension API（`defineTool` 零运行时 + 21 个 `whale.*` 事件）
- Event Architecture
- 4 包 monorepo 分层
- 4 种运行模式
- PackageManager 正则

**不吸收**：
- 复杂工作流
- **Session DAG 砍掉**（v1 = Linear Session）

### 3.5 Codex
**吸收**（**v1.5 起 100% 复刻**）：
- Skills 开放标准
- Approval System
- Task Mode
- Browser（v2.0 加上）
- Computer Use（v3.0 加上）
- Cron Automations（v1.5）
- Remote TUI（v1.5）

**目标**：v1.5 达到 **14/14 Codex 功能对齐**

### 3.6 OpenHands
**参考**（v4.0）：
- Multi-Agent 流水线设计
- Runtime 抽象

**不吸收**：
- Docker 沙箱（**deepwhale 走 Docker，不学 OpenHands 的复杂 Runtime**）

### 3.7 CodeWhale
**借鉴教训**（**不抄实现**）：
- Constitution 9 层权威——**v1 砍掉**（个人化产物，不适合 deepwhale）
- 双层沙箱架构思路——**降级为 Docker only**
- Windows 沙箱 Job Object 假撑——**不抄，明确不假撑**

---

## 4. 砍掉清单（v1.0 - v3.0 不做）

| # | 砍掉项 | 原计划 Sprint | 砍掉原因 | 重新评估时机 |
|---|---|---|---|---|
| 1 | 飞书 channel | Sprint 4 | 渠道割裂，单人不必要 | v4.0 |
| 2 | Telegram channel | Sprint 4 | 同上 | v4.0 |
| 3 | Discord channel | Sprint 4 | 同上 | v4.0 |
| 4 | Email channel | Sprint 4 | 同上 | v4.0 |
| 5 | 微信 channel | Sprint 4 | 同上 | v4.0 |
| 6 | macOS Seatbelt 沙箱 | Sprint 3 | 跨平台维护成本 | 永远不做（v1 用 Docker） |
| 7 | Linux Landlock 沙箱 | Sprint 3 | 同上 | 永远不做（v1 用 Docker） |
| 8 | Windows Job Object 沙箱 | Sprint 3 | 同上 | 永远不做（v1 用 Docker） |
| 9 | Session DAG | Sprint 1 | v1 过度复杂 | v2.x |
| 10 | Constitution 9 层权威 | Sprint 1 | 个人化产物 | 永远不做 |
| 11 | Desktop（Tauri） | Sprint 4 | v1-v3 没必要 | v4.0 |
| 12 | Web UI | Sprint 4 | 同上 | v4.0（可选） |
| 13 | Mobile | 从未规划 | 单人不做 | 不评估 |
| 14 | Plugin Marketplace | Sprint 5 | v1.x 不需要 | v1.5 |
| 15 | 文档站（VitePress） | Sprint 5 | v1.x README 够 | v1.5 |
| 16 | LSP 集成 | Sprint 3 | v1 不必要 | v1.5 |
| 17 | Compaction | Sprint 5 | v1 不需要 | v1.5 |
| 18 | Cross-session 知识图谱 | Sprint 6 | v1 不需要 | v2.0 |

---

## 5. 5 阶段版本锚

### Phase 1 — v1.0 Claude Code Lite（3 个月）

**目标**：能替代 Claude Code 完成日常 coding 任务

**交付清单**：
- 4 包 monorepo（`@deepwhale/llm` / `@deepwhale/agent-core` / `@deepwhale/tui` / `@deepwhale/coding-agent`）
- LLM Layer：DeepSeek V4-Flash/Pro（OpenAI 兼容客户端）
- **Prefix-cache 4 大机制**（**v1 必带，deepwhale 核心优势**）
- Agent Layer：单 Executor + ToolRouter + SessionManager（**Linear Session**）
- Runtime Layer：Tool Runtime（6 个核心工具）+ Docker Sandbox
- UI Layer：CLI（interactive/print/rpc）+ TUI（Ink）
- 5 轮后 cache 命中率 ≥ 90%

**验收标准**：
- 能跟 DeepSeek V4 多轮对话
- 能编辑本地文件 + 跑 shell（白名单内）
- 二次启动自动恢复会话
- 单 turn cost ≤ $0.05

**v1.0 不做**：MCP / Browser / Computer / Plugins / Skills / Desktop / 渠道 / DAG / Compaction

### Phase 2 — v1.5 Codex Clone（2 个月）

**目标**：100% Codex Client 复刻

**交付清单**：
- Approval System（Codex 抄）
- Task Mode（Codex 抄）
- Skills 系统（**对齐 Codex 开放标准**）
- Extension API + 21 个 `whale.*` 事件
- Hooks（5 事件 + Reasonix 退出码语义）
- **StormBreaker** + **SanitizeToolPairing**（**工具增多后 P0**）
- Cron Automations（4 模板）
- Remote TUI（WebSocket）
- Compaction（v1.5 = **cache-reset point 唯一**）

**验收标准**：
- **Codex 14/14 功能对齐**
- 装 1 个社区 skill 能用
- 写 1 个 30 行 Extension 注册自定义工具
- 每周一 minor release，**v1.5 第 5 个月必发**

**v1.5 不做**：MCP / Browser / Computer / Desktop / 渠道 / DAG / Plugin Marketplace

### Phase 3 — v2.0 Browser Agent（2 个月）

**目标**：能自动开网页、填表、截图

**交付清单**：
- **MCP Runtime**（stdio / http / sse 动态注册）
- **Browser Runtime**（Playwright + 统一 API：navigate/click/type/extract/screenshot/download/upload）
- Plugin 打包（`.dwp` 格式）
- Session DAG（**从 v1 Linear 升级**）
- MemoryManager（Short/Long/Summary 三层）

**验收标准**：
- 装好 Playwright MCP 后能自动开网页填表截图
- Browser Runtime 6 个核心 API 全部跑通
- Session DAG 跨分支不丢消息

### Phase 4 — v3.0 Computer Use（3 个月）

**目标**：能操控电脑 GUI

**交付清单**：
- **Computer Runtime**（mouse_move/mouse_click/keyboard_input/keyboard_hotkey/screen_capture/window_control）
- Computer Use 跑在 Docker sandbox 内
- Compaction 钩子化（让 extension 完全替换默认）

**验收标准**：
- 在 sandbox 内能开指定应用、点击、输入
- Compaction 后 token 下降 70% 但语义保留

### Phase 5 — v4.0 Agent OS（3 个月）

**目标**：完整 Agent Operating System

**交付清单**：
- **完整 Multi-Agent**：Planner / Researcher / Executor / Reviewer 流水线
- **Plugin Marketplace**（npm `@deepwhale/` 命名空间）
- **Desktop**（Tauri 2.x）+ **Web**（可选）
- **Channels**（飞书 / Telegram / Discord / Email，重新评估清单）
- 文档站（VitePress）

**验收标准**：
- 4 个 Agent 角色协同跑通
- 桌面 GUI 跑起来
- 文档站上线

---

## 6. 时间锚

| Phase | 版本 | 时长 | 累计 | 核心交付 |
|---|---|---|---|---|
| Phase 1 | v1.0 | 3 个月 | 3 个月 | Claude Code Lite |
| Phase 2 | v1.5 | 2 个月 | 5 个月 | Codex Clone 14/14 |
| Phase 3 | v2.0 | 2 个月 | 7 个月 | +Browser Agent |
| Phase 4 | v3.0 | 3 个月 | 10 个月 | +Computer Use |
| Phase 5 | v4.0 | 3 个月 | **13 个月** | Agent OS |

**单人开发 13 个月节奏**（vs 初版 10 周 90% 失败）→ **完成概率预估 70%**

---

## 7. 关键架构决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 主语言 | **TypeScript（Node ≥ 22）** | pi 验证，**不抄 Reasonix Go 栈** |
| TUI 框架 | **Ink**（React 19） | pi 实战验证 |
| 桌面 | **Tauri 2.x**（v4.0） | 生态成熟，**v4.0 之前不做** |
| 沙箱（v1） | **Docker only** | 跨平台一致 + 单人可维护 |
| 分发 | npm + Homebrew + Docker | 跟 pi/Codex/Reasonix 一致 |
| 配置 | TOML | CodeWhale 验证 |
| Skills 格式 | **对齐 Codex 开放标准** | 跨工具复用 |
| 4 包 monorepo | **对齐 pi** | 复用 pi 社区经验 |
| ExtensionEvent | **21 个 `whale.*` 事件**（v1.5） | 跟 pi 兼容但区分内/外 |
| MCP | 官方 SDK（v2.0） | 唯一标准 |
| Release 节奏 | **每周一 minor**（v1.5 起） | 避免 Reasonix 1.0 6 周未发 |
| i18n 路径 | **第 1 行定对** | Hermes 教训 |
| License | MIT | 全家桶都是 MIT |

---

## 8. 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| DeepSeek API 限流 | 中 | 前缀缓存降耗 + Flash/Pro 智能路由 |
| **Scope explosion 风险** | **高** | **本架构就是为压制这个风险**——5 阶段版本锚 + 砍掉清单 18 项 |
| 单人开发 burnout | 中 | Phase 之间预留 1 周缓冲期 |
| Skills 安全 | 高 | Skills 默认只读 + `permissions:` 显式声明 + Hook trust flag |
| 跨 Phase 时间拖延 | 中 | **强制 release 节奏**：每个 Phase 末尾必发版本 |
| Docker 沙箱冷启动慢 | 低 | Phase 1 接受，Phase 3 优化 |
| Browser Runtime 跨浏览器一致 | 中 | Playwright 抽象足够，**不做自定义协议** |
| Computer Use OS 差异 | 高 | v3.0 主要验证 macOS + Linux X11，Windows v3.0 不做 |

---

## 9. 文档关系

- **本文件** ARCHITECTURE.md：4 层架构 + 5 阶段版本锚 + 砍掉清单（**架构与版本骨架**）
- **ROADMAP.md**：5 阶段的 Sprint 任务清单（**执行细节**，与本文件版本锚一致）
- **README.md**：项目对外介绍（一句话定位 = v1.0 = Claude Code Lite）
- **docs/research/**：5 份深度调研（**设计来源**，不随版本变）

---

**最后更新**：2026-06-03（确立 4 层架构 + 5 阶段版本锚，砍掉 18 项延后事项）
**当前阶段**：Phase 1 Sprint 0（4 包 monorepo + 基础设施）
**下次更新**：v1.0 release 时
