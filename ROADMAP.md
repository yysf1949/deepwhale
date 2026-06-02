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

## Sprint 3：MCP + Computer Use（2 周，Windows 深度对齐 OpenAI Codex 26.527）

**目标**：装 Playwright MCP 后能自动开网页填表；**Computer Use 跨 macOS / Linux / Windows 三大平台**，多模态融合（截图 + 平台原生 accessibility tree），**OS 级沙箱保护**。

> **背景**：OpenAI Codex 26.527（2026-05-29）**首次**把 Computer Use 带到 Windows。深挖官方沙箱文章（[Building a Safe, Effective Sandbox on Windows](https://openai.com/index/building-codex-windows-sandbox)）后，**Windows 沙箱不能简单套 macOS/Linux 方案**——必须**重做**。本 Sprint 任务清单 = Codex 实战 + deepwhale 复刻。
>
> **关键事实**（来自 Codex #19305 + oflight.co.jp 2026-06-01）：
> - **Windows 是 foreground-only**（不像 macOS 可后台并行多个 agent 各自带光标）
> - **Windows 没有原生 sandbox 等价物**（macOS Seatbelt / Linux Landlock/seccomp），OpenAI **自建** 了 2 套（unelevated → elevated）
> - **Windows 沙箱不工作时的退化选项**：（a）每条命令都审批（低效）；（b）Full Access 模式（无监督）—— deepwhale v1.0 不接受这个降级

### 任务清单

#### A. 核心沙箱重做（跨平台，对齐 Codex）

- [ ] **3 模式 sandbox**（对齐 Codex `sandbox_mode`）
  - `read-only` / `workspace-write` / `danger-full-access`
  - `workspace-write` 默认 `network_access = false`
  - `writable_roots` / `exclude_tmpdir_env_var` / `exclude_slash_tmp` 可调
- [ ] **3 approval policy**（对齐 Codex `approval_policy`）
  - `untrusted`（任何动作都问）/ `on-request`（越界时问）/ `never`（CI 用）
  - `sandbox_mode` × `approval_policy` **正交**组合
- [ ] **macOS Seatbelt**
  - `~/.deepwhale/sandbox/macos.sbpl`（`codex-rs/sandboxing/src/seatbelt.rs` 借鉴）
  - **`(allow mach-register (global-name-regex #"^org\.chromium\."))` 必备**（Codex #21292 踩坑前置，Playwright Chromium 多进程 IPC）
- [ ] **Linux 三件套**
  - Bubblewrap（user/mount namespace） + Landlock（FS LSM） + seccomp（syscall 过滤，默认禁 `socket`）
  - Ubuntu 24.04 unprivileged user namespace 受限时，引导装 apparmor profile
  - `codex-rs/bwrap` + `codex-rs/linux-sandbox` 借鉴
- [ ] **Windows 沙箱（重做，详见 §3 Windows 深度）**
  - v1.0 走 Codex **unelevated sandbox** 方案（不需要 admin）
  - `write_restricted` token + 合成 SID `sandbox-write`
  - 拒写 `<cwd>/.git` / `<cwd>/.deepwhale` / `<cwd>/.agents`
  - 网络用 env 变量 fail-closed（`HTTPS_PROXY=http://127.0.0.1:9` 等）
  - v1.1 再升级 Codex **elevated sandbox**（专用 local user + 防火墙）
- [ ] **用户可扩展沙箱**（对齐 Codex #24742）
  - `~/.deepwhale/sandbox-extra.{sb,profile}` drop-in 文件
  - 动态拼接到主策略（Sprint 3 末实现）
- [ ] **Process Hardening**（pre-main 阶段）
  - 禁用 `LD_PRELOAD` / `LD_LIBRARY_PATH`（Linux/macOS）
  - 清理 `DEEPWHALE_` 前缀 env vars（防 API key 注入到子进程）
  - 禁 core dump、禁 ptrace
- [ ] **Network Proxy**（与 Sprint 2 一起做）
  - MITM proxy：白名单子进程联网（默认只允许 DeepSeek API）
  - 借鉴 `codex-rs/network-proxy`

#### B. MCP 完整支持

- [ ] MCP client：stdio / SSE / Streamable HTTP（官方 SDK）
- [ ] MCP server：`deepwhale serve --mcp`（让 deepwhale 自己也作为 MCP server 暴露）
- [ ] `~/.deepwhale/mcp.json` 配置
- [ ] **集成 `@playwright/mcp@latest` 作为 browser provider**
  - `--allowed-hosts` / `--blocked-origins` / `--isolated` / `--headless` 全部暴露
  - **预置 1 个 Browser skill**：访问 URL → 提取信息 → 截图存档
  - `browser_run_code_unsafe` 工具默认**关闭**

#### C. Computer Use（跨平台，多模态融合）

- [ ] **Action 完整清单**（对齐 Codex computer-use-preview）
  - `screenshot` / `screenshot_with_annotated_elements`
  - `left_click` / `right_click` / `middle_click` / `double_click`
  - `type` / `key` / `key_hold` / `key_release`
  - `mouse_move` / `scroll` / `wait`
  - `back` / `forward` / `reload` / `search` / `find` / `zoom`
  - **避开 `back` action 已知坑**：computer-use-preview 不发 `back`，用 `key` `Alt+Left` 代替
- [ ] **多模态融合**（对齐 Codex 关键创新）
  - 截图（screenshot）+ **平台原生 accessibility tree**
  - 定位：**元素 ref 优先**（无需算坐标），**坐标 fallback**
- [ ] **macOS**
  - 截图：`screencapture -x` CLI / Core Graphics API
  - UI 树：**ApplicationServices.framework**（AX API）
  - 输入：Quartz Event Services（CGEvent）
  - TCC 权限引导：Screen Recording + Accessibility（首次启动）
  - Locked Computer Use：**v1.0 不做**（Apple AuthorizationPlugIn 复杂）
- [ ] **Linux**
  - 截图：`grim` / `maim` / `scrot`（Wayland/X11 不同工具）
  - UI 树：**AT-SPI**（GNOME 桌面）/ `accessibility` D-Bus 接口
  - 输入：`xdotool`（X11）/ `ydotool`（Wayland）
- [ ] **Windows**（**最复杂，详见 §3**）
  - 截图：`windows-capture` Rust crate（Graphics Capture API + DXGI Desktop Duplication）
  - UI 树：**UI Automation API**（`uiautomation` Rust crate v0.25.0，27 万下载）
  - 输入：Win32 `SendInput` / `mouse_event`（通过 napi-rs 直调 Rust）
  - **Foreground-only 限制**（与 Mac 区别见 §3）
- [ ] **App-level allowlist**（对齐 Codex `@AppName`）
  - 首次提到新 app 必须询问
  - "Always allow" 让未来自动
  - 敏感操作（删除、支付）**始终**额外询问
- [ ] **OS 沙箱保护**（每平台）
  - macOS：Seatbelt 沙箱内执行
  - Linux：bwrap 沙箱内执行
  - Windows：受限 token 沙箱内执行（详见 §3）

#### D. Browser Tool 路由（Codex 决策树）

- [ ] 设计 `@Browser` / `@Chrome` / `@Computer` 强制调用语法
- [ ] 自动决策树（v1.0 简化版）
  ```
  任务
    ↓
  [1] localhost / 公开页？──Yes──→ Playwright MCP
    │ No
    ↓
  [2] 桌面 GUI 应用？──Yes──→ Computer Use
    │ No
    ↓
  [3] 提示用户
  ```
- [ ] **v1.0 只实现 Playwright MCP + Computer Use**（In-app Browser / Chrome Extension 留 v1.1）
- [ ] Docker 镜像内置 desktop 环境（参考 OpenAI 官方 Computer Use Docker 模板），方便用户在 Linux server 上跑 Windows computer use via RDP

#### E. LSP 集成（次要）

- [ ] rust-analyzer / pyright / tsserver 实时诊断
- [ ] 编译错误当自我纠正信号

### §3 Windows 深度（为什么 v1.0 要重做）

> **本节是研究 deepwhale Sprint 3 必须对齐 Codex Windows 沙箱的关键**。

#### 3.1 Codex Windows 沙箱的"两代"演进（2025-09 → 2026-05）

| 阶段 | 名称 | 设计 | 缺陷 |
|---|---|---|---|
| **第一代** | unelevated sandbox | write_restricted token + 合成 SID `sandbox-write` + env 变量 fail-closed 禁网络 | 网络保护仅"建议性"，任何带私有 socket 栈的程序可绕过；ACL 改动慢 |
| **第二代** | elevated sandbox | 同样 write_restricted token，但 principal = Codex **自建的专用 local user** + **Windows Firewall 规则** | 需 admin 一次设置（创建 user + 防火墙规则） |

**deepwhale v1.0 决策**：先实现 **unelevated**（无需 admin，普通用户能跑），v1.1 再升级 elevated。理由：
- v1.0 用户基数小，先解决"能跑"问题
- 规避 "v1.0 + 需要 admin elevation" 的兼容性噩梦
- Codex 自己也是这个路线

#### 3.2 Windows 沙箱技术栈（deepwhale 实现参考）

| 层 | 技术 | Rust crate / API | 备注 |
|---|---|---|---|
| **Token 降权** | Win32 `CreateRestrictedToken` | `windows` crate | 创建 write_restricted token，restricted SID 列表 = `[Everyone, Logon, Synthetic, sandbox-write]` |
| **ACL 设置** | Win32 `SetSecurityInfo` | `windows` crate | 给 workspace 加 `sandbox-write` SID 的写权限；给 `.git` / `.deepwhale` / `.agents` 加 deny ACL |
| **网络 fail-closed** | env 变量 | 直接 setenv | `HTTPS_PROXY=http://127.0.0.1:9` 等 + `GIT_SSH_COMMAND=cmd /c exit 1` |
| **进程启动** | `CreateProcessAsUser` | `windows` crate | 在受限 token 下启动子进程 |
| **Computer Use 截图** | Graphics Capture API | `windows-capture` crate | 跨 Windows 10/11，避开 GDI 性能差 |
| **Computer Use UI 树** | UI Automation API | `uiautomation` crate v0.25.0 | 27 万下载，**Windows 原生 accessibility** |
| **Computer Use 输入** | Win32 `SendInput` | `windows` crate | 鼠标键盘底层 API |

#### 3.3 Windows Computer Use 的"Foreground-Only"约束

**Codex 5/29 在 Windows 推的 Computer Use 跟 Mac 有本质区别**：

| 维度 | Mac (Codex) | Windows (Codex) | 原因 |
|---|---|---|---|
| **多 agent 并行** | ✅ 4/2026 起的"background computer use"，多个 agent 各自有光标 | ❌ **foreground-only**，同一时刻只能 1 个 agent 操控 active desktop | Windows 只有 1 个 desktop session，多 agent 会互抢光标 |
| **锁屏操作** | ✅ Locked Computer Use（Apple AuthorizationPlugIn 协议） | ❌ 不支持 | Apple 协议独有 |
| **后台截图** | ✅ TCC Screen Recording | ⚠️ 需用户主动 enable "Run as different user" | Windows 截图 API 默认需要 active session |
| **App allowlist** | ✅ | ✅ | 一致 |

**对 deepwhale 的启示**：
- v1.0 在 Windows 上**先接受 foreground-only 限制**
- UI 必须清晰显示 "🖥️ CodeWhale 正在操控你的桌面"（用户在跑别的会看见）
- v1.x 探索：**RDP 虚拟桌面**（每个 agent 一个 RDP session，模拟 Mac 的 background）—— Codex 也在摸索
- Linux 没有这个限制（多 X11/Wayland session）

#### 3.4 Windows Computer Use 多模态融合

**截图层**（`windows-capture` 借鉴）：
```rust
// windows-capture 简化示例
use windows_capture::capture::GraphicsCaptureApiHandler;

let mut handler = GraphicsCaptureApiHandler::new(...);
let frame = handler.wait_for_frame()?;
let buffer = frame.buffer()?;  // BGRA 像素
```

**UI Automation 层**（`uiautomation` 借鉴）：
```rust
use uiautomation::UIAutomation;

let automation = UIAutomation::new()?;
let root = automation.get_root_element()?;
let walker = automation.create_tree_walker()?;
let condition = automation.create_true_condition()?;
let mut elements = vec![root.clone()];
for element in &elements {
    let children = walker.get_next_sibling(element)?;
    // 每个 element 暴露 .name() / .control_type() / .bounding_rectangle()
}
```

**融合策略**（对齐 Codex）：
1. 模型发出 `screenshot` action → Rust 返回 BGRA buffer → TS 编码 PNG → 发给 model
2. 模型发出 `left_click` action 时**优先**查 UI Automation ref 树（避免坐标漂移）
3. 失败时 fallback 到坐标点击

#### 3.5 Windows 沙箱与 Computer Use 的边界

**关键问题**：用户授权 Codex 截图 + 操控桌面时，**沙箱内 vs 沙箱外**的边界在哪？

**Codex 决策**（来自 oflight.co.jp 2026-06-01 报道）：
> "Computer use runs on the active desktop. Windows users, this one's for you."

**deepwhale 决策**：
- **Computer Use 必须在沙箱外执行**（沙箱会阻止屏幕截图和输入事件）
- 但**普通 shell / 文件操作**仍在沙箱内
- 用户授权 Computer Use 时**明确提示**："以下操作将不被沙箱保护，但仅限当前 app"
- App-level allowlist 走"Always allow"后才继续（避免反复打断）

#### 3.6 Windows 平台特殊坑（必看）

| 坑 | 现象 | 对策 |
|---|---|---|
| **UAC 弹窗** | agent 触发了需要 UAC 的操作 → 永远卡住 | **agent 不允许触发 UAC 操作**，pre-main 检查 token elevation level，拒绝 high |
| **DPI 缩放** | 截图坐标和 UI Automation ref 对不上 | 用 DPI 感知的 `GetPhysicalCursorPos` / `SetPhysicalCursorPos` |
| **多显示器** | 截图跨多显示器边界 → 模型困惑 | 默认只截主显示器，扩展位可选 |
| **TCC 类似机制** | Windows 没有 TCC，但有 UAC + AppLocker | 失败时引导用户去 Settings → Privacy 授权 |
| **UIA 不支持的应用** | 老 Win32 应用 / 部分游戏 | 自动 fallback 到纯截图 + 坐标点击（精度差，UI 提示用户） |
| **输入法干扰** | 中文 IME 抢键盘事件 | `type` action 前先 `key` `Esc` 退出 IME，`type` 完后再激活 |

### 验收标准

- 装好 Playwright MCP 后，**macOS / Linux / Windows** 描述任务能自动打开网页、填表、截图
- Computer Use 在三平台都能操控指定 app（多模态融合：截图 + UI 树）
- **Windows foreground-only 限制**在 UI 上明确告知
- **Windows 沙箱在普通用户权限下可用**（无需 admin）
- **App-level allowlist 真的工作**（mention 新 app 时会问）
- Playwright 在 macOS Seatbelt 内**不崩溃**（前置加好 Chromium mach-register 规则）
- LSP 报错能自动反馈给模型

### 借鉴资产

- **官方文档**：
  - [OpenAI Codex Windows 沙箱官方文章（David Wiesen, 2026-05-13）](https://openai.com/index/building-codex-windows-sandbox)
  - [Codex Computer Use on Windows（oflight.co.jp 2026-06-01）](https://www.oflight.co.jp/en/columns/openai-codex-computer-use-windows-2026)
  - [Codex #19305 issue（用户为什么需要 Windows Computer Use）](https://github.com/openai/codex/issues/19305)
- **Codex 源码**：
  - `codex-rs/sandboxing/src/seatbelt.rs`（macOS）
  - `codex-rs/sandboxing/src/landlock.rs`（Linux）
  - `codex-rs/windows-sandbox`（Windows）
- **Rust 库**：
  - `windows` crate（Win32 API 绑定）
  - `windows-capture` crate（截图，Graphics Capture API）
  - `uiautomation` crate v0.25.0（27 万下载，UI Automation API）
  - `nut.js`（跨平台输入，仅 macOS/Linux；Windows 走 napi-rs 直调 SendInput）
- **MCP**：
  - `@modelcontextprotocol/sdk`（官方）
  - `@playwright/mcp@latest`（Playwright 团队）
  - Playwright MCP 实战（[blog.gopenai.com](https://blog.gopenai.com/automating-e2e-chat-flow-testing-with-codex-playwright-mcp-1ce4020dcbca)）

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
| 沙箱 | **3 模式**（read-only / workspace-write / danger-full-access） + **3 approval policy**（untrusted / on-request / never），对齐 Codex | 跨平台一致 + 安全性 + Codex 已验证 |
| Computer Use 平台策略 | **macOS background 模式**（TCC + 多 agent 并行） / **Windows foreground-only**（5/29 Codex 26.527 限制） / **Linux 多 session** | 对齐 OpenAI 实际方案，不假创新 |
| 分发 | npm + Tauri + Homebrew + Docker | 跟 pi/Codex/Reasonix 一致 |
| 配置 | TOML | CodeWhale 验证，注释友好 |
| Skills 格式 | 对齐 Codex 开放标准 | 跨工具复用 |
| MCP | 官方 SDK | 唯一标准 |
| License | MIT | 全家桶都是 MIT |

## 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| DeepSeek API 限流 | 中 | 前缀缓存降耗 + Flash/Pro 智能路由 |
| **Windows 沙箱自建复杂度** | **高** | v1.0 走 Codex **unelevated**（write_restricted token + 合成 SID + env 禁网）—— 无需 admin；v1.1 再升 elevated（专用 local user + Firewall）。对齐 [Codex 官方文章](https://openai.com/index/building-codex-windows-sandbox) |
| **Windows Computer Use foreground-only** | 中 | UI 明确告知；v1.x 探索 RDP 虚拟桌面模拟 Mac background |
| **Windows Computer Use 平台原生栈** | 中 | 截图用 `windows-capture` crate（Graphics Capture API），UI 树用 `uiautomation` crate（UI Automation API），输入走 Win32 `SendInput` 通过 napi-rs |
| **UAC 弹窗永久卡住** | 中 | pre-main 检查 token elevation level，**拒绝 high elevation**（agent 不允许触发 UAC 操作） |
| **Windows DPI 缩放导致坐标错位** | 低 | 用 DPI 感知 API `GetPhysicalCursorPos` / `SetPhysicalCursorPos` |
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
**本次更新重点**：
- **Sprint 3 全面重做**：Windows Computer Use 深度对齐 OpenAI Codex 26.527（5/29/2026 发布）
- 新增 **§3 Windows 深度**（6 小节）：两代沙箱演进 / 技术栈表 / foreground-only 约束 / 多模态融合 / 沙箱与 Computer Use 边界 / 6 个平台特殊坑
- 架构决策表新增"Computer Use 平台策略"行（macOS background / Windows foreground-only / Linux 多 session）
- 风险登记新增 4 项 Windows 相关风险（含 UAC / DPI / 平台原生栈）
**下次更新**：Sprint 0 完结时
