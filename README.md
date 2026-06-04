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

纯 mock / 离线，**不会**调真实 LLM API。当前 191/191 绿。CI 必跑。

### Integration tests（真接 DeepSeek shim）

> **Sprint 1b.5 Step 3**（2026-06-04）：X3 mock-only 风险（`1b5-s2.5` meta-rule "test passed ≠ production works"）要求 1 个真接验证 Step 2.5 修的 `cache_hit_rate` / `cost_turn` 公式在真实响应上对得上。

**触发**：

```bash
# 一次性：把 key 写进 ~/.deepwhale/.env（**不**写进 repo 内 .env，**不**进 commit）
chmod 600 ~/.deepwhale/.env
# 在 ~/.deepwhale/.env 里放一行: DEEPSEEK_API_KEY=<你的 key>

# 跑测试的 shell 里临时把 key 注入 env（不**持久化**到 repo shell rc）
export $(grep -v '^#' ~/.deepwhale/.env | xargs)

# 跑 integration（默认 skip；要显式开）
INTEGRATION=1 corepack pnpm test
```

**Skip 行为**：

- `INTEGRATION !== 1` → 整个 integration test 文件 `it.skip`（**不**fail）
- `process.env.DEEPSEEK_API_KEY` 未设 → `it.skip`（提示"先 source `~/.deepwhale/.env`"）

**红线**（X1 b + X4 c 拍板，2026-06-04）：

1. **test 代码不直接读 `~/.deepwhale/.env` 文件** — 用户自己 `source` / `export`，key 通过 `process.env` 流动
2. **test 不接受 `apiKey` 选项** — 只能通过 `process.env['DEEPSEEK_API_KEY']`
3. **test 任何断言 / log 不含 key 字符串** — 防 `console.log(result)` 误打
4. **文件权限** — `~/.deepwhale/.env` 必须是 `mode 600`（用户责任）
5. **真接最小化** — 1 turn，prompt 模板 `"Reply with the single word: OK"`，model `deepseek-v4-flash`（单 turn < ¥0.001）

**当前覆盖**：

- `packages/llm/test/integration/deepseek-shim.test.ts` — DeepSeek V4 flash 1 turn 流式真接，验 `content` / `usage` / `cost_currency=CNY` / `cost_turn > 0` / `tokens_uncached=prompt_tokens`（无 cache）

**未覆盖**（留 Step 3.5+）：

- `cache_hit_rate > 0`（需要多 turn / 重复 prompt 触发 prefix cache）
- Anthropic shim（`baseURL=api.deepseek.com/anthropic`）真接 — 等 1b.5 Step 4 启动
- Tool loop 真接 — 等 Step 1c tool schema 转换

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
