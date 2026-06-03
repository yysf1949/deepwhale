# 🐋 deepwhale 总研究报告

> **整合 4 份深度调研：CodeWhale / Reasonix / pi / Hermes** + 一份 deepwhale 方案优化
> 生成时间：2026-06-02

---

## ⚠️ 4 份报告里**最颠覆的发现**

调研中**直接推翻了 3 个 deepwhale 原本设计假设**：

| 假设 | 真相 | 来源 |
|---|---|---|
| ❌ Reasonix 是 Node.js + Ink + Tauri | ✅ **Reasonix 1.0+ 是 Go + Bubbletea + Wails** | Reasonix `go.mod:1` `desktop/wails.json:1-19` |
| ❌ "CodeWhale 4 遍 tool-call repair" | ✅ **不是 4 遍，是 1 个 `SanitizeToolPairing` 函数处理 4 种 pairing cases** | Reasonix `provider.go:78-150` |
| ❌ "pi 用 TypeScript monorepo" | ✅ **pi 是 4 包结构（pi-ai / pi-agent-core / pi-tui / pi-coding-agent）**，pi-mom 已迁出 | pi `packages/` 目录 |

**直接影响**：
- deepwhale 原本想照搬 Reasonix 的"TS + Ink"——**栈全错位**
- 借鉴清单需要按真实代码路径重写

---

## 1. 四个项目真实技术栈一览

| 项目 | 语言 | TUI | 桌面 | 后端协议 | 沙箱 | Skill 格式 |
|---|---|---|---|---|---|---|
| **CodeWhale** | Rust | ratatui（猜测，待查） | Tauri（规划） | axum HTTP+JSON-RPC | Seatbelt/Landlock/JobObject | SKILL.md（对齐 Codex） |
| **Reasonix** | **Go 1.25+** | **Charm Bubbletea v2** | **Wails 2.12** | HTTP/SSE | 无 OS 沙箱 | .md + Anthropic Skills 兼容 4 目录 |
| **pi** | TypeScript | Ink / 自家 TUI | 无 | JSON-RPC stdio | 无 | SKILL.md frontmatter |
| **Hermes** | Python | textual | 无 | 飞书/Telegram/邮件 | plugin 沙箱 | 自由 |

**结论**：**TypeScript 栈整体可行**（pi 已验证 58.6k stars），**桌面选 Tauri**（生态成熟，Wails Go 借鉴不动），**沙箱抄 CodeWhale**（Rust 唯一选择），**Skills 格式抄 Codex + pi 双兼容**。

---

## 2. 每个项目的关键可借鉴资产（每条带真实代码出处）

### 2.1 CodeWhale（Hmbown/CodeWhale，v0.8.50，17 crates）

| 资产 | 真实出处 | deepwhale 价值 |
|---|---|---|
| **Constitution 9 层权威** | `crates/tui/src/prompts/base.md`（297 行全文） | **P0** — 直接抄结构，注入 system prompt |
| **沙箱分层** | `crates/execpolicy/`（bash 白名单 729 行） + `crates/tui/src/sandbox/{seatbelt,landlock}.rs` | **P0** — 双层沙箱架构 |
| **macOS Seatbelt 完整实现** | `crates/tui/src/sandbox/seatbelt.rs`（695 行） | **P0** — 完整 sandbox-exec 包装 |
| **Linux Landlock + bwrap 回退** | `crates/tui/src/sandbox/landlock.rs`（358 行，**实际 marker-only**）+ `bwrap.rs` | **P0** — 双回退策略 |
| **路径迁移兼容** | `~/.deepseek/` → `~/.codewhale/` | **P0** — deepwhale 起步就要做好 `~/.deepwhale/` 路径 |
| **飞书桥** | `integrations/feishu-bridge/`（@codewhale/feishu-bridge） | **P0** — 直接抄 SDK 接入模式 |
| **app-server 双协议** | `crates/app-server/src/{main,lib}.rs`（axum HTTP+JSON-RPC） | **P0** — Hermes channel 接入方案 |
| **CORS 白名单** | `tauri://localhost` 已在 allowlist | **P0** — Tauri 客户端对接清单 |
| **Skills MD 格式** | `crates/tui/assets/skills/*/SKILL.md` | **P0** — 完全对齐 Codex 开放标准 |
| **Feishu skill 内置** | `crates/tui/assets/skills/feishu/SKILL.md` | **P1** — 写中文 skill 的参考模板 |
| **prompt/ 分层** | `crates/tui/src/prompts/{approvals,modes,personalities}/` | **P1** — 多人格 / 多模式 / 审批策略 |

**CodeWhale 自己的坑（避免重蹈）**：
- v0.8.50 中文输入法控制序列泄露（issue #2592）
- Windows shell 沙箱初始化失败（issue #2589）—— **Windows 沙箱暂只做 Job Object process-tree containment，不假装有 Filesystem/Network 隔离**
- Landlock 是"marker only"—— deepwhale 不要学"假实现"哲学，要么真做要么不做

### 2.2 Reasonix（esengine/DeepSeek-Reasonix，1.0+ Go 重写，6000+ stars）

| 资产 | 真实出处 | deepwhale 价值 |
|---|---|---|
| **Cache-stable system prompt 一次组装** | `boot.go:120-148` | **P0** — 每个 session 只跑一次，session ID 缓存 |
| **`content: ""` 永远序列化**（不带 omitempty） | `openai.go:354-368` | **P0** — 防 wire-level 缓存 hash 变化 |
| **Reasoning content 不重传到 wire** | `openai.go:131-137` | **P0** — DeepSeek V4 thinking tokens 不打 wire |
| **Schema canonicalize** | `schema_canonicalize.go:10-67` | **P0** — tool schema key 顺序稳定 |
| **Compaction = 唯一 cache-reset point** | `compact.go:16-20` | **P0** — 任何改 system prompt 都 review 缓存策略 |
| **StormBreaker（避免死循环）** | `agent.go:690-729` `(tool, error)` 签名 + `stormBreakThreshold=3` | **P0** — 关键反 AI 死循环 |
| **SanitizeToolPairing（4 种 pairing）** | `provider.go:78-150`（**1 个函数 4 cases**，不是 4 遍） | **P0** — 必须理解 4 种 case 一次性处理 |
| **4 个内建 subagent skill** | explore / research / review / security_review | **P1** — context-heavy work 的内置 subagent |
| **Skills 4 约定目录** | `.reasonix/ .agents/ .agent/ .claude` | **P1** — 用户从其他 agent 迁 skill 无缝 |
| **Skills 索引 4KB 硬上限** | `index.go:10` `IndexMaxChars = 4000` | **P1** — names+descriptions 进 system prompt，body 按需 |
| **Hook trust flag 不在项目里** | `~/.config/<tool>/trust.json` | **P1** — 关键安全设计 |
| **Hook 语义** | exit 0=pass, exit 2=block, other=warn | **P1** — 直接抄 |
| **单 transport-agnostic controller** | `app.go:46-68` | **P1** — TUI/web/桌面共享 controller |
| **Wails 嵌套 module + replace 模式** | `desktop/go.mod:1-9` | **P2** — 如果做桌面参考 |
| **CodeGraph（tree-sitter）** | `boot.go:202-230` | **P2** — 后期做长上下文代码检索 |
| **makeCross 一键全平台** | `Makefile` | **P2** — 如果坚持单二进制 |

**Reasonix 自己的坑（避免重蹈）**：
- `memory.indexLinesExcept` 截断首行（#2778 open，未修）—— deepwhale 抄 memory 索引要测"首行不被吞"
- HTTP/SSE 会话恢复 + 压缩 + 重连三件套边界 case（#2750 open）—— web frontend 时优先处理
- 1.0.0 release 6 周仍未发（CHANGELOG.md:7）—— deepwhale 起步就把 release 节奏拉前
- "4 遍 tool-call repair" 误解—— 直接看 `SanitizeToolPairing` 的 4 cases
- v1 TS → v2 Go 断崖式重写代价大—— deepwhale 选型阶段想清楚栈

### 2.3 pi（earendil-works/pi，v0.78，58.6k stars，4 包）

| 资产 | 真实出处 | deepwhale 价值 |
|---|---|---|
| **4 包分层** | `packages/{pi-ai, pi-agent-core, pi-tui, pi-coding-agent}/` | **P0** — deepwhale 4 包对齐 |
| **EventBus 包装** | `core/event-bus.ts:1-33`（30 行 wrapper） | **P0** — 直接抄 |
| **defineTool 零运行时** | `core/extensions/types.ts:491-495` | **P0** — 5 行类型守卫 |
| **ExtensionEvent 联合类型** | `core/extensions/types.ts:959-981`（21 个事件） | **P0** — 改前缀为 `whale.*` |
| **4 种运行模式** | interactive / print / rpc / sdk | **P0** — 命名建议改 `library`（不与 SDK 包重名） |
| **PackageManager `npm:` 前缀解析** | `core/package-manager.ts:1380-1403` | **P0** — 正则 `/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/` |
| **资源优先级 4 档** | `core/package-manager.ts:161-177` | **P0** — project/local < project/auto < user/local < user/auto < package |
| **JSONL append-only DAG session** | `core/session-manager.ts:46-145` | **P0** — `parentId + leafId` + `loadEntriesFromFile` 重建 |
| **Compaction 钩子化** | `core/compaction/compaction.ts:644-876` + `examples/extensions/custom-compaction.ts` | **P0** — `session_before_compact` 钩子让 extension 完全替换默认 |
| **jiti 动态加载** | `core/extensions/loader.ts:331-547` | **P1** — Python 等价 `importlib.util` |
| **manifest 字段在 package.json** | `core/extensions/loader.ts:440-458` | **P1** — deepwhale: `pyproject.toml` 的 `[tool.deepwhale]` |
| **Skill = SKILL.md frontmatter** | `core/skills.ts:74-275` | **P1** — name/description 必填 + 长度校验 |
| **registerProvider 装载期 queue** | `core/extensions/types.ts:1257-1260` | **P1** — bind runner 后 flush |
| **RPC 模式 pendingExtensionRequests** | `modes/rpc/rpc-mode.ts:79-82` | **P1** — 无 TTY 时让上游 client 接管弹窗 |
| **跨 extension events 命名空间** | `core/extensions/runner.ts:325` | **P1** — `whale:event-name` channel |
| **`.npmrc` 供应链加固** | `--ignore-scripts` + `min-release-age=2` | **P1** — deepwhale 用 uv → `UV_NO_INSTALL=1` |
| **50+ 官方扩展示例** | `packages/coding-agent/examples/extensions/` | **P1** — 抄 3-5 个作 docs 范例 |

**pi 自己的坑（避免重蹈）**：
- v0.75.4 跨包类型回归（#4908）—— 4 包同步版本要 CI 化
- extension tool 重名 abort（#5316）—— deepwhale 启动时做重名检测
- TUI 弹窗阻塞快捷键（#4429）—— 异步弹窗协议

### 2.4 Hermes（NousResearch/hermes-agent，2026.5.7-476，本地开发版）

| 资产 | 真实出处 | deepwhale 价值 |
|---|---|---|
| **多渠道 channel 模式** | `gateway/platforms/{feishu,telegram,email}.py` | **P0** — 飞书/Telegram/邮件桥 |
| **Plugins 机制** | `hermes-agent/plugins/` | **P0** — 跟 Extension 互补 |
| **MEMORY + library 分层** | `~/.hermes/{MEMORY.md, memories/library/}` | **P0** — 短期 / 长期记忆分层 |
| **Context 压缩** | session-archiver 插件 | **P0** — 跟 Reasonix compaction 对齐 |
| **i18n `from agent.i18n import t`** | 踩坑：原 `gateway.i18n` 错导致 footer 英文 | **P0** — i18n 路径在第一行就定对 |
| **hot-reload mtime 检测在 wrapper 内部** | response-footer 插件 | **P1** — 如果做 plugin hot reload |
| **post 强制策略** | `gateway/platforms/feishu.py:4308-4317` `_build_outbound_payload` | **P1** — 飞书 markdown 渲染经验 |
| **No_agent cron watchdog 模式** | cronjob no_agent=True | **P1** — 定时任务模式 |

**Hermes 自己的坑（避免重蹈）**：
- response-footer 插件 hot-reload mtime 检测必须在 wrapper 内部（不是 register 内）
- i18n 路径错导致永远英文 fallback
- 表格 markdown 在飞书不渲染——要强制走 post payload

---

## 3. 借鉴冲突仲裁（同一能力，多家不同方案）

| 能力 | CodeWhale | Reasonix | pi | **deepwhale 决策** |
|---|---|---|---|---|
| **TUI 框架** | ratatui（Rust） | Bubbletea v2（Go） | 自家 Ink 模式 | **Ink**（TypeScript 栈） |
| **桌面** | Tauri（规划） | Wails | 无 | **Tauri 2.x** |
| **沙箱** | Seatbelt/Landlock/JobObject | 无 | 无 | **Rust 沙箱**（CodeWhale 抄） + 白名单 shell |
| **Skills 格式** | SKILL.md（Codex 标准） | 4 目录 + .md | SKILL.md frontmatter | **SKILL.md 兼容 Codex + pi** |
| **Prefix-cache** | 未实测 | 4 大机制 | 未涉及 | **Reasonix 4 大机制全抄** |
| **Compaction** | 有，未深读 | cache-reset point | 钩子化 | **pi 的钩子化 + Reasonix 的 cache-aware** |
| **Hook 语义** | 有，未深读 | exit 0/2/other | 21 个事件 | **pi 事件名 + Reasonix 退出码语义** |
| **飞书桥** | `@codewhale/feishu-bridge` | 无 | 无 | **CodeWhale 抄 SDK 模式** |
| **Channel 抽象** | 飞书桥单一 | 无 | 无 | **Hermes 多渠道 + CodeWhale 飞书** |
| **StormBreaker 防死循环** | 无 | ✅ 3 次阈值 | 无 | **抄 Reasonix** |
| **JSONL session DAG** | JSONL 持久化 | JSONL | JSONL DAG | **pi DAG（最强）** |
| **Schema canonicalize** | 无 | ✅ | 无 | **抄 Reasonix** |

---

## 4. deepwhale 优化后的设计（基于 4 份报告）

### 4.1 技术栈终版

```
语言：        TypeScript (strict) + Node ≥ 22
TUI：         Ink（React 19 终端渲染，pi 验证）
桌面：        Tauri 2.x（生态成熟）
沙箱：        Rust + napi-rs（CodeWhale 抄）
MCP：         官方 SDK
Skill 格式：  SKILL.md 对齐 Codex 开放标准
配置：        TOML（CodeWhale 验证）
Memory：      MEMORY.md（短期） + library/（长期）抄 Hermes
Session：     JSONL append-only DAG（pi 抄）
Compaction：  钩子化 + cache-aware（pi + Reasonix）
```

### 4.2 4 包 monorepo（对齐 pi）

```
deepwhale/
├── packages/
│   ├── llm/           # @deepwhale/llm    — 多 provider 客户端（DeepSeek/OpenAI/Anthropic/自定义）
│   ├── agent-core/    # @deepwhale/agent  — 事件总线 + 工具注册 + 沙箱桥 + 缓存经济
│   ├── tui/           # @deepwhale/tui    — Ink 渲染层
│   └── coding-agent/  # @deepwhale/cli    — 产品层 = llm + agent-core + tui
```

### 4.3 21 个核心 ExtensionEvent（pi 改前缀 `whale.*`）

```typescript
// 直接抄 pi 的 events/types.ts:959-981，改前缀
type ExtensionEvent =
  // Session lifecycle
  | "whale.session_start"
  | "whale.session_shutdown"
  | "whale.session_before_compact"
  | "whale.session_after_compact"
  | "whale.session_before_tree"
  | "whale.session_tree"
  // Message events
  | "whale.user_message"
  | "whale.assistant_message_start"
  | "whale.assistant_message_end"
  | "whale.message_end"
  // Tool events
  | "whale.tool_call"
  | "whale.tool_result"
  // Hooks
  | "whale.pre_tool_use"
  | "whale.post_tool_use"
  | "whale.user_prompt_submit"
  | "whale.stop"
  // LLM events
  | "whale.llm_request"
  | "whale.llm_response"
  // Skills / Memory
  | "whale.skill_load"
  | "whale.memory_read"
  | "whale.memory_write";
```

### 4.4 Prefix-cache 4 大机制（Reasonix 全抄）

1. **System prompt 一次组装** — `composeSystemPrompt()` 每个 session 只跑一次，按 session ID 缓存
2. **`content: ""` 永远序列化**（不带 omitempty）— 防 wire-level 缓存 hash 变化
3. **Reasoning content 不打 wire** — DeepSeek V4 thinking tokens 在 session 内部保留，wire 上不传
4. **Schema canonicalize** — tool schema build 前跑 `CanonicalizeSchema`，map 顺序稳定
5. **Compaction 是唯一 cache-reset point** — 任何改 system prompt 都 review 缓存策略

### 4.5 沙箱双层（CodeWhale 抄）

```
第一层：白名单 shell（execpolicy）
  - 路径白名单 + 命令白名单
  - TimeLimit 30s 默认
  - 输出 ≤ 4000 bytes
  - 跨平台统一

第二层：Rust OS 沙箱（napi-rs 桥）
  - macOS: Seatbelt（sandbox-exec）
  - Linux: Landlock（kernel 5.13+） + bwrap 回退
  - Windows: Job Object process-tree containment（明确文档不假撑 Filesystem/Network 隔离）
```

### 4.6 Channel 多渠道（Hermes + CodeWhale 飞书）

```
channels/
├── feishu/      # @codewhale/feishu-bridge（抄 CodeWhale SDK 模式）
├── telegram/    # 抄 Hermes inline keyboard
├── email/       # 抄 Hermes IMAP 监听
└── weixin/      # 微信（用户场景特殊）
```

### 4.7 StormBreaker（Reasonix 抄）

```typescript
// 3 次相同 (tool, error_signature) 触发暂停 + 用户确认
// 避免 model 死循环改 args 改不改实质
const STORM_BREAK_THRESHOLD = 3;
```

### 4.8 路径与兼容

- 主路径：`~/.deepwhale/`
- 向后兼容字段（如果未来改名）：自动 read 旧路径 fallback
- Skills 4 约定目录（兼容 Reasonix / Codex / pi）：
  - `./.deepwhale/skills/`
  - `./.agents/skills/`
  - `~/.deepwhale/skills/`
  - `~/.claude/skills/`（如果用户从 Claude Code 迁）

---

## 5. Sprint 重新排序（基于研究结论）

| Sprint | 原计划 | 优化后 | 理由 |
|---|---|---|---|
| **Sprint 0** | 选型 + monorepo 骨架 | **不变** | 4 包结构是基础 |
| **Sprint 1** | MVP 核心 | **+ 前缀缓存 4 大机制**（提前） | Sprint 1 多轮对话就会触发 cache，机制必须早 |
| **Sprint 2** | 扩展平台 | **+ StormBreaker + SanitizeToolPairing** | 防死循环在工具增多时是 P0 |
| **Sprint 3** | MCP + Computer Use | **+ Rust 沙箱先做 macOS/Linux** | Windows 明确 Job Object only，文档不假撑 |
| **Sprint 4** | 多渠道 | **+ Hermes 经验：i18n 路径在第一行就定对** | Hermes response-footer 教训 |
| **Sprint 5** | 自动化 + 打磨 | **+ 强制 release 节奏**（避免 Reasonix 1.0 6 周未发） | 早期用户能 install 比完美重要 |

**新增 Sprint 6（可选）**：Hermes-like 长期记忆 + 跨 session 知识沉淀

---

## 6. 风险与未决项

| 风险 | 等级 | 决策 |
|---|---|---|
| **Wails vs Tauri 选择** | 中 | **选 Tauri**（Rust 生态 + CodeWhale 规划） |
| **prefix-cache 严格度** | 中 | **DeepSeek-only 模式启用全部 4 机制**；多 provider 模式禁用机制 3/4（OpenAI 不适用） |
| **Windows 沙箱不完整** | 中 | **明文文档：Windows only Job Object process-tree containment，不假撑 FS/Network** |
| **Compaction 与 DAG 复杂度** | 中 | **Sprint 1 用线性 session，Sprint 5 加 DAG 树** |
| **社区 extension 安全** | 高 | **Skills 默认只读，permissions 显式声明**（抄 Reasonix Hook trust flag 模式） |
| **飞书 table 渲染** | 中 | **强制走 post payload**（Hermes 验证，message_id=om_x100b6ee7c17cfca0c2d94a6a3087ac5） |
| **Hermes footer 数字收敛 bug 教训** | 低 | **多个字段同值时去冗余/加标签区分**，用户视角 = bug |

---

## 7. 关键文件路径速查（4 个项目）

```
CodeWhale:
  Constitution 9 层权威:  crates/tui/src/prompts/base.md (297 行)
  沙箱抽象:              crates/tui/src/sandbox/mod.rs (934 行)
  macOS Seatbelt:        crates/tui/src/sandbox/seatbelt.rs (695 行)
  Linux Landlock:        crates/tui/src/sandbox/landlock.rs (358 行)
  Bash 白名单:           crates/execpolicy/src/lib.rs (729 行)
  app-server HTTP:       crates/app-server/src/{main,lib}.rs
  Skills assets:         crates/tui/assets/skills/*/SKILL.md
  飞书桥:                integrations/feishu-bridge/

Reasonix:
  Cache-stable boot:     boot.go:120-148
  content 永远序列化:     openai.go:354-368
  reasoning 不重传:      openai.go:131-137
  Schema canonicalize:   schema_canonicalize.go:10-67
  Compaction:            compact.go:16-20, 271-289
  StormBreaker:          agent.go:690-729
  SanitizeToolPairing:   provider.go:78-150
  Skills 加载:           skill.go:154-156
  Skills 索引 4KB:       index.go:10
  Subagent 工具:         tools.go:60-88
  Memory:                memory.go:79-82, 154-163
  Hook trust:            trust.go:9-14
  Hook 语义:             hook.go:31-54, 272-288

pi:
  4 包结构:              packages/{pi-ai, pi-agent-core, pi-tui, pi-coding-agent}/
  EventBus:              core/event-bus.ts:1-33
  defineTool:            core/extensions/types.ts:491-495
  ExtensionEvent:        core/extensions/types.ts:959-981
  4 模式:                modes/{print-mode.ts, rpc/rpc-mode.ts, interactive/, core/sdk.ts}
  PackageManager:        core/package-manager.ts:1380-1403, 161-177
  Session DAG:           core/session-manager.ts:46-145
  Compaction:            core/compaction/compaction.ts:644-876
  范例 extension:        examples/extensions/custom-compaction.ts:20-126
  Skill = SKILL.md:      core/skills.ts:74-275

Hermes:
  飞书:                  gateway/platforms/feishu.py
  Telegram:              gateway/platforms/telegram.py
  Plugins:               hermes-agent/plugins/
  MEMORY:                ~/.hermes/MEMORY.md
  library:               ~/.hermes/memories/library/
  response-footer 教训:  插件猴子补丁拦截 GatewayRunner._run_agent
  i18n 路径教训:         from agent.i18n import t（不是 gateway.i18n）
  post 强制策略:         gateway/platforms/feishu.py:4308-4317
```

---

## 8. 一句话总结

> **deepwhale = pi 的 4 包 monorepo + pi 的 Extension API + Reasonix 的 prefix-cache 4 大机制 + Reasonix 的 StormBreaker + CodeWhale 的 Rust 沙箱（macOS Seatbelt + Linux Landlock + bwrap） + CodeWhale 的 Constitution 9 层权威 + CodeWhale 的飞书桥 SDK 模式 + Hermes 的多渠道 + Hermes 的 MEMORY/library 分层 + Codex 的 Skills 开放标准**。

**最大警示**：
1. **不要照搬 Reasonix 的 Go 栈**（已验证 TypeScript 栈可行）
2. **不要假撑 Windows 沙箱**（明文只做 Job Object）
3. **不要忘了 Compaction 是 cache-reset point**
4. **不要忘了 StormBreaker 防死循环**（3 次阈值 + (tool, error) 签名）
5. **i18n 路径第一行定对**（Hermes 教训）

---

**总报告完。下一步：修订 README.md + 重写 ROADMAP.md。**
