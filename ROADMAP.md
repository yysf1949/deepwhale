# 🗺 deepwhale ROADMAP

> **5 阶段版本锚 × 13 个月，单人开发节奏**
>
> **核心变化**（vs 初版 10 周版）：
> 1. **时间锚从 10 周改为 13 个月**（v1.0 = Phase 1 = Claude Code Lite，3 个月）
> 2. **砍掉 18 项延后事项**（详见 [ARCHITECTURE.md §4](./ARCHITECTURE.md)）
> 3. **Docker 沙箱统一替换 Seatbelt/Landlock/Windows Job Object**（v1.0 起）
> 4. **Session 从 DAG 降级为 Linear**（v1.0），DAG 延后到 v2.0
> 5. **Constitution 9 层权威砍掉**（个人化产物，不适合 deepwhale）
> 6. **保留所有已验证的正确决策**：Prefix-cache 4 机制提前到 v1.0 / StormBreaker / SanitizeToolPairing / i18n 第 1 行定对 / 强制 release 节奏

## 总览

| Phase | 版本 | 月份 | 主题 | 关键交付 | 状态 |
|---|---|---|---|---|---|
| **Phase 1** | v1.0 | 第 1-3 个月 | **Claude Code Lite** | CLI + TUI + 6 工具 + Linear Session + **Prefix-cache 4 大机制** + Docker | 🚧 进行中 |
| **Phase 2** | v1.5 | 第 4-5 个月 | **Codex Clone** | Approval + Task + Skills + Extension API + Hooks + StormBreaker + Cron + Compaction | ⏳ 待开始 |
| **Phase 3** | v2.0 | 第 6-7 个月 | **+Browser Agent** | MCP + Browser Runtime + Plugin 打包 + Session DAG + Memory 三层 | ⏳ 待开始 |
| **Phase 4** | v3.0 | 第 8-10 个月 | **+Computer Use** | Computer Runtime + Compaction 钩子化 | ⏳ 待开始 |
| **Phase 5** | v4.0 | 第 11-13 个月 | **Agent OS** | 完整 Multi-Agent + Plugin Marketplace + Desktop + Web + Channels + 文档站 | ⏳ 待开始 |

> **v1.0 = 1 个 release**（不是 5+1 个 Sprint）
> **v1.5 起 = 每月 1 个 minor release**（每周一 minor 强制节奏）
> **v1.5 累计 5 个月、v2.0 累计 7 个月、v3.0 累计 10 个月、v4.0 累计 13 个月**

---

## Phase 1 — v1.0 Claude Code Lite（第 1-3 个月）

**目标**：能替代 Claude Code 完成日常 coding 任务。**v1.0 第 3 个月必发**（避免 Reasonix 1.0 6 周未发教训）。

### Sprint 0（3 天，搭骨架）

**目标**：`pnpm dev` 跑通最小 CLI，调用 DeepSeek V4-Flash 流式输出"hello"。**第 1 行代码就定对路径、i18n、配置**。

#### 任务清单
- [ ] **建 GitHub 仓库** `yysf1949/deepwhale`（Private）✅
- [ ] **建 4 包 monorepo**（对齐 pi）
  - `packages/llm/` — 多 provider 客户端（v1 = DeepSeek only）
  - `packages/agent-core/` — EventBus + Tool Registry + 沙箱桥 + 缓存
  - `packages/tui/` — Ink 渲染
  - `packages/coding-agent/` — 产品层 = llm + agent-core + tui
- [ ] **pnpm workspace + Turborepo**
- [ ] **配置基础设施**（**第 1 天就定对**）：
  - 路径：`~/.deepwhale/`（**首行写死 + 旧路径 fallback 模式**——避免 CodeWhale `~/.deepseek/` → `~/.codewhale/` 重命名教训）
  - i18n：`from agent.i18n import t`（**第 1 行就定对**——Hermes 教训：原 `gateway.i18n` 错导致永远英文）
  - 配置：`~/.deepwhale/config.toml`（zod 校验）
  - 4 个 Skills 约定目录（v1.0 暂不读，v1.5 启用）：`.deepwhale/skills/`、`.agents/skills/`、`~/.deepwhale/skills/`、`~/.claude/skills/`
- [ ] **`@deepwhale/llm` OpenAI 兼容客户端**（**v1 = DeepSeek only**）
- [ ] **`@deepwhale/coding-agent` 最小 CLI 入口**
- [ ] **CI：GitHub Actions**（lint + typecheck + 基础测试 + 4 包版本同步）

#### 验收标准
```bash
$ pnpm dev
deepwhale> hello
🤖 你好！我是 deepwhale 🐋，当前模型 deepseek-v4-flash
deepwhale>
```

#### ⚠️ Sprint 0 红线（避免 Sprint 1 翻工）
- **i18n 路径第 1 行定对**（Hermes 教训）
- **路径迁移兼容机制**写好（CodeWhale 教训）
- **4 包版本同步 CI**（pi #4908 教训）

---

### Sprint 1（MVP 核心 + Prefix-cache 4 大机制，第 1-2 周）

**目标**：能跟 DeepSeek 多轮对话、编辑本地文件、跑 shell 命令、二次启动恢复会话。**5 轮后 cache 命中率 ≥ 90%**。

#### 任务清单
- [ ] **DeepSeek 接入**（`@deepwhale/llm`）
  - OpenAI 兼容客户端
  - 流式响应（SSE）
  - 错误重试 + 限流退避
- [ ] **⚡ Prefix-cache 4 大机制**（**v1.0 必带，deepwhale 核心优势**）
  - **机制 1：System prompt 一次组装** — `composeSystemPrompt()` 每个 session 只跑一次，按 session ID 缓存（`boot.go:120-148`）
  - **机制 2：`content: ""` 永远序列化**（不带 omitempty）— 防 wire-level 缓存 hash 变化（`openai.go:354-368`）
  - **机制 3：Reasoning content 不打 wire** — DeepSeek V4 thinking tokens 在 session 内部保留，wire 上不传（`openai.go:131-137`）
  - **机制 4：Schema canonicalize** — tool schema build 前跑 `CanonicalizeSchema`，map 顺序稳定（`schema_canonicalize.go:10-67`）
  - **加 regression test**：4 个机制都加 unit test
  - **加 cache 可观测性**：控制台实时显示 `cache_hit_rate` + `cost/turn`
- [ ] **Tool Registry**：内置 6 个核心工具
  - `bash`（**白名单 shell**——v1.0 第一层沙箱）
  - `read_file` / `write_file` / `edit_file`（hash 锚定）
  - `grep` / `find`
- [ ] **3 种运行模式**（CodeWhale 借鉴，先做 3 种）
  - `interactive`（默认，TUI）
  - `print`（`deepwhale -p "..."` 一次性）
  - `rpc`（JSON-RPC over stdio）
- [ ] **Linear Session**（**v1.0 = 简单 Linear，DAG 砍掉**）
  - JSONL append-only（pi 借鉴但**不做 DAG**）
  - 每条 entry 立即 `appendFileSync`
  - 崩溃后 `loadEntriesFromFile` 重建
- [ ] **Docker 沙箱**（**v1.0 = Docker only**，砍掉 Seatbelt/Landlock/Job Object）
  - 白名单 shell 走 Docker `docker run --rm -v ... -w ... deepwhale-sandbox bash -c "..."`
  - 默认镜像：node:22-alpine
  - 网络默认禁用（`--network=none`），用户可显式开启

#### 验收标准
- 能跟 DeepSeek V4-Flash 多轮对话（10 轮上下文连贯）
- 能编辑本地文件 + 跑命令（白名单内）
- 二次启动自动恢复会话（**Linear Session**）
- **5 轮后 `cache_hit_rate ≥ 90%`**（Reasonix 经济性指标）
- 单 turn cost ≤ $0.05
- Prefix-cache 4 大机制都有 unit test
- `rm -rf /` 跑在 Docker 内被 `--network=none` + rootfs 隔离拦截

#### ⚠️ Sprint 1 红线
- **Compaction 还没做，但任何 system prompt 修改要走"cache-reset point review"**（Reasonix 教训）
- **Cache miss 时不要报错**——未知就显示"unknown"（CodeWhale 教训）
- **Session 不要做 DAG**（v1.0 = Linear，**v2.0 升级**）
- **沙箱不要做 Seatbelt/Landlock/Job Object**（v1.0 = Docker only）

---

### Sprint 2（Cache 可观测性 + Session 打磨 + Docker 优化，第 3-4 周）

**目标**：v1.0 release-ready。**cache 命中率可观测**、Session 跨崩溃恢复、Docker 冷启动优化。

#### 任务清单
- [ ] **Cache 可观测性升级**
  - 实时显示 `cache_hit_rate` / `cost/turn` / `tokens_cached` / `tokens_uncached`
  - **多字段同值时去冗余/加标签区分**（Hermes footer 教训）
- [ ] **Session 跨崩溃恢复**
  - Linear Session JSONL 写盘测试（kill -9 后能恢复）
  - **Unit test 验证**（不能丢消息）
- [ ] **Docker 沙箱优化**
  - 预热镜像（`deepwhale-sandbox-warm`）
  - `--rm` 严格 + `--read-only` rootfs
  - 网络/文件挂载策略文档化
- [ ] **基础 UX 打磨**
  - 错误信息友好（DeepSeek 限流 / API key 缺失 / Docker 未启动）
  - TUI 流式渲染测试
- [ ] **强制 release 节奏**
  - **v0.1 必发**（Sprint 2 末）
  - CHANGELOG.md 起头
  - tag + GitHub Release 流程跑通

#### 验收标准
- v0.1 release 发布（`yysf1949/deepwhale` Releases 页面有 tag）
- 文档：README + 快速开始 + 4 个 Skills 目录说明 + Docker 前置条件
- Docker 未启动时给清晰错误（不是 stack trace）

---

### Sprint 3-4（v1.0 收尾 + 文档化 + 测试覆盖，第 5-12 周）

**目标**：v1.0 第 3 个月末必发。**测试覆盖率 ≥ 60%**。

#### 任务清单
- [ ] **测试覆盖**
  - Unit test：Prefix-cache 4 机制 / 6 个工具 / Linear Session / Docker 沙箱
  - Integration test：多轮对话 / 二次启动恢复 / Docker 内跑白名单命令
  - E2E test：CLI 模式 / TUI 模式 / print 模式
- [ ] **文档**
  - README 完整（快速开始 + 架构 + 命令参考）
  - 故障排查 FAQ
  - 开发指南（如何加新工具 / 新模型）
- [ ] **性能**
  - Docker 冷启动 ≤ 1s
  - TUI 流式响应 ≤ 200ms 延迟
- [ ] **v1.0 release**
  - 第 3 个月末 GitHub Release
  - npm publish（`@deepwhale/llm` / `@deepwhale/coding-agent` / ...）
  - Homebrew formula（可选）

#### 验收标准
- v1.0 release 发布
- npm 包可安装
- 测试覆盖率 ≥ 60%
- **Codex 14 项功能 0/14**（**v1.5 才到 14/14**）

#### ⚠️ v1.0 红线
- **不要做 MCP / Browser / Computer / Plugins / Skills / Desktop / 渠道**（**砍掉清单**）
- **不要做 Session DAG**（v1.0 = Linear）
- **不要做 Compaction**（v1.5 起）
- **不要做 Plugin Marketplace**（v1.5 起）
- **不要做文档站**（v1.5 起）
- **v1.0 第 3 个月末必发**（不拖）

---

## Phase 2 — v1.5 Codex Clone（第 4-5 个月）

**目标**：100% Codex Client 复刻（**14/14 功能对齐**）。**v1.5 第 5 个月末必发**。

### Sprint 5-6（Skills + Extension API + Hooks，第 4 个月）

#### 任务清单
- [ ] **🛡 StormBreaker 防死循环**（Reasonix 抄，**工具增多后 P0**）
  - 3 次相同 `(tool, error)` 签名触发暂停 + 用户确认
  - **关键：用 (tool, error) 签名，不用 args 签名**（Reasonix 实战观察）
  - Unit test：模拟死循环场景
- [ ] **🛡 SanitizeToolPairing**（Reasonix 抄，**1 个函数 4 cases**）
  - 4 种 pairing case：orphan assistant tool_call、orphan tool_result、重复 tool_call、tool_result 不匹配
  - **理解 4 cases 一次性处理，不是"4 遍"**（Reasonix 误解纠偏）
  - Unit test：每种 case 单独测
- [ ] **Skills 系统**（对齐 Codex Skills 开放标准 + pi Skills 借鉴）
  - 4 个约定目录：`.deepwhale/skills/`、`<project>/.agents/skills/`、`~/.deepwhale/skills/`、`~/.claude/skills/`
  - 格式：`SKILL.md` + YAML frontmatter（`name` / `description` / `triggers`）
  - **索引硬上限 4KB**（Reasonix 抄）
  - 内置 3 个示范：commit / test / review-pr
- [ ] **EventBus 包装**（pi 抄）
  - 30 行 wrapper，try/catch 隔离
  - **21 个 `whale.*` ExtensionEvent 联合类型**
- [ ] **Extension API**（pi 借鉴，**v1.5 关键**）
  - `defineTool({ name, description, parameters, execute })` —— **零运行时，5 行类型守卫**
  - 21 个事件：`whale.session_start` / `whale.tool_call` / `whale.tool_result` / `whale.message_end` / `whale.session_before_compact` / ...
- [ ] **Hooks**（5 事件 + Reasonix 退出码语义）
  - `pre_tool_use` / `post_tool_use` / `user_prompt_submit` / `stop` / `session_start`
  - 退出码：exit 0=pass, exit 2=block, other=warn
  - **Hook trust flag 不在项目里**（`~/.deepwhale/trust.json`，Reasonix 抄）
- [ ] **Package Manager**（pi 抄）
  - 解析 `whale:` / `git:` / 本地路径
  - 资源优先级 4 档

#### 验收标准
- 装 1 个社区 skill 能用
- 写 1 个 30 行 Extension 注册自定义工具
- 装 1 个带 hooks 的 plugin，hook 真的触发
- **StormBreaker 测出死循环场景能暂停**
- **SanitizeToolPairing 4 种 case 都能处理**
- Codex 14 项功能 → **8/14**（+ Skills / Plugins / Hooks）

#### ⚠️ Sprint 5-6 红线
- **Extension tool 重名启动时检测**（pi #5316 教训）
- **Hook payload 走 JSON on stdin**（Reasonix 抄）
- **Extension manifest 在 package.json**（pi 抄）/ deepwhale 用 `pyproject.toml` 的 `[tool.deepwhale]`

---

### Sprint 7-8（Codex 复刻收尾：Approval / Task / Cron / Compaction，第 5 个月）

#### 任务清单
- [ ] **Approval System**（Codex 抄）
  - 工具调用前弹确认（默认 deny 危险操作）
  - 白名单内自动 approve
- [ ] **Task Mode**（Codex 抄）
  - `/task <id>` 跳转到指定 session
  - 任务列表 UI
- [ ] **Cron Automations**（Codex 抄）
  - `~/.deepwhale/automations/*.yaml` 定义定时任务
  - 模板：daily-report / code-review / test-runner / dep-update
- [ ] **Compaction**（v1.5 = **cache-reset point 唯一**）
  - **Compaction = 唯一 cache-reset point**（Reasonix 抄）
  - `session_before_compact` 钩子让 extension 完全替换默认
  - Tail 边界按 token budget 而不是 message count
- [ ] **Remote TUI**（WebSocket 远程控制）
  - `deepwhale serve --http` 暴露 `/v1/*`
  - 远端 TUI 通过 WebSocket 连接
- [ ] **v1.5 release**
  - 第 5 个月末 GitHub Release
  - CHANGELOG 完整记录
  - **Codex 14/14 ✅**

#### 验收标准
- **Codex 14/14 ✅**（TUI / 多模型 / Skills / Plugins / MCP-stub / Approval / Task / Automations / Remote TUI / Session / Compaction / Hooks / ...）
- 装好 daily-report automation，定时跑通
- 文档：v1.5 release notes + 14/14 对照表

---

## Phase 3 — v2.0 +Browser Agent（第 6-7 个月）

**目标**：能自动开网页、填表、截图。**v2.0 第 7 个月末必发**。

### Sprint 9-10（Browser Runtime + MCP + Session DAG，第 6-7 个月）

#### 任务清单
- [ ] **MCP Runtime**（stdio / http / sse 动态注册）
  - 官方 SDK
  - 配置：`~/.deepwhale/mcp.json`
  - **deepwhale 也可作为 MCP server 暴露**（`deepwhale serve --mcp`）
- [ ] **Browser Runtime**（Playwright + 统一 API）
  - 6 个核心 API：navigate / click / type / extract / screenshot / download / upload
  - 集成 `@playwright/mcp` 开箱即用
  - Browser sandbox 走 Docker（与 Tool Runtime 同一沙箱）
- [ ] **Plugin 打包**（`.dwp` 格式，类似 `.vsix`）
  - 打包 1 个 `.dwp` 文件能跨机安装
- [ ] **Session DAG**（**v1.0 Linear 升级**）
  - `parentId + leafId` 的 DAG 形态
  - 跨分支不丢消息
- [ ] **MemoryManager**（Short/Long/Summary 三层）
  - Short：最近会话
  - Long：向量库
  - Summary：自动压缩
- [ ] **v2.0 release**
  - 第 7 个月末 GitHub Release
  - 装好 Playwright MCP 后能自动开网页填表截图
  - Browser Runtime 6 个核心 API 全部跑通

---

## Phase 4 — v3.0 +Computer Use（第 8-10 个月）

**目标**：能操控电脑 GUI。**v3.0 第 10 个月末必发**。

### Sprint 11-15（Computer Runtime + Compaction 钩子化，第 8-10 个月）

#### 任务清单
- [ ] **Computer Runtime**（macOS / Linux X11 优先，Windows 不做）
  - `mouse_move` / `mouse_click` / `keyboard_input` / `keyboard_hotkey` / `screen_capture` / `window_control`
  - 跑在 Docker sandbox 内
- [ ] **Compaction 钩子化**（让 extension 完全替换默认）
  - `session_before_compact` / `session_after_compact` 钩子
- [ ] **Computer Use MCP 集成**
  - Computer Use 也可作为 MCP server 暴露
- [ ] **v3.0 release**
  - 第 10 个月末 GitHub Release
  - 在 sandbox 内能开指定应用、点击、输入
  - Compaction 后 token 下降 70% 但语义保留

#### ⚠️ Phase 4 红线
- **Windows Computer Use 不做**（OS 差异大，v3.0 主要验证 macOS + Linux X11）

---

## Phase 5 — v4.0 Agent OS（第 11-13 个月）

**目标**：从"命令行助手"变成**"长期运行的软件工程 Agent"**（long-running software engineering agent）。**v4.0 第 13 个月末必发**。

> **设计理念**：v1.0-v3.0 解决"单次任务能不能完成"，v4.0 解决"**多 session / 跨重启 / 长期演化**"——这是 deepwhale 从"CLI 工具"升维为"Agent OS"的核心标志。

### Sprint 16-17（Multi-Agent 5 角色 + TaskGraph 引擎，第 11-12 个月）

#### 任务清单
- [ ] **5 角色 Multi-Agent 流水线**
  - **Planner**（任务拆解 + 依赖分析，输出 TaskGraph）
  - **Researcher**（信息收集、Codebase 探索、上下文检索）
  - **Coder**（专用写代码 = v1.0 Executor 特化）
  - **Reviewer**（验证、Coder 输出 review、Code Review 自动化、self-check）
  - **Executor**（通用工具执行，Computer Use / Browser 编排）
  - **流水线**：`Planner → Researcher → Coder → Reviewer → Executor`
  - **单 Agent 模式保留**为 `mode=single`（v1.0 行为完全兼容）
- [ ] **TaskGraph 引擎**（**v4.0 新增，独立模块**）
  - Planner 输出**有向无环图（DAG）**表示子任务依赖
  - 任务调度：依赖满足才执行、并行无依赖任务、失败重试、超时中断
  - **跨 session 持久化**（重启不丢任务图）
  - 与 Session DAG **正交**（Session DAG = 消息树，TaskGraph = 工作流图）
  - 例：`重构用户模块` → [读 schema(0) → 改 UserService(2) → 改 controller(3) → 写测试(4) → Reviewer(5)]
- [ ] **Persistent Memory**（v2.0 MemoryManager 升级）
  - 跨 session 知识沉淀（用户偏好 / 项目决策 / 实体链接）
  - hand-edit 友好（用户可直接改 memory 文件）
  - **实体链接**：项目 / 文件 / 决策 三类节点的引用图
  - 跨 session 复用 + 跨 v4.0 Multi-Agent 5 角色共享
- [ ] **Tool Router 升级**（v1.0 已有）
  - v4.0 = 语义路由（按意图选工具，而不只是 registry 查找）
  - 支持 MCP 工具 + 内置工具 + Plugin 工具三类合并查询

#### ⚠️ Sprint 16-17 红线
- **Coder = Executor 特化，不是新东西**——复用 v1.0 Executor 代码，v4.0 加 Code-aware 工具
- **TaskGraph ≠ Session DAG**——前者是工作流层，后者是消息持久化层
- **Persistent Memory 不与 Session 混淆**——Memory 跨 session 共享，Session 是单一线程

### Sprint 18-20（MCP Marketplace + Desktop + Channels + 文档站，第 12-13 个月）

#### 任务清单
- [ ] **Plugin Marketplace**（功能包市场）
  - npm 命名空间 `@deepwhale/`
  - `deepwhale skill install` / `deepwhale plugin install` 命令
- [ ] **MCP Marketplace**（工具市场，**与 Plugin Marketplace 拆开**）
  - 官方 MCP server 目录
  - `deepwhale mcp install <name>` 命令
  - 区别：Plugin = 功能包（含 UI/事件/工具），MCP = 纯工具服务
- [ ] **Desktop**（Tauri 2.x）
  - 多 tab 会话
  - 右侧 panel 显示 agent 读/改过的文件
  - 底部 cost / cache / token meters
  - **TaskGraph 可视化**（DAG 节点图）
- [ ] **Web UI**（可选）
  - 浏览器访问 `localhost:7331`
- [ ] **Channels**（**v4.0 重新评估清单**）
  - 飞书：bot 消息 → RPC 投递 → 流式回写
  - Telegram：inline keyboard
  - 邮件 / 微信：按需
- [ ] **文档站**（VitePress）
  - Quickstart / Skills 开发指南 / Extension API 文档 / FAQ
- [ ] **v4.0 release**
  - 第 13 个月末 GitHub Release
  - **5 个 Agent 角色 + TaskGraph 协同跑通**
  - 桌面 GUI 跑起来
  - 文档站上线

#### ⚠️ v4.0 红线
- **5 角色不等于 5 个独立 Agent**——是 5 个**职责**，可以是 1 个 process 内 5 个函数
- **TaskGraph 持久化必须做**（重启不丢）——避免变成"另一个 in-memory DAG"
- **MCP Marketplace ≠ Plugin Marketplace**——两类市场分开发布

---

## 关键架构决策（实施前定）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 主语言 | **TypeScript（Node ≥ 22）** | pi 验证 58.6k stars |
| TUI 框架 | **Ink**（React 19） | pi 实战验证、跨平台一致 |
| 桌面 | **Tauri 2.x**（v4.0） | 生态成熟，**v4.0 之前不做** |
| 沙箱（v1-v3） | **Docker only** | 跨平台一致 + 单人可维护 |
| 沙箱（v4） | **Docker + 多实例编排** | Multi-Agent 隔离 |
| 分发 | npm + Homebrew + Docker | 跟 pi/Codex/Reasonix 一致 |
| 配置 | TOML | CodeWhale 验证 |
| Skills 格式 | **对齐 Codex 开放标准** | 跨工具复用 |
| 4 包 monorepo | **对齐 pi** | 复用 pi 社区经验 |
| ExtensionEvent | **21 个 `whale.*` 事件**（v1.5） | 跟 pi 兼容但区分内/外 |
| MCP | 官方 SDK（v2.0） | 唯一标准 |
| Release 节奏 | **每周一 minor**（v1.5 起） | 避免 Reasonix 1.0 6 周未发 |
| i18n 路径 | **第 1 行定对** | Hermes 教训 |
| License | MIT | 全家桶都是 MIT |
| **Constitution 9 层权威** | **砍掉** | 个人化产物，不适合 deepwhale |
| **Session DAG** | **v1 = Linear，v2 = DAG** | 避免 v1 过度复杂 |

---

## 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| DeepSeek API 限流 | 中 | 前缀缓存降耗 + Flash/Pro 智能路由 |
| **Scope explosion** | **高** | **本 ROADMAP 就是为压制这个风险**——5 阶段版本锚 + 砍掉清单 18 项 |
| 单人开发 burnout | 中 | Phase 之间预留 1 周缓冲期 |
| **Windows 沙箱不完整** | **不评估** | **v1-v4 都不做 Windows 沙箱**（统一 Docker） |
| MCP 协议演进 | 低 | pin 官方 SDK minor 版本 |
| **Skills 安全** | **高** | Skills 默认只读 + `permissions:` 显式声明 + Hook trust flag 在 `~/.deepwhale/trust.json` |
| 跨 Phase 时间拖延 | 中 | **强制 release 节奏**：每个 Phase 末尾必发版本 |
| Docker 沙箱冷启动慢 | 低 | Phase 1 接受，Phase 3 优化 |
| Browser Runtime 跨浏览器一致 | 中 | Playwright 抽象足够，**不做自定义协议** |
| Computer Use OS 差异 | 高 | v3.0 主要验证 macOS + Linux X11，Windows v3.0 不做 |
| Reasonix 1.0 6 周未发 | 中 | **强制 release 节奏**（每周一 minor，**v1.0/v1.5/v2.0/v3.0/v4.0 必发**） |
| StormBreaker 漏判 | 中 | **用 (tool, error) 签名不用 args** |
| Hermes footer 数字收敛 bug | 低 | **多字段同值时去冗余/加标签区分** |
| Hermes i18n 路径错 | 低 | **Sprint 0 第 1 行定对** |
| CodeWhale "marker-only" Landlock | 不评估 | **deepwhale 走 Docker，不学 CodeWhale 沙箱思路** |

---

## 与 Codex 全功能对照表

| Codex 功能 | 状态 | 落在版本 |
|---|---|---|
| TUI 交互 | ✅ | v1.0 |
| 多种模型切换 | ⚠️ v1.0 = DeepSeek only；v1.5 = +OpenAI/Claude | v1.0 / v1.5 |
| Skills | ✅ | v1.5 |
| Plugins | ✅ | v1.5 |
| MCP Client/Server | ✅ | v2.0 |
| Browser MCP | ✅ | v2.0 |
| Computer Use | ✅ | v3.0 |
| Automations | ✅ | v1.5 |
| Remote TUI | ✅ | v1.5 |
| Desktop GUI | ✅ | v4.0 |
| 多渠道接入 | ✅ | v4.0 |
| Session 持久化/恢复 | ✅ | v1.0（Linear）→ v2.0（DAG） |
| Compaction | ✅ | v1.5 |
| Hooks | ✅ | v1.5 |

**覆盖率进度**：
- v1.0 = **3/14**（TUI / 多模型-DS-only / Session-Linear）
- v1.5 = **8/14**（+ Skills / Plugins / Hooks / Approval / Task / Automations / Remote TUI / Compaction）
- v2.0 = **10/14**（+ MCP / Browser MCP）
- v3.0 = **11/14**（+ Computer Use）
- v4.0 = **14/14 ✅**（+ Desktop / 多渠道 / 完整 Multi-Agent）

**deepwhale 独家（vs Codex）**：
- ✅ **Prefix-cache 4 大机制**（Reasonix 全抄）— **v1.0 必带**
- ✅ **StormBreaker 防死循环**（Reasonix 抄）— v1.5 工具增多后 P0
- ✅ **SanitizeToolPairing**（Reasonix 抄）— v1.5
- ✅ **Compaction = 唯一 cache-reset point**（Reasonix 抄）— v1.5
- ✅ **Docker 沙箱统一**（v1.0-v4.0 跨平台一致，**Codex 没做**）
- ✅ **JSONL append-only Session**（pi 借鉴，v1.0 Linear → v2.0 DAG）— 简单可恢复
- ✅ **21 个 ExtensionEvent 钩子化 Compaction**（v1.5 起）
- ✅ **完整 Multi-Agent 流水线**（v4.0）

---

**最后更新**：2026-06-03（确立 5 阶段版本锚，砍掉 18 项延后事项，Docker 沙箱统一）
**当前阶段**：Phase 1 Sprint 0（4 包 monorepo + 基础设施）
**下次更新**：v0.1 release 时
**架构详情**：[docs/ARCHITECTURE.md](./ARCHITECTURE.md)
**总报告**：[docs/research/MASTER_RESEARCH.md](./docs/research/MASTER_RESEARCH.md)
