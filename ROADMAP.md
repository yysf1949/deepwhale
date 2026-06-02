# 🗺 deepwhale ROADMAP

> **5 个 Sprint，10 周，从 0 到 v1.0**

## 总览

| Sprint | 周次 | 主题 | 关键交付 | 状态 |
|---|---|---|---|---|
| **Sprint 0** | 第 1 周前 3 天 | 技术选型 + monorepo 骨架 | `pnpm dev` 跑通最小 CLI | 🚧 进行中 |
| **Sprint 1** | 第 1-2 周 | MVP 核心：能用的 CodeWhale | DeepSeek 多轮对话 + 文件/Shell + Session 恢复 | ⏳ 待开始 |
| **Sprint 2** | 第 3-4 周 | 扩展平台：装什么有什么 | Skills + Extension API + Hooks + Plugins | ⏳ 待开始 |
| **Sprint 3** | 第 5-6 周 | MCP + Computer Use | Browser MCP + 截图/键鼠 + OS 沙箱 | ⏳ 待开始 |
| **Sprint 4** | 第 7-8 周 | 多渠道 + 桌面 + 远程 | Tauri GUI + 飞书/TG/邮件 + Remote TUI | ⏳ 待开始 |
| **Sprint 5** | 第 9-10 周 | 自动化 + 打磨 | Cron + Session 分享 + Compaction + 文档站 | ⏳ 待开始 |

---

## Sprint 0：技术选型 + monorepo 骨架（3 天）

**目标**：`pnpm dev` 跑通一个最小 CLI，调用 DeepSeek V4-Flash 流式输出"hello"。

### 任务清单

- [ ] 建 GitHub 仓库 `yysf1949/deepwhale`（Private）
- [ ] 克隆 [pi-mono](https://github.com/earendil-works/pi) 拆 monorepo 骨架（**clone 删减，不是 fork**）
- [ ] 起 pnpm workspace + Turborepo
- [ ] 配置 `~/.deepwhale/config.toml` schema（用 zod 校验）
- [ ] `@deepwhale/ai` 实现 OpenAI 兼容客户端（指向 `api.deepseek.com`）
- [ ] `@deepwhale/coding-agent` 实现最小 CLI 入口
- [ ] CI：GitHub Actions（lint + typecheck + 基础测试）

### 验收标准

```bash
$ pnpm dev
deepwhale> hello
🤖 你好！我是 deepwhale 🐋，当前模型 deepseek-v4-flash
deepwhale> 
```

### 借鉴资产

- pi-mono monorepo 结构
- DeepSeek-TUI / CodeWhale 的双二进制思想（先单二进制，必要时再拆）
- Hermes response-footer 教训：hot-reload mtime 检测必须在 wrapper 内部

---

## Sprint 1：MVP 核心（2 周）

**目标**：能跟 DeepSeek 多轮对话、编辑本地文件、跑 shell 命令、二次启动恢复会话。

### 任务清单

- [ ] **DeepSeek 接入**（`@deepwhale/ai`）
  - OpenAI 兼容客户端
  - 流式响应（SSE）
  - 错误重试 + 限流退避
- [ ] **前缀缓存经济性**（Reasonix 借鉴）
  - system prompt 稳定化（Constitution + tools schema）
  - 工具调用 history 序列化
  - 控制台实时显示 `cache_hit_rate` + `cost/turn`
- [ ] **Tool Registry**：内置 6 个核心工具
  - `bash`（白名单 shell）
  - `read_file` / `write_file` / `edit_file`（hash 锚定，omp/pi 借鉴）
  - `grep` / `find`（可选用 Rust N-API 加速）
  - `web_search` / `web_fetch`（Bing/Baidu 切换）
- [ ] **3 种运行模式**（CodeWhale 借鉴）
  - `interactive`（默认，TUI）
  - `print`（`deepwhale -p "..."` 一次性）
  - `rpc`（JSON-RPC over stdio，供 channel 接入）
- [ ] **Sessions 持久化**（`~/.deepwhale/sessions/<uuid>.jsonl`）
  - 启动时加载最近会话
  - `/resume` 命令切换
- [ ] **Constitution**（CodeWhale 借鉴）
  - `prompts/base.md` 写 9 层权威
  - i18n 用 `from agent.i18n import t`（别写 gateway.i18n 错路径）

### 验收标准

- 能跟 DeepSeek V4-Flash 多轮对话（10 轮上下文连贯）
- 能编辑本地文件（read/write/edit 三件套）+ 跑命令（白名单内）
- 二次启动自动恢复上次会话
- 5 轮后 `cache_hit_rate ≥ 90%`
- 单 turn cost ≤ $0.05

### 借鉴资产

- CodeWhale 的 Constitution 9 层权威（[详见](https://github.com/Hmbown/CodeWhale)）
- Reasonix 的 prefix-cache 4 个机制（[详见](https://github.com/esengine/DeepSeek-Reasonix)）
- pi-coding-agent 的 session-manager
- omp / oh-my-pi 的 hash-anchored edit

---

## Sprint 2：扩展平台（2 周）

**目标**：装 1 个社区 skill 就能用，写 1 个 30 行 Extension 注册自定义工具。

### 任务清单

- [ ] **Skills 系统**（对齐 Codex Skills 开放标准 + pi Skills 借鉴）
  - 目录：`~/.deepwhale/skills/`、`<project>/.deepwhale/skills/`
  - 格式：Markdown + YAML frontmatter（`name` / `description` / `triggers`）
  - 内置 3 个示范：commit / test / review-pr
- [ ] **Extension API**（pi 借鉴，**最关键**）
  - `defineTool({ name, description, parameters, execute })` 注册工具
  - 生命周期事件：`session.start` / `tool.before` / `tool.after` / `session.end` / `message.receive`
  - **安装方式**：`deepwhale install npm:@your-org/your-skill`
- [ ] **Hooks**（5 事件）
  - `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Stop` / `SessionStart`
- [ ] **Plugin 打包**
  - `deepwhale plugin build` 把 skills + extensions + hooks 打成 `.dwp`
  - 类似 `.vsix` 安装机制
- [ ] **Package Manager**（pi 借鉴）
  - 解析 npm 命名空间 `@deepwhale/`
  - 安全审计：Skills 默认只读，**需 `permissions:` 显式声明写权限**

### 验收标准

- 装 1 个社区 skill（`deepwhale install npm:@volt/awesome-skills`）能用
- 写 1 个 30 行 Extension 注册自定义工具
- 装 1 个带 hooks 的 plugin，hook 真的触发
- 打包 1 个 `.dwp` 文件能跨机安装

### 借鉴资产

- pi-coding-agent 的 `defineTool` + Extension API（[详见](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)）
- Codex Skills 开放标准（[openai/codex/skills](https://developers.openai.com/codex/skills)）
- Reasonix 的 Skills + Hooks 5 事件

---

## Sprint 3：MCP + Computer Use（2 周）

**目标**：装 Playwright MCP 后能自动开网页填表，Computer Use 能在 sandbox 内操控 GUI。

### 任务清单

- [ ] **MCP 完整支持**（官方 SDK + Reasonix 借鉴）
  - client：stdio / SSE / Streamable HTTP
  - server：让 deepwhale 自己也作为 MCP server 暴露（`deepwhale serve --mcp`）
  - 配置：`~/.deepwhale/mcp.json`
- [ ] **Browser MCP**（Codex 复刻点 1）
  - 集成 `@playwright/mcp` 开箱即用
  - 截图 + 元素 click + 表单填写 + JS evaluate
  - **预置 1 个 Browser skill**：访问 URL → 提取信息 → 截图存档
- [ ] **Computer Use**（Codex 复刻点 2）
  - 截图工具（`screenshot`）：macOS `screencapture` / Linux `grim` / Win `nircmd`
  - 输入工具（`mouse_move` / `mouse_click` / `keyboard_type`）：跨平台 `nut.js`
  - **OS 沙箱保护**（CodeWhale 借鉴）：macOS Seatbelt / Linux Landlock，鼠标键盘限制在窗口内
- [ ] **LSP 集成**（CodeWhale 借鉴，可选）
  - rust-analyzer / pyright / tsserver 实时诊断
  - 编译错误当自我纠正信号

### 验收标准

- 装好 Playwright MCP 后，`deepwhale` 描述任务能自动打开网页、填表、截图
- Computer Use 能在 sandbox 内操控指定应用（指定窗口、限制输入范围）
- LSP 报错能自动反馈给模型

### 借鉴资产

- 官方 `@modelcontextprotocol/sdk`
- `@playwright/mcp`
- CodeWhale 的 Seatbelt / Landlock 实现
- nut.js 跨平台输入库

---

## Sprint 4：多渠道 + 桌面 + 远程（2 周）

**目标**：飞书发消息给 bot，CLI 看到任务入队；Tauri 桌面 GUI 能跑；关闭 GUI 后任务继续。

### 任务清单

- [ ] **Channels**（Hermes 借鉴）
  - 飞书：bot 消息 → RPC 投递 → 流式回写
  - Telegram：inline keyboard 确认 / 取消
  - 邮件：IMAP 监听，主题做指令
- [ ] **Tauri 桌面客户端**（Reasonix 借鉴）
  - 多 tab 会话
  - 右侧 panel 显示 agent 读/改过的文件
  - 底部 cost / cache / token meters
  - 复用 `coding-agent` SDK 启动
- [ ] **Web UI**（可选）：浏览器访问 `localhost:7331`
- [ ] **Remote TUI**（Codex 复刻点 3）
  - `deepwhale serve --http` 暴露 `/v1/*`
  - 远端 TUI 通过 WebSocket 连接

### 验收标准

- 飞书发消息给 bot，能在 CLI 看到任务入队 + 流式回写
- Tauri 桌面 GUI 跑起来，多 tab 切换不丢状态
- 关闭桌面 GUI 后，后台 task 继续跑

### 借鉴资产

- Hermes Agent channel 模式（[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)）
- Reasonix Tauri 桌面客户端（[esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)）
- CodeWhale 的 `serve --http` 暴露 /v1/*

---

## Sprint 5：自动化 + 打磨（2 周）

**目标**：装好 daily-report automation，每天早上 9 点自动生成报告推到飞书。

### 任务清单

- [ ] **Cron Automations**（Codex 复刻点 4）
  - `~/.deepwhale/automations/*.yaml` 定义定时任务
  - 模板：daily-report / code-review / test-runner / dep-update
- [ ] **Session 分享**（pi 借鉴）
  - `deepwhale share <session-id>` → 公开 URL
  - HTML 渲染 + 敏感信息脱敏
- [ ] **Compaction**（pi 借鉴）
  - 上下文超 80% 自动摘要压缩
  - 保留关键决策、文件修改、工具结果
- [ ] **Plugin Marketplace**
  - 发布到 npm 命名空间 `@deepwhale/`
  - `deepwhale search skills` 命令
- [ ] **文档站**
  - `deepwhale.dev`（GitHub Pages + VitePress）
  - Quickstart / Skills 开发指南 / Extension API 文档 / FAQ
- [ ] **示例扩展 5-10 个**
  - `commit`（git commit message 生成）
  - `test`（自动跑测试 + 报告）
  - `review-pr`（PR review）
  - `refactor`（重构建议）
  - `dep-update`（依赖更新）
  - `changelog`（changelog 生成）
  - `security-scan`（安全扫描）
  - `i18n-extract`（i18n key 提取）

### 验收标准

- 装好 daily-report automation，每天早上 9 点自动生成报告推到飞书
- session 压缩后 token 数下降 70% 但语义保留
- 文档站上线，至少 5 个示例扩展可一键安装

---

## 关键架构决策（实施前定）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 主语言 | TypeScript（Node ≥ 22） | pi-mono 验证、扩展开发快 |
| TUI 框架 | Ink（React 19）起步 | Reasonix 实战验证、跨平台一致 |
| 沙箱 | 双层：白名单 shell + Rust OS 沙箱 | 跨平台一致 + 安全性 |
| 分发 | npm + Tauri + Homebrew + Docker | 跟 pi/Codex/Reasonix 一致 |
| 配置 | TOML | CodeWhale 验证，注释友好 |
| Skills 格式 | 对齐 Codex 开放标准 | 跨工具复用 |
| MCP | 官方 SDK | 唯一标准 |
| License | MIT | 全家桶都是 MIT |

## 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| DeepSeek API 限流 | 中 | 前缀缓存降耗 + Flash/Pro 智能路由 |
| Windows 沙箱复杂 | 中 | Sprint 3 暂只 macOS/Linux，Windows 走 Job Object 兜底 |
| MCP 协议演进 | 低 | pin 官方 SDK minor 版本 |
| Skills 安全（恶意 skill 偷数据） | **高** | Skills 沙箱：默认只读，permissions 显式声明 |
| 跨渠道状态同步 | 中 | 所有渠道走同一 RPC + Session Manager |
| 用户基数小 → 没人写扩展 | 中 | 自带 5-10 个示范 skill 降低门槛 |

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

---

**最后更新**：2026-06-02
**当前 Sprint**：Sprint 0（技术选型 + monorepo 骨架）
**下次更新**：Sprint 0 完结时
