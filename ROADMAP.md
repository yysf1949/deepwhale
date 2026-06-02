# 🗺 deepwhale ROADMAP（基于 4 份深度调研优化版）

> **5+1 个 Sprint，10 周，从 0 到 v1.0**
> **核心变化**（vs 初版）：
> 1. **Prefix-cache 4 大机制从 Sprint 5 提到 Sprint 1**（多轮对话立即触发 cache）
> 2. **新增 StormBreaker 到 Sprint 2**（工具增多后是 P0）
> 3. **Windows 沙箱明文只做 Job Object**（避免 CodeWhale "假撑" 教训）
> 4. **新增 Sprint 6：Hermes 长期记忆层**（跨 session 知识沉淀）
> 5. **i18n 路径在 Sprint 0 第一行定对**（Hermes 教训）

## 总览

| Sprint | 周次 | 主题 | 关键交付 | 状态 |
|---|---|---|---|---|
| **Sprint 0** | 第 1 周前 3 天 | 4 包 monorepo + 路径/i18n/配置基础设施 | `pnpm dev` 跑通最小 CLI | 🚧 进行中 |
| **Sprint 1** | 第 1-2 周 | MVP 核心 + **Prefix-cache 4 大机制提前** | DeepSeek 多轮 + 6 工具 + Session DAG + **cache 99% 命中** | ⏳ 待开始 |
| **Sprint 2** | 第 3-4 周 | 扩展平台 + **StormBreaker + SanitizeToolPairing** | Skills + Extension + Hooks + **防死循环** | ⏳ 待开始 |
| **Sprint 3** | 第 5-6 周 | Rust 沙箱（macOS/Linux/Windows 文档明确） + MCP + Computer Use | 双层沙箱 + Browser MCP + 截图/键鼠 | ⏳ 待开始 |
| **Sprint 4** | 第 7-8 周 | 多渠道 + 桌面 + 远程（app-server 模式） | Tauri GUI + 飞书/TG/邮件 + Remote TUI | ⏳ 待开始 |
| **Sprint 5** | 第 9-10 周 | 自动化 + 打磨 + **强制 release 节奏** | Cron + Session 分享 + Compaction 钩子化 + **v1.0 release** | ⏳ 待开始 |
| **Sprint 6**（可选） | 第 11-12 周 | Hermes-like 长期记忆 + 跨 session 知识沉淀 | MEMORY.md + library/ + 知识图谱 | ⏳ 可选 |

---

## Sprint 0：4 包 monorepo + 基础设施（3 天）

**目标**：`pnpm dev` 跑通最小 CLI，调用 DeepSeek V4-Flash 流式输出"hello"。**第 1 行代码就定对路径、i18n、配置**。

### 任务清单

- [ ] **建 GitHub 仓库** `yysf1949/deepwhale`（Private）✅
- [ ] **建 4 包 monorepo**（对齐 pi）
  - `packages/llm/` — 多 provider 客户端
  - `packages/agent-core/` — 事件总线 + 工具 + 沙箱桥 + 缓存
  - `packages/tui/` — Ink 渲染
  - `packages/coding-agent/` — 产品层 = llm + agent-core + tui
- [ ] **pnpm workspace + Turborepo**
- [ ] **配置基础设施**（**第 1 天就定对**）：
  - 路径：`~/.deepwhale/`（**首行写死 + 旧路径 fallback 模式**——避免 CodeWhale `~/.deepseek/` → `~/.codewhale/` 重命名教训）
  - i18n：`from agent.i18n import t`（**第 1 行就定对**——Hermes 教训：原 `gateway.i18n` 错导致永远英文）
  - 配置：`~/.deepwhale/config.toml`（zod 校验，CodeWhale 验证）
  - Skills 4 约定目录：`.deepwhale/skills/`、`.agents/skills/`、`~/.deepwhale/skills/`、`~/.claude/skills/`
- [ ] **`@deepwhale/llm` OpenAI 兼容客户端**
- [ ] **`@deepwhale/coding-agent` 最小 CLI 入口**
- [ ] **CI：GitHub Actions**（lint + typecheck + 基础测试 + 4 包版本同步）

### 验收标准

```bash
$ pnpm dev
deepwhale> hello
🤖 你好！我是 deepwhale 🐋，当前模型 deepseek-v4-flash
deepwhale>
```

### ⚠️ Sprint 0 红线（避免 Sprint 1 翻工）

- **i18n 路径第 1 行定对**（Hermes 教训）
- **路径迁移兼容机制**写好（CodeWhale 教训）
- **4 包版本同步 CI**（pi #4908 教训）

---

## Sprint 1：MVP 核心 + Prefix-cache 4 大机制（2 周）

**目标**：能跟 DeepSeek 多轮对话、编辑本地文件、跑 shell 命令、二次启动恢复会话。**5 轮后 cache 命中率 ≥ 90%**。

### 任务清单

- [ ] **DeepSeek 接入**（`@deepwhale/llm`）
  - OpenAI 兼容客户端
  - 流式响应（SSE）
  - 错误重试 + 限流退避
- [ ] **⚡ Prefix-cache 4 大机制**（**Reasonix 全抄，deepwhale 核心优势**）
  - **机制 1：System prompt 一次组装** — `composeSystemPrompt()` 每个 session 只跑一次，按 session ID 缓存（`boot.go:120-148`）
  - **机制 2：`content: ""` 永远序列化**（不带 omitempty）— 防 wire-level 缓存 hash 变化（`openai.go:354-368`）
  - **机制 3：Reasoning content 不打 wire** — DeepSeek V4 thinking tokens 在 session 内部保留，wire 上不传（`openai.go:131-137`）
  - **机制 4：Schema canonicalize** — tool schema build 前跑 `CanonicalizeSchema`，map 顺序稳定（`schema_canonicalize.go:10-67`）
  - **加 regression test**：4 个机制都加 unit test
  - **加 cache 可观测性**：控制台实时显示 `cache_hit_rate` + `cost/turn`
- [ ] **Tool Registry**：内置 6 个核心工具
  - `bash`（白名单 shell）
  - `read_file` / `write_file` / `edit_file`（hash 锚定）
  - `grep` / `find`
- [ ] **3 种运行模式**（CodeWhale 借鉴，先做 3 种）
  - `interactive`（默认，TUI）
  - `print`（`deepwhale -p "..."` 一次性）
  - `rpc`（JSON-RPC over stdio）
- [ ] **JSONL append-only DAG Session**（pi 抄）
  - `parentId + leafId` 的 DAG 形态
  - 每条 entry 立即 `appendFileSync`
  - 崩溃后 `loadEntriesFromFile` 重建
- [ ] **Constitution 9 层权威**（CodeWhale 抄）
  - 抄结构，注入 system prompt
  - 7 Articles + Statutes + Regulations
  - 写明不抄 CodeWhale 的"Brother Whale"个人化（避免神化/宗教化倾向）

### 验收标准

- 能跟 DeepSeek V4-Flash 多轮对话（10 轮上下文连贯）
- 能编辑本地文件 + 跑命令（白名单内）
- 二次启动自动恢复上次会话
- **5 轮后 `cache_hit_rate ≥ 90%`**（Reasonix 经济性指标）
- 单 turn cost ≤ $0.05
- Prefix-cache 4 大机制都有 unit test

### ⚠️ Sprint 1 红线

- **Compaction 还没做，但任何 system prompt 修改要走"cache-reset point review"**（Reasonix 教训）
- **Cache miss 时不要报错**——未知就显示"unknown"（CodeWhale 教训）

---

## Sprint 2：扩展平台 + StormBreaker（2 周）

**目标**：装 1 个社区 skill 就能用，写 1 个 30 行 Extension 注册自定义工具。**带 StormBreaker 防死循环**。

### 任务清单

- [ ] **🛡 StormBreaker 防死循环**（Reasonix 抄，**工具增多后是 P0**）
  - 3 次相同 `(tool, error)` 签名触发暂停 + 用户确认
  - **关键：用 (tool, error) 签名，不用 args 签名**（`agent.go:690-729` 实战观察："a stuck model reworks the arguments cosmetically while failing identically"）
  - 加 unit test：模拟死循环场景
- [ ] **🛡 SanitizeToolPairing**（Reasonix 抄，**1 个函数 4 cases**）
  - 4 种 pairing case：orphan assistant tool_call、orphan tool_result、重复 tool_call、tool_result 不匹配
  - **理解 4 cases 一次性处理，不是"4 遍"**（Reasonix 误解纠偏）
  - 加 unit test：每种 case 单独测
- [ ] **Skills 系统**（对齐 Codex Skills 开放标准 + pi Skills 借鉴）
  - 目录：`./.deepwhale/skills/`、`<project>/.agents/skills/`、`~/.deepwhale/skills/`、`~/.claude/skills/`
  - 格式：`SKILL.md` + YAML frontmatter（`name` / `description` / `triggers`）
  - **索引硬上限 4KB**（Reasonix 抄）— names+descriptions 进 system prompt，body 按需
  - 内置 3 个示范：commit / test / review-pr
- [ ] **EventBus 包装**（pi 抄）
  - 30 行 wrapper，try/catch 隔离（一个 extension 抛错不阻塞后续）
  - **21 个 `whale.*` ExtensionEvent 联合类型**（pi 改前缀）
- [ ] **Extension API**（pi 借鉴，**最关键**）
  - `defineTool({ name, description, parameters, execute })` —— **零运行时，5 行类型守卫**（pi `types.ts:491-495`）
  - 21 个事件：`whale.session_start` / `whale.tool_call` / `whale.tool_result` / `whale.message_end` / `whale.session_before_compact` / ...
- [ ] **Hooks**（5 事件 + Reasonix 退出码语义）
  - `pre_tool_use` / `post_tool_use` / `user_prompt_submit` / `stop` / `session_start`
  - 退出码：exit 0=pass, exit 2=block, other=warn
  - **Hook trust flag 不在项目里**（`~/.deepwhale/trust.json`，Reasonix 抄）
- [ ] **Package Manager**（pi 抄）
  - 解析 `whale:` / `git:` / 本地路径
  - 正则 `/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/`
  - 资源优先级 4 档：project/local < project/auto < user/local < user/auto < package
- [ ] **Plugin 打包**（`.dwp` 格式，类似 `.vsix`）

### 验收标准

- 装 1 个社区 skill 能用
- 写 1 个 30 行 Extension 注册自定义工具
- 装 1 个带 hooks 的 plugin，hook 真的触发
- **StormBreaker 测出死循环场景能暂停**（unit test 通过）
- **SanitizeToolPairing 4 种 case 都能处理**（4 个 unit test 通过）
- 打包 1 个 `.dwp` 文件能跨机安装

### ⚠️ Sprint 2 红线

- **Extension tool 重名启动时检测**（pi #5316 教训）
- **Hook payload 走 JSON on stdin**（Reasonix 抄）
- **Extension manifest 在 package.json**（pi 抄）/ deepwhale 用 `pyproject.toml` 的 `[tool.deepwhale]`

---

## Sprint 3：Rust 沙箱 + MCP + Computer Use（2 周）

**目标**：装 Playwright MCP 后能自动开网页填表，Computer Use 能在 sandbox 内操控 GUI。**Rust 沙箱**双层。

### 任务清单

- [ ] **🛡 Rust 沙箱**（CodeWhale 抄，**双层架构**）
  - **第一层：白名单 shell**（`crates/execpolicy/` 等价 TS 实现）
    - 路径白名单 + 命令白名单
    - TimeLimit 30s 默认
    - 输出 ≤ 4000 bytes
  - **第二层：Rust OS 沙箱**（napi-rs 桥）
    - **macOS Seatbelt**：完整 sandbox-exec 包装（CodeWhale `seatbelt.rs:1-695` 全抄）
    - **Linux Landlock + bwrap 回退**（CodeWhale `landlock.rs` 是 marker-only，**deepwhale 要做真实现**或用 bwrap）
      - 优先 bwrap（如 `/usr/bin/bwrap` 存在，issue #2184 模式）
      - 兜底 Landlock（kernel 5.13+）
    - **Windows Job Object process-tree containment** —— **明文文档：只做 process-tree，不假撑 FS/Network/AppContainer 隔离**（CodeWhale `mod.rs:14-15` 教训）
- [ ] **MCP 完整支持**（官方 SDK + Reasonix 借鉴）
  - client：stdio / SSE / Streamable HTTP
  - server：让 deepwhale 自己也作为 MCP server 暴露（`deepwhale serve --mcp`）
  - 配置：`~/.deepwhale/mcp.json`
- [ ] **Browser MCP**（Codex 复刻点 1）
  - 集成 `@playwright/mcp` 开箱即用
  - 截图 + 元素 click + 表单填写 + JS evaluate
- [ ] **Computer Use**（Codex 复刻点 2）
  - 截图工具（`screenshot`）：跨平台
  - 输入工具（`mouse_move` / `mouse_click` / `keyboard_type`）：跨平台
  - **OS 沙箱保护**（CodeWhale 借鉴）：鼠标键盘限制在窗口内
- [ ] **LSP 集成**（CodeWhale 借鉴，可选）
  - rust-analyzer / pyright / tsserver 实时诊断
  - 编译错误当自我纠正信号

### 验收标准

- 装好 Playwright MCP 后，能自动打开网页、填表、截图
- Computer Use 能在 sandbox 内操控指定应用
- **Rust 沙箱 macOS 测：能跑 `rm -rf /` 但被 Seatbelt 拦截**
- **Linux 沙箱测：能跑 `/etc/shadow` 读但被 Landlock 拦截**
- **Windows 沙箱测：能跑 `taskkill /im explorer.exe /f` 但被 Job Object 拦截进程树逃逸**
- LSP 报错能自动反馈给模型

### ⚠️ Sprint 3 红线

- **Windows 沙箱文档明文写"不假撑"**（CodeWhale 教训）
- **Linux Landlock 不要学 CodeWhale "marker only"**（要么真做要么不做）
- **Rust 沙箱跑在独立进程**（napi-rs IPC），不影响主进程性能

---

## Sprint 4：多渠道 + 桌面 + 远程（2 周）

**目标**：飞书发消息给 bot，CLI 看到任务入队；Tauri 桌面 GUI 能跑；关闭 GUI 后任务继续。

### 任务清单

- [ ] **Channels**（Hermes 借鉴 + CodeWhale 飞书桥 SDK）
  - **飞书**：抄 `@codewhale/feishu-bridge` SDK 模式（`@larksuiteoapi/node-sdk`）
    - **强制走 post payload**（Hermes 教训：表格不渲染，message_id=om_x100b6ee7c17cfca0c2d94a6a3087ac5）
    - bot 消息 → RPC 投递 → 流式回写
  - **Telegram**：inline keyboard 确认 / 取消
  - **邮件**：IMAP 监听，主题做指令
  - **微信**：用户场景特殊，按需
- [ ] **Tauri 桌面客户端**（CodeWhale 借鉴规划）
  - 多 tab 会话
  - 右侧 panel 显示 agent 读/改过的文件
  - 底部 cost / cache / token meters
  - 复用 `coding-agent` SDK 启动
  - **CORS 白名单 `tauri://localhost`**（CodeWhale `app-server/lib.rs:22-31` 抄）
- [ ] **Web UI**（可选）：浏览器访问 `localhost:7331`
- [ ] **Remote TUI**（Codex 复刻点 3 + CodeWhale app-server 模式）
  - `deepwhale serve --http` 暴露 `/v1/*`（CodeWhale axum HTTP+JSON-RPC 抄）
  - 远端 TUI 通过 WebSocket 连接
- [ ] **单 transport-agnostic controller**（Reasonix 抄）
  - TUI / web / 桌面 / 飞书全部走同一 controller
  - 业务逻辑只写一次

### 验收标准

- 飞书发消息给 bot，能在 CLI 看到任务入队 + 流式回写
- **飞书 markdown 表格实测能渲染**（强制 post payload 验证）
- Tauri 桌面 GUI 跑起来，多 tab 切换不丢状态
- 关闭桌面 GUI 后，后台 task 继续跑
- 远端 TUI 通过 WebSocket 连

### ⚠️ Sprint 4 红线

- **Hermes i18n 教训**：i18n 路径在 Sprint 0 已定对，但 channel 翻译要测一遍
- **Hermes footer 教训**：多渠道 footer 字段不要同值收敛
- **Hermes hot-reload 教训**：channel 插件如果支持 hot reload，mtime 检测必须在 wrapper 内部

---

## Sprint 5：自动化 + 打磨 + 强制 release 节奏（2 周）

**目标**：装好 daily-report automation，每天早上 9 点自动生成报告推到飞书。**v1.0 release 真正发出来**（避免 Reasonix 1.0 6 周未发教训）。

### 任务清单

- [ ] **Cron Automations**（Codex 复刻点 4）
  - `~/.deepwhale/automations/*.yaml` 定义定时任务
  - 模板：daily-report / code-review / test-runner / dep-update
  - **no_agent watchdog 模式**（Hermes 抄）：脚本自跑，省 token
- [ ] **Session 分享**（pi 借鉴）
  - `deepwhale share <session-id>` → 公开 URL
  - HTML 渲染 + 敏感信息脱敏
- [ ] **Compaction 钩子化**（pi 抄 + Reasonix cache-aware）
  - **Compaction = 唯一 cache-reset point**（Reasonix 抄）
  - `session_before_compact` 钩子让 extension 完全替换默认
  - Tail 边界按 token budget 而不是 message count（Reasonix `compact.go:271-289`）
- [ ] **Plugin Marketplace**
  - 发布到 npm 命名空间 `@deepwhale/`
  - `deepwhale search skills` 命令
- [ ] **强制 release 节奏**（Reasonix 教训）
  - **每周一发 minor release**（v0.1 → v0.2 → ... → v1.0）
  - 每个 release 配 CHANGELOG.md
  - **v1.0 第 10 周必发**（不拖）
- [ ] **文档站**（`deepwhale.dev`）
  - GitHub Pages + VitePress
  - Quickstart / Skills 开发指南 / Extension API 文档 / FAQ
- [ ] **示例扩展 5-10 个**（抄 pi `examples/extensions/`）
  - `commit` / `test` / `review-pr` / `refactor` / `dep-update` / `changelog` / `security-scan` / `i18n-extract` / `custom-compaction` / `event-bus`

### 验收标准

- 装好 daily-report automation，每天早上 9 点自动生成报告推到飞书
- session 压缩后 token 数下降 70% 但语义保留
- 文档站上线
- **v1.0 release 第 10 周必发**（CHANGELOG.md 完整）
- 至少 5 个示例扩展可一键安装

### ⚠️ Sprint 5 红线

- **不要做"4 遍 tool-call repair"**（误解纠偏：实际是 1 个 `SanitizeToolPairing` 函数 4 cases）
- **不要学 Reasonix 拖延 release**——每周一 minor，10 周 v1.0

---

## Sprint 6（可选）：Hermes-like 长期记忆 + 跨 session 知识沉淀（2 周）

**目标**：用户用 deepwhale 1 周后，**知识能沉淀下来**，跨 session 复用，类似 Hermes MEMORY + library。

### 任务清单

- [ ] **MEMORY.md 短期记忆**
  - 自动捕获用户偏好（"用户偏好中文" / "用户偏好简洁"）
  - Imperative 写法直接当事实存（不是指令）
  - 索引首行不能被吞（Reasonix #2778 教训）
- [ ] **library/ 长期知识**
  - 一条 knowledge 一个 md 文件 + 总索引
  - 跨 session 复用
- [ ] **跨 session 知识图谱**
  - Session 间实体链接（项目、文件、决策）
  - 用户能 hand-edit
- [ ] **MCP 知识服务**（暴露 deepwhale 知识为 MCP server）

### 验收标准

- 用户用 1 周后，deepwhale 知道"用户偏好中文、简洁、XDA 链接要看"
- 跨 session 复用上一 session 的关键决策
- **MEMORY.md 索引首行完整**（unit test 验证）

---

## 关键架构决策（实施前定）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 主语言 | **TypeScript（Node ≥ 22）** | pi 验证 58.6k stars，**不抄 Reasonix Go 栈** |
| TUI 框架 | **Ink**（React 19） | pi 实战验证、跨平台一致 |
| 桌面 | **Tauri 2.x** | 生态成熟，CodeWhale 已规划，**不抄 Reasonix Wails** |
| 沙箱 | **双层：白名单 shell + Rust OS 沙箱** | 跨平台一致 + 安全性 |
| Windows 沙箱 | **明文：Job Object process-tree only** | **不假撑 FS/Network 隔离**（CodeWhale 教训） |
| 分发 | npm + Tauri + Homebrew + Docker | 跟 pi/Codex/Reasonix 一致 |
| 配置 | TOML | CodeWhale 验证，注释友好 |
| Skills 格式 | **对齐 Codex 开放标准 + pi frontmatter 兼容** | 跨工具复用 |
| 4 包 monorepo | **对齐 pi** | 复用 pi 社区经验 |
| ExtensionEvent | **21 个 `whale.*` 事件**（pi 改前缀） | 跟 pi 兼容但区分内/外 |
| MCP | 官方 SDK | 唯一标准 |
| Release 节奏 | **每周一 minor，第 10 周 v1.0** | 避免 Reasonix 1.0 6 周未发 |
| i18n 路径 | **第 1 行定对** | Hermes 教训 |
| License | MIT | 全家桶都是 MIT |

## 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| DeepSeek API 限流 | 中 | 前缀缓存降耗 + Flash/Pro 智能路由 |
| **Windows 沙箱不完整** | 中 | **明文文档：Job Object only，不假撑**（CodeWhale 教训） |
| MCP 协议演进 | 低 | pin 官方 SDK minor 版本 |
| **Skills 安全**（恶意 skill 偷数据） | **高** | Skills 默认只读 + `permissions:` 显式声明 + **Hook trust flag 在 `~/.deepwhale/trust.json` 不在项目里**（Reasonix 抄） |
| 跨渠道状态同步 | 中 | 所有渠道走同一 RPC + Session Manager |
| 用户基数小 → 没人写扩展 | 中 | 自带 5-10 个示范 skill 降低门槛（pi `examples/extensions/` 抄） |
| **Reasonix 1.0 6 周未发** | 中 | **强制 release 节奏**（每周一 minor） |
| **StormBreaker 漏判**（死循环改 args） | 中 | **用 (tool, error) 签名不用 args**（Reasonix 实战观察） |
| **Hermes footer 数字收敛 bug** | 低 | **多字段同值时去冗余/加标签区分**（用户视角 = bug） |
| **Hermes i18n 路径错** | 低 | **Sprint 0 第 1 行定对** |
| **Hermes hot-reload mtime 错位** | 低 | **mtime 检测在 wrapper 内部**（如果做 plugin hot reload） |
| **Hermes 飞书表格不渲染** | 中 | **强制 post payload** |
| **CodeWhale "marker-only" Landlock** | 低 | **deepwhale 要么真做要么不做** |

## 与 Codex 全功能对照表

| Codex 功能 | 状态 | 落在 Sprint |
|---|---|---|
| TUI 交互 | ✅ | Sprint 1 |
| 多种模型切换 | ✅ | Sprint 1 |
| Skills | ✅ | Sprint 2 |
| Plugins | ✅ | Sprint 2 |
| MCP Client/Server | ✅ | Sprint 3 |
| Browser MCP | ✅ | Sprint 3 |
| Computer Use | ✅ | Sprint 3 |
| Automations | ✅ | Sprint 5 |
| Remote TUI | ✅ | Sprint 4 |
| Desktop GUI | ✅ | Sprint 4 |
| 多渠道接入 | ✅ | Sprint 4 |
| Session 持久化/恢复 | ✅ | Sprint 1 |
| Compaction | ✅ | Sprint 5 |
| Hooks | ✅ | Sprint 2 |

**覆盖率**：Codex 全功能 14/14 ✅

**deepwhale 独家（超越 Codex）**：
- ✅ Prefix-cache 4 大机制（Reasonix 全抄）
- ✅ StormBreaker 防死循环（Reasonix 抄）
- ✅ Rust 沙箱 macOS Seatbelt + Linux Landlock + bwrap（CodeWhale 抄）
- ✅ Constitution 9 层权威（CodeWhale 抄）
- ✅ JSONL append-only DAG Session（pi 抄）
- ✅ 21 个 ExtensionEvent 钩子化 Compaction（pi 抄）
- ✅ Hermes 多渠道 + MEMORY/library 分层
- ✅ CodeWhale 飞书桥 SDK 模式

---

**最后更新**：2026-06-02（基于 4 份深度调研优化）
**当前 Sprint**：Sprint 0（4 包 monorepo + 基础设施）
**下次更新**：Sprint 0 完结时
**总报告**：[docs/research/MASTER_RESEARCH.md](./docs/research/MASTER_RESEARCH.md)
