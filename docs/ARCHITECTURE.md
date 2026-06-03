# 🏛 deepwhale 终极架构

> **核心变更（vs 初版）**：
> 1. **锁定 5 层架构**（LLM / Code Intelligence / Runtime / Agent / UI）+ **Memory cross-cutting**
> 2. **锁定 6 版本锚**（v1.0 Claude Code Lite → v1.5 Codex Core+CodeIntel → v2.0 +Browser Agent → v2.5 +Planner → v3.0 +Computer Use 兼容层 → v4.0 Agent OS）
> 3. **明确砍掉清单**：22 项延后到 vN / 永远不做（详见末节"砍掉清单"）
> 4. **单人开发 13 个月节奏**（10 周 v1.0 在单人情况下是 scope explosion 后的 90% 失败概率——**已弃**）
> 5. **Code Intelligence Layer 新增**（v1.5 基础 / v2.0 增强）——解决"10万行项目失明"
> 6. **Computer Use 改兼容层**（Codex 协议优先，**不自研**）——节省 2 个月开发量
> 7. **v2.5 插一档做 Planner**（v2 已经有 Browser/DAG/Memory/CodeIntel，不再加 Planner 避免爆）
> 8. **Memory Ranking 算法**（importance/last_accessed/decay_score/scope）——解决"5000 memories 必崩"

## 1. 项目定位

**deepwhale 是一个完全基于 DeepSeek 的 AI Agent Operating System。**

目标（按版本锚分阶段交付）：

| 阶段 | 版本 | 月份 | 累计 | 目标能力 |
|---|---|---|---|---|
| Phase 1 | v1.0 | 1-3 月 | 3 月 | Claude Code Lite（CLI + TUI + 6 工具 + Linear Session + Prefix-cache 4 机制 + Docker 沙箱） |
| Phase 2 | v1.5 | 4-5 月 | 5 月 | **Codex Core**（Approval/Task/Skills/Hook/StormBreaker）+ **Code Intelligence 基础**（Tree-sitter + Symbol Graph + Workspace Index） |
| Phase 3 | v2.0 | 6-8 月 | 8 月 | + **Browser Agent**（真实 Browser Planner）+ Session DAG + Memory Ranking + Code Intelligence 增强（Reference Graph + Semantic Search） |
| **Phase 3.5** | **v2.5** | **9 月** | **9 月** | **+ Planner Agent**（双 Agent 模式，**独立插档**） |
| Phase 4 | v3.0 | 10-11 月 | 11 月 | + **Computer Use 兼容层**（Codex 协议优先，**不自研**）+ Reviewer + Compaction 钩子化 |
| Phase 5 | v4.0 | 12-13 月 | **13 月** | + Researcher + 5 角色完整 Multi-Agent + TaskGraph + Persistent Memory + Desktop + Channels |

**核心原则**：

1. **先成为 Claude Code 替代品**（v1.0），再成为 Agent Operating System（v4.0）
2. **CLI 优先，Desktop 其次**（v4.0 之前的 UI 形态只有 CLI + TUI）
3. **不直接复制其它项目，只吸收成熟设计**（详见 §3 技术来源映射）

---

## 2. 5 层架构 + Memory cross-cutting

> **vs 初版 4 层架构**：
> - **新增 Code Intelligence Layer**（v1.5 引入）—— 解决"10 万行项目 Agent 失明"
> - **Memory 提升为 cross-cutting 关注点**（不是单独一层，5 层都可读写）
> - Agent Layer 移到 Code Intelligence 之下（**Agent 工具能直接调代码理解能力**）

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer（v1.0 = CLI + TUI；v4.0 = +Desktop）                │
│  CLI │ TUI (Ink) │ Desktop (Tauri, v4.0) │ Web (v4.0)        │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Agent Layer                                                 │
│  v1.0: Executor │ ToolRouter │ SessionManager (Linear)       │
│  v1.5: + Approval │ Task │ Skills │ Hooks                    │
│  v2.0: + Memory Ranking (跨 5 角色共享)                       │
│  v2.5: + Planner (双 Agent 模式)                              │
│  v3.0: + Reviewer │ Compaction 钩子化                         │
│  v4.0: + Researcher (完整 5 角色) │ TaskGraph                 │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Code Intelligence Layer（v1.5 引入，v2.0 增强）              │
│  v1.5: Tree-sitter │ Symbol Graph │ Workspace Index           │
│  v2.0: + Reference Graph │ Semantic Search                   │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Runtime Layer                                               │
│  v1.0: Tool Runtime │ Docker Sandbox                          │
│  v1.5: + Plugin Runtime (.dwp)                                │
│  v2.0: + MCP Runtime │ Browser Agent Runtime (含 Planner)     │
│  v3.0: + Computer Use Runtime (兼容层, Codex 协议优先)        │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  LLM Layer                                                   │
│  v1.0: DeepSeek V4-Flash/Pro only                             │
│  v1.5: + OpenAI/Claude/Gemini/自定义                          │
│  Prefix-cache 4 大机制 │ StormBreaker │ Sanitize (v1.5)       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Memory（cross-cutting，所有层可读写）                         │
│  v1.0: Session 内 in-memory                                   │
│  v2.0: Short/Long/Summary 三层 + Ranking (importance/decay)  │
│  v4.0: Persistent (跨 session + 跨 5 角色 + hand-edit)       │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 LLM Layer

**职责**：模型适配

**v1.0 只支持**：DeepSeek（V4-Flash 默认，V4-Pro `/pro` 升级）

**v1.5 起扩展**：OpenAI / Anthropic / Gemini / 自定义 OpenAI-compatible

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

**职责**：核心 agent 循环 + 任务拆解 + 验证 + 角色协作

**v1.0 包含**（单 Agent）：
- **Executor**（必需）
- **ToolRouter**（必需，registry 模式）
- **SessionManager**（必需，v1 = Linear Session）
- **Approval**（Codex 抄，v1.5 起）

**v1.5 包含**（Codex Core 复刻）：
- **Task**（Codex 抄）
- **Skills**（Codex 开放标准）
- **Hooks**（5 事件 + Reasonix 退出码语义）
- **StormBreaker / SanitizeToolPairing**（Reasonix 抄）

**v2.0 包含**（**Observe** 能力主题 + 真实 Browser Agent 4 件基础）：
- **MemoryManager** + **Ranking 算法**（importance × decay × scope_weight）
- **Memory Schema 加 `source` 字段**（`user_preference` / `project_fact` / `workspace` / `user_explicit` / `auto_extracted`）—— 解决"长期/项目/用户偏好混在一起"
- **Browser Agent 基础 4 件**（v2.0 不做全 7 件，v3.0 增强）：
  - DOM Understanding / Element Ranking / Page Summarization / Action History
- **v2.0 拆 Tier-1/Tier-2**（**DAG 砍到 v2.5**）：
  - Tier-1（必须完成）：Browser Agent 4 件 + Memory Ranking + Code Intelligence 增强
  - Tier-2（v2.0.x 补回）：Automation / Remote TUI / Compaction / MCP Runtime
- 跨 Executor / Browser Agent / Code Intelligence 三层共享
- 详细设计见 [BROWSER_PLANNER.md](./design/BROWSER_PLANNER.md)

**v2.5 包含**（**Planning Framework = 4 组件 + DAG**）：
- **Planner**（任务拆解 + 依赖分析）
- **Task Object**（`{ id, goal, subtasks, status, depends_on, result }`，状态机：`pending → ready → running → done | failed | blocked`）
- **Plan Cache**（跨 session 复用规划结果）
- **Execution Boundary**（**v2.5 关键约束**：Planner 不执行 / Executor 不规划 / Reviewer 不执行生产动作）
- **Session DAG**（**v1.0 Linear 升级**——v2.0 砍到 v2.5，与 Planner 同链路更紧）
- 流水线：`Planner → Executor`（双角色，可降级为单 Executor 兼容 v1.0）
- 详细设计见 [AGENT_RUNTIME.md](./design/AGENT_RUNTIME.md)

**v3.0 包含**（**Execute + Review** + Browser Agent 增强 3 件 + Computer Use 兼容层）：
- **Reviewer**（验证、self-check、Code Review 自动化）
- 流水线：`Planner → Executor → Reviewer`（三角色，**v2.5 Execution Boundary 复用**）
- **Browser Agent 增强 3 件**（v2.0 4 件基础 → v3.0 7 件完整）：
  - Visual Grounding / 策略级 Error Recovery / Adaptive Retry
- **Computer Use 兼容层**（**不自研 OCR/UI Detection**——首选 Codex Computer Use 协议）
- Compaction 钩子化（让 extension 完全替换默认）

**v4.0 包含**（**完整 5 角色 Multi-Agent**）：
- **Researcher**（信息收集、Codebase 探索、上下文检索）
- 流水线：`Planner → Researcher → Coder → Reviewer → Executor`（**5 角色 = 5 函数，单 process 内**）
- **TaskGraph 引擎**：Planner 输出 DAG，**跨 session 持久化**，与 Session DAG **正交**
- **Persistent Memory**：v2.0 MemoryManager 升级（跨 session + 跨 5 角色 + hand-edit）

### 2.3 Runtime Layer

**职责**：工具执行 + 浏览器 + 电脑 + MCP + 插件

**v1.0 包含**：
- **Tool Runtime**（bash 白名单 + 6 个核心工具：read_file / write_file / edit_file / bash / grep / find）
- **Docker Sandbox**（默认镜像 node:22-alpine，--network=none，--read-only rootfs）

**v1.5 包含**：
- **Plugin Runtime**（`.dwp` 格式，类似 `.vsix`）

**v2.0 包含**（**真实 Browser Agent，不是 Playwright Wrapper**）：
- **MCP Runtime**（stdio / http / sse 动态注册）
- **Browser Agent Runtime**：
  - **Browser Planner**（任务级：DOM Understanding / Element Ranking / Visual Grounding / Action History / Page Summarization / Error Recovery）
  - **Browser Executor**（操作级：navigate / click / type / extract / screenshot / download / upload）
  - 解决"淘宝/京东/Amazon 复杂页面失败"
  - 复用 **Playwright**（不自研 DOM 协议）

**v3.0 包含**（**Computer Use 兼容层，不自研**）：
- **Computer Use Runtime**：
  - **首选 Codex Computer Use 协议**（Codex 26.527 开源协议，复刻目标一致）
  - 备选 OpenAI Computer Use / Browser Use Desktop
  - 复用现成视觉模型（OCR / UI Detection / Element Localization）
  - **不自研** mouse_move / mouse_click / keyboard_input / screen_capture——避免"3 个月视觉理解黑洞"
  - 鼠标键盘操作通过兼容层 API 委托

### 2.3.1 Code Intelligence Layer（v1.5 引入）

**职责**：让 Agent 理解代码库，而不是只能 grep

**v1.5 基础**（**Phase 2 引入，解决"10万行项目失明"**）：
- **Tree-sitter**：多语言 AST 解析（TypeScript / JavaScript / Python / Go / Rust / Java）
  - npm 包：`tree-sitter` + `tree-sitter-typescript` / `tree-sitter-python` / ...
  - 解析速度：100K LOC / 秒
- **Symbol Graph**：基于 AST 提取 symbol（function / class / variable / type）
  - 持久化：`~/.deepwhale/index/<project-hash>/symbols.jsonl`（JSONL append-only）
  - 支持查询：按 symbol 找定义 / 按文件找 symbol 列表 / 按 query string 模糊匹配
- **Workspace Index**：项目级元信息（语言分布 / 文件数 / LOC / 依赖图）
  - 写入时机：v1.5 启动时增量构建，git hook 自动触发

**v2.0 增强**（**Phase 3 增强**）：
- **Reference Graph**：跨文件 symbol 引用图（imports / calls / type refs）
  - 支持查询：找 symbol 的所有引用、找死代码、找循环依赖
- **Semantic Search**：基于 embeddings 的语义搜索
  - 复用 DeepSeek V4 embedding API（v1.5 已支持多 provider）
  - 索引：`~/.deepwhale/index/<project-hash>/embeddings.bin`（FAISS 或 hnswlib）

**Code Intelligence 调用入口**（Agent 工具能直接用）：
```typescript
// Agent tool 1: symbol_lookup
deepwhale.tool('symbol_lookup', {
  query: 'UserService.authenticate',
  kind: 'function' | 'class' | 'variable' | 'all',
  max_results: 10,
});

// Agent tool 2: reference_lookup
deepwhale.tool('reference_lookup', {
  symbol: 'UserService.authenticate',
  kind: 'callers' | 'callees' | 'importers' | 'all',
});

// Agent tool 3: semantic_search
deepwhale.tool('semantic_search', {
  query: 'JWT 认证中间件',
  max_results: 10,
});
```

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
| 19 | 真实 5 进程 Multi-Agent 编排 | v4.0 风险 | 单 process 内 5 函数，**不真 spawn 5 个 Agent**（避免 Anthropic/OpenAI 那种昂贵编排） | 不评估 |
| 20 | MCP Marketplace 合并到 Plugin Marketplace | v4.0 风险 | **拆成两个市场**（功能包 vs 纯工具服务） | 不评估 |
| 21 | **Computer Use 自研**（OCR/UI Detection/Element Localization） | v3.0 风险 | **v3.0 改兼容层**（Codex Computer Use 协议优先），**不自研视觉理解** | 永远不做（v3.0 兼容层足够） |
| 22 | **Browser Agent = Playwright Wrapper** | v2.0 风险 | **v2.0 做真实 Browser Planner**（DOM Understanding / Element Ranking / Visual Grounding / Action History / Page Summary / Error Recovery） | 不评估 |

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

### Phase 2 — v1.5 Codex Core + Code Intelligence 基础（2 个月）

**目标**：Codex Client 核心功能复刻 + **让 Agent 理解代码库**（v1.5 基础）

**交付清单**：

**Codex Core 复刻**（**v1.5 = 8/14**，**Automation/Cron/Remote TUI/Compaction 砍到 v2.0**）：
- Approval System（Codex 抄）
- Task Mode（Codex 抄）
- Skills 系统（**对齐 Codex 开放标准**）
- Extension API + 21 个 `whale.*` 事件
- Hooks（5 事件 + Reasonix 退出码语义）
- **StormBreaker** + **SanitizeToolPairing**（**工具增多后 P0**）

**Code Intelligence 基础**（**v1.5 引入，解决"10万行项目失明"**）：
- Tree-sitter 多语言 AST 解析
- Symbol Graph（按 symbol 找定义）
- Workspace Index（项目元信息）
- 暴露 `symbol_lookup` / `reference_lookup`（v1.5 基础版，无 reference 增强）

**v1.5 不做**（砍到 v2.0）：
- ❌ **Automation / Cron**（v2.0 做）
- ❌ **Remote TUI**（v2.0 做）
- ❌ **Compaction**（v2.0 做）
- ❌ **MCP**（v2.0 做）
- ❌ Browser / Computer / Desktop / 渠道

**验收标准**：
- Codex Core 8/14 功能对齐
- 装 1 个社区 skill 能用
- 写 1 个 30 行 Extension 注册自定义工具
- **大型项目（10万行）能查 symbol 定义**（symbol_lookup 跑通）
- 每周一 minor release，**v1.5 第 5 个月必发**

### Phase 3 — v2.0 +Browser Agent + Code Intel 增强（3 个月）

**目标**：能自动操作复杂网页（淘宝/京东/Amazon）+ 完整 Memory Ranking + Code Intel 增强

**交付清单**：

**真实 Browser Agent**（**不是 Playwright Wrapper**）：
- **Browser Planner**（任务级：DOM Understanding / Element Ranking / Visual Grounding / Action History / Page Summarization / Error Recovery）
- **Browser Executor**（操作级：navigate / click / type / extract / screenshot / download / upload）
- 复用 **Playwright**（不自研 DOM 协议）

**Automation / Cron / Remote TUI / Compaction**（**v1.5 砍掉的部分补回**）：
- Cron Automations（4 模板）
- Remote TUI（WebSocket）
- Compaction（v2.0 = **cache-reset point 唯一**）
- Plugin 打包（`.dwp` 格式）

**MCP Runtime**：stdio / http / sse 动态注册

**Session DAG**：v1 Linear → v2.0 DAG（`parentId + leafId` JSONL append-only）

**Memory Ranking 算法**（**解决"5000 memories 必崩"**）：
- Memory Schema：`{ content, importance, last_accessed, decay_score, scope, created_at }`
- Ranking：`score = importance * decay(last_accessed) * scope_weight`
- 触发回收：score < threshold 自动归档（不删除，可恢复）
- 显式 scope 标记（`user` / `project` / `session`），hand-edit 优先于自动写入

**Code Intelligence 增强**（**v1.5 基础升级**）：
- **Reference Graph**：跨文件 symbol 引用图（callers / callees / importers）
- **Semantic Search**：基于 embeddings 的语义搜索（DeepSeek V4 embedding API）
- 暴露 `semantic_search` / `reference_lookup` 完整版

**验收标准**：
- 装好 Browser Agent 后能在淘宝/京东/Amazon 完成"搜索 + 加购"完整流程
- MCP server 动态注册跑通
- Session DAG 跨分支不丢消息
- **1000 条 memory 回收测试通过**（无性能下降）
- 10 万行项目能查 callers/callees 和做语义搜索
- **v2.0 第 8 个月必发**

### Phase 3.5 — v2.5 +Planner（**独立插档，1 个月**）

**目标**：**双 Agent 模式**——v2 已有 Browser/DAG/Memory/CodeIntel 4 个大件，**不再加 Planner 避免爆**

**为什么是 v2.5 插档而不是 v2 一起做**：
- v2 已经有 4 个大件（Browser Agent + DAG + Memory Ranking + Code Intel 增强）
- 再加 Planner 必然导致 v2 延期（v2.5 是 v2 延期风险的"安全阀"）
- 独立插档让 v2 / v2.5 / v3.0 各自能发

**交付清单**：
- **Planner**（任务拆解 + 依赖分析）
- 流水线：`Planner → Executor`（双角色）
- **降级模式**：`mode=single` 完全兼容 v1.0 行为（用户可选择）
- Planner 工具：`plan_task` / `decompose_task` / `get_subtask_status`
- 单测：拆解 5 个真实场景任务，验证依赖图正确

**验收标准**：
- 双 Agent 模式：Planner 把"重构用户模块"拆成 DAG 子任务，Executor 按序执行
- 降级模式：`deepwhale --mode=single` 行为完全等同 v1.0
- **v2.5 第 9 个月必发**（不拖到 v3.0）

### Phase 4 — v3.0 +Computer Use 兼容层 + Reviewer（2 个月）

**目标**：操控电脑 GUI（**不自研视觉理解，借用兼容层**）+ 加入 Reviewer 角色

**交付清单**：

**Computer Use 兼容层**（**不自研 OCR/UI Detection**）：
- **首选 Codex Computer Use 协议**（Codex 26.527 开源协议）
- 备选 OpenAI Computer Use / Browser Use Desktop
- 复用现成视觉模型（OCR / UI Detection / Element Localization）
- 鼠标键盘操作通过兼容层 API 委托
- Computer Use 跑在 Docker sandbox 内

**Reviewer 角色**：
- 验证、self-check、Code Review 自动化
- 流水线：`Planner → Executor → Reviewer`（三角色）

**Compaction 钩子化**：
- 让 extension 完全替换默认 Compaction
- 单元测试覆盖崩溃恢复（JSONL append-only）

**验收标准**：
- 在 sandbox 内能开指定应用、点击、输入
- Compaction 后 token 下降 70% 但语义保留
- Reviewer 能发现 Coder 输出中的明显 bug
- **v3.0 第 11 个月必发**

#### ⚠️ Phase 4 红线
- **Windows Computer Use 不做**（OS 差异大，v3.0 主要验证 macOS + Linux X11）
- **OCR/UI Detection 不自研**（复用 Codex 兼容层现成视觉模型）

### Phase 5 — v4.0 Agent OS（2 个月）

**目标**：从"命令行助手"变成**"长期运行的软件工程 Agent"**（long-running software engineering agent）

**交付清单**：

**完整 5 角色 Multi-Agent 流水线**（`Planner → Researcher → Coder → Reviewer → Executor`）：
- **Researcher**（v4.0 新增：信息收集、Codebase 探索、上下文检索）
- Coder = v1.0 Executor 特化（v3.0 Reviewer 已加）
- 流水线：`Planner → Researcher → Coder → Reviewer → Executor`（**5 角色 = 5 函数，单 process 内**）
- 单 Agent 模式保留为 `mode=single`（**v1.0 行为完全兼容**）

**TaskGraph 引擎**（v2.5 Planner 输出升级）：
- Planner 输出 DAG 表示子任务依赖
- 任务调度：依赖满足才执行、并行无依赖任务、失败重试、超时中断
- **跨 session 持久化**（重启不丢任务图）
- 与 Session DAG **正交**（Session DAG = 消息树，TaskGraph = 工作流图）

**Persistent Memory**（v2.0 Memory Ranking 升级）：
- 跨 session 知识沉淀（用户偏好 / 项目决策 / 实体链接）
- hand-edit 友好
- 跨 5 角色共享

**Tool Router 升级**：v1.0 registry → v4.0 语义路由

**MCP Marketplace**（**与 Plugin Marketplace 拆开**）：
- Plugin Marketplace = 功能包市场（UI/事件/工具）
- MCP Marketplace = 纯工具服务市场

**Desktop**（Tauri 2.x）+ **Web**（可选）+ **Channels** + 文档站（VitePress）

**验收标准**：
- **5 个 Agent 角色 + TaskGraph 协同跑通**
- TaskGraph 跨重启恢复
- 桌面 GUI 跑起来
- 文档站上线
- **v4.0 第 13 个月必发**

---

## 6. 时间锚

| Phase | 版本 | 时长 | 累计 | 核心交付 |
|---|---|---|---|---|
| Phase 1 | v1.0 | 3-4 个月 | 3-4 个月 | Claude Code Lite |
| Phase 2 | v1.5 | 2-3 个月 | 5-7 个月 | **Codex Core 8/14 + Code Intelligence 基础** |
| Phase 3 | v2.0 | 3-4 个月 | 8-11 个月 | **Observe：Browser Agent 4 件 + Memory Ranking + Code Intel 增强 + 4 项 Tier-2** |
| **Phase 3.5** | **v2.5** | **1 个月** | **9-12 个月** | **Plan：Planning Framework（4 组件 + DAG）** |
| Phase 4 | v3.0 | 2-3 个月 | 11-15 个月 | **Execute+Review：Browser Agent 增强 3 件 + Reviewer + Computer Use 兼容层** |
| Phase 5 | v4.0 | 2-3 个月 | **13-17 个月** | **Research+Agent OS：5 角色 + TaskGraph + Persistent Memory + Desktop** |

**单人开发 13-17 个月节奏**（中位数 16 个月）→ **严格执行**（不新增需求 / 每版本强制发布 / Computer Use 不自研 / Browser Agent 分阶段）→ **成功概率 80%+**

**vs 上版（5 阶段 13 个月）**：
- v1.5 砍 4 项（Automation/Cron/Remote TUI/Compaction 挪到 v2.0），加 Code Intel 基础
- v2.0 拆 Tier-1/Tier-2（**DAG 砍到 v2.5**），月份 3-4 月（DAG 砍走后风险↓）
- v2.5 改为 Planning Framework（4 组件 + DAG + Boundary + Plan Cache）
- v3.0 加 Browser Agent 增强 3 件（Visual / Error Recovery / Adaptive Retry）
- v3.0 月份 2-3 月（Computer Use 改兼容层不自研，省基础 1 个月，但 Browser 增强加 1 个月）
- v4.0 月份 2-3 月（Researcher 从 v4 独立抽出后，v4 收尾 2 个月足够；Desktop 复杂度可能拖到 3 月）

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
| Reasonix 1.0 6 周未发 | 中 | **强制 release 节奏**（每周一 minor，**v1.0/v1.5/v2.0/v3.0/v4.0 必发**） |
| **5 角色 Multi-Agent 协同效率** | 高 | v4.0 用单 process 内 5 函数实现，**不真的 spawn 5 个 Agent**（避免 Anthropic/OpenAI 那种昂贵的多 Agent 编排） |
| **TaskGraph 持久化失败** | 中 | **强制 JSONL append-only**（与 Session 同套路），单元测试覆盖崩溃恢复 |
| **Persistent Memory 跨 session 污染** | 中 | 显式 scope 标记（`user` / `project` / `session`），hand-edit 优先于自动写入 |
| **Coder 重复造轮子** | 中 | Coder 复用 v1.0 Executor 代码，**只加 Code-aware 工具**，不写第二套 agent 循环 |
---

## 9. 文档关系

- **本文件** ARCHITECTURE.md：4 层架构 + 5 阶段版本锚 + 砍掉清单（**架构与版本骨架**）
- **ROADMAP.md**：5 阶段的 Sprint 任务清单（**执行细节**，与本文件版本锚一致）
- **README.md**：项目对外介绍（一句话定位 = v1.0 = Claude Code Lite）
- **docs/research/**：5 份深度调研（**设计来源**，不随版本变）

**4 份架构设计文档**（**docs/design/**）：
- [AGENT_RUNTIME.md](./design/AGENT_RUNTIME.md)：4 角色契约 + Task/Message/Context/Observation/Memory 数据结构
- [CAPABILITY_MODEL.md](./design/CAPABILITY_MODEL.md)：5 套能力来源（Tool/MCP/Plugin/Browser/Computer）统一抽象
- [CODE_INTELLIGENCE.md](./design/CODE_INTELLIGENCE.md)：4 模块（Workspace Index / Symbol Graph / Reference Graph / Semantic Search）关系
- [BROWSER_PLANNER.md](./design/BROWSER_PLANNER.md)：Observe → Plan → Act → Recovery 循环

**原则**：design/ 文档**只写架构 / 边界 / 职责 / 接口 / 数据流**，**不写实现细节**（不选 sqlite/postgres/lancedb，不写 tree-sitter query，不写 Playwright API）

---

## 10. Release Gates（**项目级止损机制，假设驱动**）

> **核心思想**：DeepWhale 不只是"功能路线图"，而是**"假设驱动开发路线图"**——3 个 Technical Bets + 3 个 Release Gates 守护。完整定义见 [ROADMAP.md §Release Gates](./ROADMAP.md)。

### 3 个 Technical Bets

| Bet | 等级 | 验证版本 | 失败后果 | 赌的是什么 |
|---|---|---|---|---|
| **Bet-1 Code Intelligence** | **P0** | v1.5 | Coding Agent 失败，项目失去核心价值 | Agent 能理解大型代码库（100K LOC） |
| **Bet-2 Browser Planner** | **P1** | v2.0 | 退化为 Claude Code 级产品（仍有价值）| Agent 能稳定获取外部信息 |
| **Bet-3 Long-Horizon Stability** | **P0** | v3.0 | Multi-Agent 失败，5 角色失去意义 | Agent 能持续 30-50 步不漂移 |

### 3 个 Release Gates

| Gate | 类型 | 触发时机 | 通过 → | 失败 → |
|---|---|---|---|---|
| **Gate-1** Code Intelligence Kill Test | **Kill** | v1.5 release 前 | 进入 v2.0 | 停止 Browser/Computer/Desktop，优先修 Code Intel |
| **Gate-1.5** Browser Viability Decision Gate | **Decision** | v2.0 release 前 | ≥80% 完整路线 | 50-80% 降级 / <50% 砍 Browser 投资 |
| **Gate-2** Long-Horizon Kill Test | **Kill** | v3.0 release 前 | 进入 v4.0 | 暂停 Researcher/TaskGraph/Desktop，优先修 Planning/Compaction/Reviewer |

### Gates 与架构层关系

| Gate | 验证的架构层 | 关键模块 |
|---|---|---|
| **Gate-1** | Code Intelligence Layer + 部分 Agent Layer | Tree-sitter + Symbol Graph + Workspace Index |
| **Gate-1.5** | Runtime Layer（Browser Agent Runtime）| Browser Planner 4 件基础 |
| **Gate-2** | Agent Layer + Memory Layer + 部分 Runtime | Planner + Reviewer + Compaction 三者协同 |

**vs 4 份 design 文档的引用关系**：
- **AGENT_RUNTIME.md** 直接被 Gate-2 引用（4 角色契约）
- **CODE_INTELLIGENCE.md** 直接被 Gate-1 引用（4 模块关系）
- **BROWSER_PLANNER.md** 直接被 Gate-1.5 引用（Observe/Plan/Act/Recovery）
- **CAPABILITY_MODEL.md** 跨 Gates 被引用（统一 Capability 抽象）

---

**最后更新**：2026-06-03（确立 4 层架构 + 5 阶段版本锚 + 3 Bets + 3 Gates，砍掉 18 项延后事项）
**当前阶段**：Phase 1 Sprint 0（4 包 monorepo + 基础设施）
**下次更新**：v1.0 release 时
