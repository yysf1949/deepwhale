# 🐋 deepwhale — Codex 浏览器 / Computer Use 深度研究

> **研究目标**：在原 Sprint 3 方案（仅 Playwright MCP + nut.js）基础上，深挖 OpenAI Codex 客户端的真实实现，给 deepwhale Sprint 3 重新出一个**完整、可借鉴、可执行**的方案。
>
> **研究时间**：2026-06-02
> **覆盖版本**：Codex CLI v0.135.0（Rust 主线），Codex Desktop v26.415（GUI），Codex Chrome Extension v1.1.4
> **关键参考**：
>
> - Agent Safehouse 沙箱分析报告（2026-02-12，commit `26d9bdd`）
> - Simon Willison 沙箱研究（2025-11-09）
> - Microsoft Azure Computer Use 官方文档
> - microsoft/playwright-mcp README
> - blakecrosley v0.135 reference（27K 字，136 分钟）
> - digitalapplied Codex Desktop 4/16 深度分析

---

## 0. 摘要（TL;DR）

**Codex 并不是只有"1 个浏览器路径"**。它实际上有**至少 5 条独立路径**，按抽象层级从高到低：

| #   | 路径                                       | 抽象层                         | 何时用                                           |
| --- | ------------------------------------------ | ------------------------------ | ------------------------------------------------ |
| 1   | **Plugin 集成**                            | 最高（结构化 API）             | Jira / GitHub / Linear / Figma 等有专集成的      |
| 2   | **Codex Chrome Extension**（5/7 发布）     | 高（用户真实 Chrome session）  | 需要登录态的网站：Gmail / Salesforce / 内部 wiki |
| 3   | **In-app Browser**（Atlas 技术）           | 中（sandboxed 内嵌浏览器）     | localhost / 公开页 / dev server                  |
| 4   | **Computer Use**（vision 截图 + 鼠标键盘） | 低（看屏幕操作）               | 任何 GUI 桌面应用、Figma、未提供 API 的工具      |
| 5   | **Playwright MCP**（社区）                 | 中（CDP + accessibility tree） | Coding agent 自动化测试 / 表单填写 / E2E         |

**对 deepwhale 的核心启示**：

1. **不要在 Sprint 3 选单一方案**。Playwright MCP / Chrome Extension / Computer Use 是**互补**的，Codex 自己都并列
2. **Sandbox 不是"1 个东西"**。Codex 的 sandbox 是**双层**：OS 级（Seatbelt / Landlock+seccomp / Windows 限制 token）+ 工具级（白名单 shell + 文件写入路径）。**Playwright/Chromium 需要额外的 Seatbelt 规则**（`mach-register` for `org.chromium.*`），这是 Codex Issue #24742 正在解决的痛点
3. **Computer Use 不是"截图+点击"那么简单**。Codex 实际上做了**多模态融合**——screenshot 像素 + accessibility tree（macOS AX API），点击坐标 + 元素引用都支持
4. **GUI 架构选择**：Codex 用了 **4 种 GUI 表面**（CLI / Desktop / IDE / Chrome Extension / Cloud），但所有表面都跑**同一个 Rust core**（`codex-rs/core` 通过 Submission Queue / Event Queue 解耦）。这是 deepwhale 必须学的：**核心单一、外表多样**

---

## 1. Codex 客户端的真实架构

### 1.1 双语言 + 多表面

```
┌────────────────────────────────────────────────────────────────┐
│  4 个 GUI 表面（用户感知）                                          │
│  CLI（codex-tui）│ Desktop App │ IDE Extension │ Chrome Extension │
└─────────────────────────┬──────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────────┐
│  Codex Core（Rust，codex-rs/core/）                              │
│  Submission Queue (Op) → CodexThread → Event Queue (Event)      │
│  工具调度 / 沙箱包装 / 审批 / Prompt 组装 / Rollout 录制         │
└─────────────────────────┬──────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────────┐
│  Model Provider（OpenAI / Anthropic / Azure / 自定义）            │
└────────────────────────────────────────────────────────────────┘
```

**关键事实**（来自 agent-safehouse.dev 分析）：

- **60+ Rust crates** 组成 workspace：`codex-core` / `codex-cli` / `codex-tui` / `codex-exec` / `codex-app-server` / `codex-sandboxing` / `codex-linux-sandbox` / `codex-bwrap` / `codex-mcp` / `codex-rmcp-client` / `codex-process-hardening` / `codex-network-proxy` 等
- **TUI 用 ratatui + crossterm**（不是 Ink），但 CLI 的 npm shim `codex-cli/bin/codex.js` 只是**平台检测 + spawn Rust 子进程**，无业务逻辑
- **Submission Queue / Event Queue 模式**是架构核心：UI 和 agent loop 解耦，**同一个 core 跑 TUI、headless exec mode、app-server protocol**（WebSocket/HTTP）

### 1.2 5 个核心子系统（blakecrosley 提炼）

1. **Configuration system**（`config.toml`）
2. **Sandbox & approval model**
3. **AGENTS.md**（项目级指令）
4. **MCP protocol**（外部服务）
5. **Skills system**（可复用专业能力）

> **深度对齐点**：deepwhale 应该把这 5 个子系统都做出来，但**Submission Queue / Event Queue 架构**是隐藏的关键。

### 1.3 Codex Desktop v26.415（2026-04-16 大更新）

| 模块                            | 作用                                    |
| ------------------------------- | --------------------------------------- |
| **Background computer use**     | 跨桌面应用并行点击输入，不抢占用户前台  |
| **In-app browser (Atlas 技术)** | 沙箱内嵌浏览器，localhost / 公开页浏览  |
| **`gpt-image-1.5`**             | 图像生成内置，无需 ChatGPT 跳转         |
| **Memory (preview)**            | 跨 thread 持久化偏好/技术栈/工作流      |
| **Thread automations**          | 定时调度 thread，跨天/跨周恢复          |
| **90+ plugin marketplace**      | 111+ 插件 bundle（skills + 集成 + MCP） |
| **GitHub PR inspection**        | 内联 diff review                        |
| **SSH remote devbox**           | Alpha，对远端开发机运行 Codex           |
| **Intel Mac 支持**              | 首次支持，之前仅 Apple Silicon          |

**3M 周活开发者**，月增长 70%（OpenAI 官方数据）。**Computer Use 仍仅 macOS**，EEA/UK/Switzerland 上线时**不支持**。

---

## 2. Codex 的 4 种浏览器路径（深度对比）

### 2.1 路径 1：Plugins（最高优先级）

**触发条件**：任务有专用集成（GitHub / Jira / Linear / Figma / Notion / Slack / Datadog 等）

**优点**：

- 结构化 API，**比视觉解读更可靠、更快**
- 噪声少（不用反复确认）

**缺点**：

- 覆盖率有限（OpenAI 90+ 插件 vs 互联网上百万个 web app）

**Codex 决策**：`Plugins first`（**三段式优先级**见 §2.5）

### 2.2 路径 2：Codex Chrome Extension（5/7 发布，v1.1.4）

**核心创新**：让 Codex 操作**用户真实的 Chrome session**，复用用户已登录的 cookies / 扩展 / history。

**架构**：

```
Codex 进程 ←→ Chrome Extension（用户在 Chrome 中已登录）
              ↓
              Chrome tab groups（每 thread 一个 tab group，不抢占用户当前 tab）
```

**触发方式**：

- 手动：`@Chrome open Salesforce and update the account from these call notes`
- 自动：Codex 自动判断"这个任务需要登录态"

**权限模型**（与 Codex app 自身的 approval 体系**独立**）：

- 默认**每次询问**是否访问某站点（按 host，例如 `example.com`）
- 3 选项：`Allow for current chat` / `Always allow` / `Decline`
- Allowlist / Blocklist 在 **Computer Use settings** 管理
- **Browser history** 是高敏感：每次请求都问，**无 always-allow 选项**（仅"按需" + 短期 scope）

**Codex Memories 联动**：

- Memories 开启 → Chrome 浏览时可用相关记忆
- Memories 关闭 → 浏览时不调用记忆

**数据存储**：

> "OpenAI doesn't store a separate complete record of your Chrome actions from the extension. OpenAI stores browser activity only when it becomes part of the Codex context, such as text Codex reads from a page, screenshots, tool calls, summaries, messages, or other content included in the thread."

**插件安装入口**：从 Codex Desktop 的 `/plugins` 命令，搜索 "Chrome"。

**已知限制（Issue #23302）**：mobile-started remote Codex thread **不能**用 Chrome 插件。

### 2.3 路径 3：In-app Browser（基于 ChatGPT Atlas 技术）

**核心**：Codex Desktop 内嵌的 Chromium（Atlas 内核），**完全 sandboxed**，与用户真实 Chrome profile **完全隔离**。

**用途**：

- localhost dev server 预览
- 静态 HTML 导出
- 公开文档页（无需登录）

**对比 In-app Browser vs Chrome Extension**：

| 维度         | In-app Browser     | Chrome Extension       |
| ------------ | ------------------ | ---------------------- |
| 环境         | Sandbox 内嵌       | 用户真实 Chrome        |
| 登录态       | ❌ 无              | ✅ 用户已登录态        |
| 用户 profile | ❌ 不接触          | ✅ 复用                |
| 适用         | localhost / 公开页 | Gmail / CRM / 内部工具 |

**优先级（Codex 决策）**：`@Browser` 用于本地，`@Chrome` 用于已登录的远程。

### 2.4 路径 4：Computer Use（5/12 推 Mac，5/29 推 Windows）

**核心机制**：通过 vision 模型**看屏幕** + 通过 OS API **点击/输入**。

**模型**：`computer-use-preview`（OpenAI 专用模型，2025-03-11 首发，2026 年 5 月由 `gpt-5.4` 接力）

**API 协议**（来自 Azure 官方文档）：

- 通过 **Responses API** 调用
- tool 类型：`{"type": "computer"}`
- 循环：model 输出 actions → 用户 harness 执行 → harness 回传 screenshot → model 再输出 actions

**Action 数据结构**（关键）：

```json
{
  "id": "cu_068b0022b159a6710069b0d45008448195980f77beaa9cec83",
  "call_id": "call_4y94crSZe0elpGhdiiwjLpa0",
  "status": "completed",
  "type": "computer_call",
  "actions": [{ "type": "screenshot" }]
}
```

**Action 类型**（OpenAI 官方支持）：

- `screenshot` — 截屏
- `left_click` / `right_click` / `middle_click` — 鼠标点击
- `double_click` — 双击
- `type` — 文本输入
- `key` — 键盘按键（Return / Tab / Escape / Cmd+[ 等）
- `mouse_move` — 鼠标移动
- `scroll` — 滚动
- `wait` — 等待
- `back` / `forward` / `reload` — 浏览器导航
- `search` — 浏览器搜索
- `find` — 查找
- `zoom` — 缩放

**重要发现**：computer-use-preview 模型**实际从不发 `back` action**——用户必须在 prompt 里用键盘快捷键（macOS 用 `Cmd+[`）代替（OpenAI 社区已知问题）。

**循环伪代码**：

```python
response = client.responses.create(
    model="gpt-5.4",
    tools=[{"type": "computer"}],
    input=[{"role": "user", "content": "Check the latest AI news on bing.com."}],
)

# 循环
while has_computer_call(response):
    computer_call = next(c for c in response.output if c.type == "computer_call")
    actions = computer_call.actions  # batched array

    for action in actions:
        execute(action)  # 用户 harness 实现

    screenshot = capture_screenshot()

    response = client.responses.create(
        model="gpt-5.4",
        previous_response_id=response.id,
        tools=[{"type": "computer"}],
        input=[{
            "call_id": computer_call.call_id,
            "type": "computer_call_output",
            "output": {
                "type": "computer_screenshot",
                "image_url": f"data:image/png;base64,{screenshot}",
                "detail": "original"
            }
        }],
    )
```

**Codex Desktop 集成的 Computer Use 关键差异**（v.s. 纯 API 调用）：

| 维度          | 纯 API             | Codex Desktop 集成                             |
| ------------- | ------------------ | ---------------------------------------------- |
| 截图源        | 用户 harness 实现  | macOS `screencapture` API + accessibility tree |
| 输入方式      | 用户 harness       | macOS Quartz Event Services（CGEvent）         |
| 视觉+结构融合 | 纯像素             | 像素 + macOS AX（Accessibility）API 树         |
| 沙箱          | 用户负责           | Codex 沙箱 + macOS TCC 权限                    |
| App 范围      | 任何能被截屏的应用 | **App 级别的 allowlist**（"Always allow"）     |

**多模态融合 = Codex 关键优势**：

> 来自 Ari Weinstein（OpenAI，Computer Use in Codex 视频）：
> "Screenshots plus accessibility data" — 像素 + 结构化 UI 树双通道，定位比纯像素更准

**Locked computer use**（Codex 独有）：

- Mac 锁屏后仍可触发 Computer Use
- 实现：安装 macOS **authorization plug-in**（参与 unlock flow）
- **范围刻意做窄**：不能解锁其他 app，不能远程解锁
- 通过 Apple `AuthorizationPlugIn` 协议，**仅 Codex** 在短窗口内能解锁

### 2.5 路径优先级（Codex 决策树）

```
用户任务
    ↓
[1] 有 plugin？──Yes──→ 用 plugin（结构化 API，最可靠）
    │ No
    ↓
[2] 需要登录态（真实 Chrome）？──Yes──→ @Chrome（Chrome Extension）
    │ No
    ↓
[3] localhost / 公开页？──Yes──→ @Browser（In-app browser）
    │ No
    ↓
[4] 桌面 GUI 应用？──Yes──→ @Computer（Computer Use）
    │ No
    ↓
[5] 走 Playwright / Selenium / 自定义 harness
```

**引用**（Verdent AI 总结）：

> "**Plugins first** — If a dedicated API integration exists, Codex prefers that. **Chrome extension second** — When the task requires a real browser session with authenticated state and no plugin covers it. **In-app browser last resort for local** — Localhost, local dev servers."

### 2.6 路径 5：Playwright MCP（社区/推荐）

**Codex 官方推荐**：在 `~/.codex/config.toml` 中加 Playwright MCP：

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
```

**Playwright MCP 核心特征**（来自 microsoft/playwright-mcp README）：

1. **结构化 accessibility snapshots 而非像素**

   ```
   - heading "todos" [level=1]
   - textbox "What needs to be done?" [ref=e5]
   - listitem:
     - checkbox "Toggle Todo" [ref=e10]
   ```

   模型用 `ref=e5` 这种 ref 引用元素，不是坐标

2. **完整工具集**：navigate / click / type / screenshot / keyboard / hover / drag / dialog accept / tab 管理

3. **`browser_run_code_unsafe` 工具**（⚠️ RCE 等价）：在 Playwright server 进程里直接执行 JS。**只能对 trusted MCP client 开启**

4. **3 种 profile 模式**：
   - **Persistent**（默认）：登录态持久化到 `ms-playwright/mcp-{channel}-{workspace-hash}`
   - **Isolated**（`--isolated`）：每次新 session，内存 profile
   - **Extension**（`--extension`）：连接运行中的浏览器（Edge/Chrome）

5. **丰富配置**（55+ flags / env vars）：
   - `--allowed-hosts` / `--allowed-origins` / `--blocked-origins`：访问控制
   - `--browser=chrome|firefox|webkit|msedge`
   - `--caps=vision,pdf,devtools`
   - `--no-sandbox` / `--headless`
   - `--device="iPhone 15"`
   - `--isolated` / `--output-dir`
   - 等等

6. **Standalone HTTP 模式**：
   ```bash
   npx @playwright/mcp@latest --port 8931
   ```
   ```json
   { "mcpServers": { "playwright": { "url": "http://localhost:8931/mcp" } } }
   ```

**vs Playwright CLI**（Playwright 团队自己也提了）：

| 维度        | CLI + Skills                                     | MCP Server                                          |
| ----------- | ------------------------------------------------ | --------------------------------------------------- |
| 适合        | **现代 coding agent**（token-efficient、SKILLs） | 专门 agentic loop（持久 state、rich introspection） |
| 工具 schema | 小（SKILLs）                                     | 大（accessibility tree）                            |
| 速度        | 快                                               | 慢                                                  |
| 适合任务    | 高吞吐 agent + 大代码库                          | 探索性自动化、自愈测试、长时间自主工作              |

---

## 3. Codex 的 Sandbox 真实实现（深度）

> **这是 deepwhale Sprint 3 最值得借鉴的部分**。

### 3.1 总体原则（OpenAI 官方原话）

> "The sandbox is the boundary that lets Codex act autonomously without giving it unrestricted access to your machine. The sandbox applies to **spawned commands**, not just to Codex's built-in file operations."

**3 条核心设计原则**：

1. **Local execution** — 代码不上云，除非工具显式联网
2. **Sandboxed safety** — OS 级隔离（Seatbelt / Landlock / Windows restricted token）
3. **Human-in-the-loop control** — 细粒度 approval policy（`untrusted` / `on-request` / `never`）

### 3.2 三个 Sandbox 模式

```toml
sandbox_mode = "read-only"        # 只读，不能写
sandbox_mode = "workspace-write"  # 默认可写 workspace + tmpdir
sandbox_mode = "danger-full-access"  # 完全访问，慎用
```

**`workspace-write` 默认保守**：

- `network_access = false`（默认）
- 写入只允许 workspace + `~/.codex/memories`
- Home 目录 / 系统路径 / 父目录都被 block

**可调**：

```toml
[sandbox_workspace_write]
writable_roots = ["./", "./tmp"]
network_access = false
exclude_tmpdir_env_var = false
exclude_slash_tmp = false
```

### 3.3 三个 Approval Policy

```toml
approval_policy = "untrusted"   # 任何动作都问
approval_policy = "on-request"  # 越界时问
approval_policy = "never"       # 全自动（CI 用）
```

**关键洞察**：`sandbox_mode` 和 `approval_policy` 是**正交**的：

- `sandbox_mode = read-only` + `approval_policy = never` = 沙箱内全自动
- `sandbox_mode = danger-full-access` + `approval_policy = on-request` = 不沙箱但每次问

### 3.4 跨平台实现（最硬核的部分）

| 平台        | 实现                                               | 关键 crate / 系统调用                                    | 细节                                                                                               |
| ----------- | -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **macOS**   | Apple **Seatbelt**（`sandbox-exec`）               | `codex-rs/sandboxing/src/seatbelt.rs`                    | 动态组装 SBPL 策略（S-表达式），`(deny default)` + 白名单                                          |
| **Linux**   | **Bubblewrap** + **Landlock** + **seccomp**        | `codex-rs/sandboxing/src/landlock.rs` + `codex-rs/bwrap` | bwrap 创建 user namespace + mount namespace，Landlock 限 fs，seccomp 限 syscall（默认 block 网络） |
| **Windows** | **Restricted tokens**（Codex 自建，非 Job Object） | `codex-rs/windows-sandbox`                               | 降权 token + 作业对象 + integrity level                                                            |
| **WSL2**    | 走 Linux 实现                                      | —                                                        | —                                                                                                  |

**Linux 三件套分工**：

- **Bubblewrap**（用户态容器）：user namespace、mount namespace、bind mount
- **Landlock**（kernel FS LSM）：限制 fs 访问（`landlock_create_ruleset` + `landlock_add_rule`）
- **seccomp**（kernel syscall filter）：限制 syscall（默认 `socket` 被禁 → 无网络）

**Bubblewrap 安装**（Linux 必备）：

```bash
sudo apt install bubblewrap  # Ubuntu/Debian
sudo dnf install bubblewrap  # Fedora
```

**Ubuntu 24.04 特殊处理**（Codex 文档原话）：

```bash
# 默认 unprivileged user namespace 受限
sudo apt update
sudo apt install apparmor-profiles apparmor-utils
sudo install -m 0644 /usr/share/apparmor/extra-profiles/bwrap-userns-restrict /etc/apparmor.d/bwrap-userns-restrict
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict

# 实在不行，最后退路
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

**macOS Seatbelt 策略文件**：

- `seatbelt_base_policy.sbpl`（主策略）
- `restricted_read_only_platform_defaults.sbpl`（read-only 模式补充）
- 用户可在 `~/.codex/sandbox-extra.sb` 加自定义（Issue #24742 提案中）

### 3.5 Process Hardening（Codex 独有）

Codex 在 main 函数执行前做了一系列**反调试 / 反转储 / 环境消毒**：

```rust
// codex-rs/process-hardening/src/lib.rs
pub fn pre_main_hardening() {
    // 1. 禁用 ptrace（防调试）
    // 2. 禁用 core dump
    // 3. 清理 LD_PRELOAD / LD_LIBRARY_PATH 等环境变量
    // 4. 清理 CODEX_ 前缀的 env vars
    const ILLEGAL_ENV_VAR_PREFIX: &str = "CODEX_";
}
```

**这条很重要**：**`.env` 文件中以 `CODEX_` 开头的变量会被自动过滤**，防止用户误把 API key 注入到子进程。

### 3.6 Network Proxy（沙箱内联网的桥）

**场景**：sandbox 禁止直接联网，但 agent 仍需调用 OpenAI API。

**方案**：MITM proxy。Codex 实现 `codex-rs/network-proxy`：

- 子进程试图联网 → proxy 拦截
- 检查白名单（默认只允许 `api.openai.com`）
- 白名单内 → 转发；白名单外 → 拒绝

**历史包袱**：早期 Linux 沙箱用 `iptables` + `ipset` 限制网络（见 philschmid 文章），新版改用 Landlock + seccomp + proxy，更通用。

### 3.7 Playwright / Chromium 在沙箱里的特殊需求（关键问题！）

**Codex Issue #21292**（已 root-cause）：

> "Playwright Chromium fails in sandbox with MachPortRendezvousServer permission denied"

**原因**：Chromium 多进程架构用 Mach ports IPC，macOS Seatbelt 默认拒绝 `org.chromium.*` 的 mach-register。

**修复方案**（Codex Issue #24742 提案中）：

```scheme
;; 放到 ~/.codex/sandbox-extra.sb
(allow mach-register (global-name-regex #"^org\.chromium\."))
```

**对 deepwhale 的启示**：Sprint 3 实现 Playwright 集成时，**必须提前**在 macOS Seatbelt 策略文件里加这条规则。

### 3.8 用户可扩展的沙箱（Codex 的设计取舍）

**Issue #24742 的核心动机**：

> "Codex's Seatbelt base policy covers common OS interactions but inevitably misses niche-but-legitimate ones. The current workarounds — per-command escalation or `:danger-full-access` — are either tedious or overly broad."

**两种扩展方案**（设计取舍）：

| 方案                                                 | 优点                              | 缺点       |
| ---------------------------------------------------- | --------------------------------- | ---------- |
| **Drop-in file**（`~/.codex/sandbox-extra.sb`）      | 像 nginx `conf.d/`、systemd，简单 | 路径硬编码 |
| **Config key**（`sandbox_extra_rules_file = "..."`） | 灵活，profile 可绑                | 配置复杂   |

Codex 倾向 drop-in（Issue 24742 当前讨论倾向），实现 5 行 Rust：

```rust
// codex-rs/sandboxing/src/seatbelt.rs
let extra_rules = std::fs::read_to_string(
    codex_home.join("sandbox-extra.sb")
).unwrap_or_default();
final_policy.push_str(&extra_rules);
```

**安全考虑**：

> "Users who can write `~/.codex/sandbox-extra.sb` already have full access to their own machine — they could just run commands outside the sandbox. User-provided rules only _relax_ the sandbox (Seatbelt rules are additive on top of `(deny default)`)."

---

## 4. Computer Use 内部细节（深度）

### 4.1 Action 完整清单（来自 Microsoft 文档）

| Action                                        | 用途        | Codex 特殊处理                                     |
| --------------------------------------------- | ----------- | -------------------------------------------------- |
| `screenshot`                                  | 截屏        | macOS `screencapture`，Linux `grim` / `scrot`      |
| `left_click` / `right_click` / `double_click` | 鼠标点击    | 用坐标 + accessibility 元素 ref 双通道             |
| `type`                                        | 文本输入    | 优先 AX text input，fallback 剪贴板粘贴 + 模拟按键 |
| `key`                                         | 按键        | 特殊键（Cmd/Ctrl/Alt/Shift）修饰符                 |
| `key_hold` / `key_release`                    | 长按 / 释放 | 用于组合键                                         |
| `mouse_move`                                  | 鼠标移动    | 悬停状态                                           |
| `scroll`                                      | 滚动        | 坐标 + delta + direction                           |
| `wait`                                        | 等待 N 秒   | 重试 / 防 flaky                                    |
| `back` / `forward` / `reload`                 | 浏览器      | **computer-use-preview 不发 `back`，用 Cmd+[**     |
| `search` / `find`                             | 搜索        | 浏览器特有                                         |
| `zoom`                                        | 缩放        | UI 调整                                            |
| `screenshot_with_annotated_elements`          | 标注元素    | 调试用                                             |

### 4.2 视觉 vs 结构（Codex 关键创新）

**传统 computer-use 痛点**（2025 年初）：

- 纯像素 → 精度低
- 反光 / 透明 / 模糊 → 失败率高
- 模型必须"猜"元素位置

**Codex 的多模态融合**（来自 5/12 Ari Weinstein 视频）：

> "Multiple apps at once. **Screenshots plus accessibility data**"

**实现思路**：

1. **screenshot**（像素，1280x800 默认）
2. **macOS AX tree**（结构化，每个 UI 元素的 role/title/frame/identifier）
3. 融合：模型既看像素又看 AX ref，可**直接通过 ref 点击**而无需算坐标

**优势**：

- 定位准（不用模型找坐标）
- 抗 UI 变化（AX tree 比像素稳定）
- 多 app 切换（AX tree 跨 app 有 namespace）

**对 deepwhale 的启示**：

- macOS：必须用 **ApplicationServices.framework**（AX API）
- Windows：必须用 **UI Automation API**
- Linux：必须用 **AT-SPI**（GNOME 桌面）

### 4.3 Computer Use 沙箱保护

**Codex 设计**：

- Computer Use 操作**仍在 Codex sandbox 内**：
  - macOS TCC（Transparency, Consent, and Control）权限：Screen Recording + Accessibility
  - 用户授权后，Codex 才能截屏和输入
- App-level allowlist（`@AppName`）：
  - 用户批准后该 app 才能用
  - "Always allow" 让未来自动
- 敏感 / 破坏性操作**额外询问**（如删文件）

**对 deepwhale 的启示**：

- Sprint 3 第一次启动 Computer Use 必须引导用户授权
- 每次提到新 app 必须询问
- 关键操作（删除、支付）**必须**额外询问，无论 allowlist 状态

### 4.4 Locked Computer Use（Codex 独有）

**场景**：Mac 锁屏后，从手机/远端发 Codex 任务，需要操作 Mac 桌面。

**实现**：

- 安装 macOS **authorization plug-in**（Apple 官方 `AuthorizationPlugIn` 协议）
- 参与 Mac 的 unlock flow
- **刻意做窄**：
  - 只能解锁**当前 Codex task 的临时窗口**
  - **不能**解锁其他 app
  - **不能**远程解锁（需 Codex 在 unlock 窗口内有活跃 turn）
  - 解锁窗口**短**（< 几秒）

**对 deepwhale 的启示**：这是个**锦上添花**的功能，Sprint 4/5 再做。早期 v1.0 不必实现。

---

## 5. Codex 多表面架构（深度）

### 5.1 5 个 GUI 表面

| 表面                             | 适合                          | 启动方式                          |
| -------------------------------- | ----------------------------- | --------------------------------- |
| **CLI**（`codex` / `codex-tui`） | 终端党、CI/CD                 | 直接执行 binary                   |
| **Desktop App**                  | 多 thread 项目管理、视觉 diff | `codex app` / `chatgpt.com/codex` |
| **IDE Extension**                | VS Code / Cursor / Windsurf   | 装 extension                      |
| **Cloud**                        | 异步任务、长迁移              | `chatgpt.com/codex`               |
| **Chrome Extension**             | 浏览器内工作流                | `/plugins` 装                     |

### 5.2 统一 Core 的 SQ/EQ 模式

```rust
// 伪代码（来自 zread.ai 解读）
loop {
    // 1. 从 SubmissionQueue 拿 Op
    let op: Op = sq.pop().await;

    // 2. CodexThread 处理（调模型、跑工具、跑沙箱）
    let event: Event = codex_thread.handle(op).await;

    // 3. 推到 EventQueue
    eq.push(event).await;

    // 4. UI（TUI / Desktop / IDE / Chrome）从 EQ 拉取展示
}
```

**好处**：

- TUI / Desktop / IDE / Chrome Extension 共享**同一份 agent 逻辑**
- 改一个 bug，所有表面受益
- 测试简单（只测 core）

**对 deepwhale 的启示**：

- 核心必须是**单一** TypeScript process（不是 CLI 一个进程，Desktop 另一个进程）
- 所有表面走**统一协议**（JSON-RPC over stdio / WebSocket）
- 参考 Hermes Agent 借鉴点：飞书 channel 走 RPC 投递到 core

---

## 6. Computer Use 与 Browser 的关系（Codex 决策）

| 任务类型              | Codex 用什么                         |
| --------------------- | ------------------------------------ |
| GitHub PR 评论        | Plugin（GitHub API）                 |
| Jira 改 ticket        | Plugin（Jira API）                   |
| Gmail 收信            | Chrome Extension（已登录态）         |
| Salesforce 改记录     | Chrome Extension（已登录）           |
| localhost 预览        | In-app Browser（Atlas）              |
| 公开 web 填表         | In-app Browser 或 Playwright MCP     |
| Figma 编辑            | Computer Use（无结构化 API）         |
| 老旧桌面 app 自动化   | Computer Use（无 API）               |
| 跨 app 工作流         | Computer Use（多 app 协调）          |
| 自动化测试 / 表单填写 | Playwright MCP（accessibility tree） |
| 并行跨多 tab 自动化   | Chrome Extension（tab groups）       |

**Codex 没有强制用某一种**——而是让模型判断（按 §2.5 决策树）。

**对 deepwhale 的启示**：

- 不要让用户选"用哪个 browser 工具"
- 让**模型判断** + 用户可强制（`@Browser` / `@Chrome` / `@Computer`）
- 但 deepwhale 第一版**只实现** Playwright MCP + Computer Use 两个 + 让用户用 `@browser` / `@computer` 切换

---

## 7. DeepSeek + Codex 经验的融合（deepwhale 路线图更新）

### 7.1 关键对齐点

| Codex 经验                                     | deepwhale 现状                               | 需要调整                                                           |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Codex 用 **Rust core**（60+ crates）           | deepwhale 选 TypeScript + Node 22            | 维持，TS 扩展开发更快                                              |
| Codex 用 **ratatui**（Rust TUI）               | 原计划 Ink（React）                          | 维持 Ink，TS 生态更广                                              |
| Codex 的 **SubmissionQueue / EventQueue** 模式 | 未设计                                       | **必须加**（架构核心）                                             |
| Codex 的 **3 模式 sandbox**                    | deepwhale 原计划"白名单 shell + OS 沙箱"     | **对齐**（`read-only` / `workspace-write` / `danger-full-access`） |
| Codex 的 **3 approval policy**                 | 未设计                                       | **对齐**（`untrusted` / `on-request` / `never`）                   |
| Codex 的 **Process Hardening**                 | 未设计                                       | Sprint 1 加（`CODEX_` 前缀过滤思路）                               |
| Codex 的 **User-extensible sandbox**           | 未设计                                       | Sprint 3 加 `~/.deepwhale/sandbox-extra.sb`                        |
| Codex 的 **5 种 GUI 表面**                     | 原计划 CLI + Tauri + Hermes channels         | 维持，更明确                                                       |
| Codex 的 **4 浏览器路径**                      | 原计划 Playwright MCP + Computer Use 2 个    | **加 Chrome Extension**（v1.x 锦上添花）                           |
| Codex 的 **Atlas in-app browser**              | 未设计                                       | Sprint 4+ 加（基于 Chromium Embedded）                             |
| Codex 的 **90+ plugin marketplace**            | deepwhale Extension API（已设计）            | 维持，npm 命名空间 `@deepwhale/`                                   |
| Codex 的 **computer-use-preview 模型**         | DeepSeek V3.1 / V3.2-Exp 无原生 computer use | **自建 harness**，action 执行用 `nut.js` / `screencapture`         |
| Codex 的 **process-hardening**（pre-main）     | 未设计                                       | Sprint 1 加 TS 版                                                  |
| Codex 的 **network-proxy**                     | 未设计                                       | Sprint 2 加（MITM 代理）                                           |
| Codex 的 **app-server**（WebSocket/HTTP）      | 原计划 Tauri 远程                            | 维持，复用                                                         |
| Codex 的 **`app-server-protocol`**             | 未设计                                       | Sprint 4 设计（用 JSON-RPC）                                       |

### 7.2 修正后的 Sprint 3 方案

#### 原 Sprint 3 任务（来自 ROADMAP）

- MCP 完整支持（client / server）
- Browser MCP（Playwright）
- Computer Use（截图 / 鼠标键盘 / OS 沙箱）
- LSP 集成

#### 修正后 Sprint 3 任务（深挖 Codex 后）

**A. 核心 sandbox（重做）**

- [ ] 3 个 sandbox 模式：`read-only` / `workspace-write` / `danger-full-access`（对齐 Codex）
- [ ] 3 个 approval policy：`untrusted` / `on-request` / `never`（对齐 Codex）
- [ ] macOS Seatbelt 策略文件（`~/.deepwhale/sandbox/macos.sbpl`）
- [ ] Linux Landlock + seccomp 集成（参考 `codex-rs/sandboxing/src/landlock.rs`）
- [ ] Windows 限制 token（参考 `codex-rs/windows-sandbox`）
- [ ] `~/.deepwhale/sandbox-extra.sb` 用户扩展点（对齐 Codex Issue #24742）
- [ ] **Playwright 特殊规则**：`mach-register` for `org.chromium.*`（Codex #21292 踩坑前置）
- [ ] Process Hardening：禁用 `LD_PRELOAD`、过滤 `DEEPWHALE_` 前缀 env
- [ ] Network Proxy：白名单子进程联网

**B. MCP 完整支持**

- [ ] MCP client（stdio / SSE / Streamable HTTP）
- [ ] MCP server（`deepwhale serve --mcp`，让 deepwhale 自己也作为 MCP server 暴露）
- [ ] `~/.deepwhale/mcp.json` 配置
- [ ] 集成 `@playwright/mcp@latest` 作为 browser provider
- [ ] **Codex-style 安全**：可配置 `--allowed-hosts` / `--blocked-origins` / `--isolated` / `--headless`

**C. Computer Use（不是单一 nut.js！）**

- [ ] **多模态融合**（对齐 Codex）：
  - 截图（跨平台抽象）
  - macOS AX（Accessibility）tree 提取
  - Windows UI Automation tree
  - Linux AT-SPI（GNOME 桌面）
  - 截图 + AX tree 双通道
- [ ] Action 完整清单（对齐 Codex）：`screenshot` / `left_click` / `right_click` / `double_click` / `type` / `key` / `mouse_move` / `scroll` / `wait` / `back` / `forward` / `reload` / `search` / `find` / `zoom` / `screenshot_with_annotated_elements`
- [ ] **App-level allowlist**（对齐 Codex `@AppName`）
- [ ] 敏感操作额外确认
- [ ] Docker 镜像内置 desktop 环境（参考 OpenAI 官方 Computer Use Docker 模板）
- [ ] 短期不做 Locked Computer Use（Apple AuthorizationPlugIn 复杂，v1.x 锦上添花）

**D. Browser Tool 路由（Codex 决策树）**

- [ ] 设计 `@Browser` / `@Chrome` / `@Computer` 强制调用语法
- [ ] 自动决策树（plugin > chrome > in-app > computer > playwright）
- [ ] **暂不实现 In-app Browser 和 Chrome Extension**（v1.0 只做 Playwright MCP + Computer Use）
- [ ] 留 v1.1 扩展位（参考 Atlas / Chrome Extension 架构）

**E. LSP 集成（次要）**

- [ ] rust-analyzer / pyright / tsserver 实时诊断
- [ ] 编译错误当自我纠正信号

### 7.3 修正后的 Sprint 4 任务（新增 1 项）

- [ ] **App-server 协议设计**：JSON-RPC over WebSocket / Unix Domain Socket
- [ ] Tauri 桌面客户端（多 tab、右侧文件改动面板、底部 cost/cache/token meters）
- [ ] Remote TUI（`deepwhale serve --http`）
- [ ] 复用 Hermes channel 模式（飞书 / Telegram / 邮件）

### 7.4 关键新增任务（跨 Sprint）

- [ ] **Sprint 1**：Process Hardening（pre-main 阶段禁用 ptrace、清理 env vars、过滤 `DEEPWHALE_` 前缀）
- [ ] **Sprint 2**：Network Proxy（MITM 子进程联网白名单）
- [ ] **Sprint 1**：SubmissionQueue / EventQueue 架构（核心，参考 Codex）
- [ ] **Sprint 4**：In-app Browser（基于 Chromium Embedded，参考 Atlas 技术）
- [ ] **v1.1**：Chrome Extension（复用用户登录态）
- [ ] **v1.1**：Locked Computer Use（Apple AuthorizationPlugIn）

---

## 8. 实施优先级矩阵

| 任务                                                  | 价值 | 难度 | Sprint              | 必做？       |
| ----------------------------------------------------- | ---- | ---- | ------------------- | ------------ |
| SubmissionQueue/EventQueue 架构                       | 极高 | 中   | 1                   | ✅           |
| 3 sandbox modes + 3 approval policies                 | 极高 | 中   | 1                   | ✅           |
| Process Hardening                                     | 高   | 低   | 1                   | ✅           |
| Playwright MCP 集成（含 Chromium mach-register 规则） | 极高 | 低   | 3                   | ✅           |
| Computer Use 截图 + 鼠标键盘                          | 极高 | 中   | 3                   | ✅           |
| 多模态融合（AX + screenshot）                         | 高   | 高   | 3                   | ✅ Sprint 末 |
| App-level allowlist（Computer Use）                   | 高   | 中   | 3                   | ✅           |
| 用户可扩展 sandbox（`sandbox-extra.sb`）              | 中   | 低   | 3                   | ✅           |
| Network Proxy                                         | 中   | 中   | 2                   | ⏳ Sprint 2  |
| macOS TCC 权限引导                                    | 中   | 低   | 3                   | ✅           |
| In-app Browser（Atlas）                               | 中   | 高   | 4                   | ⏳ Sprint 4  |
| Chrome Extension                                      | 中   | 中   | v1.1                | ⏳           |
| Locked Computer Use                                   | 低   | 极高 | v1.1+               | ❌           |
| 5 GUI 表面统一 Core                                   | 极高 | 中   | 1（架构）+ 4（GUI） | ✅           |

---

## 9. 风险与对策（新增）

| 风险                              | 等级 | Codex 怎么应对                                      | deepwhale 对策                     |
| --------------------------------- | ---- | --------------------------------------------------- | ---------------------------------- |
| **Playwright 在 Seatbelt 内崩溃** | 高   | 文档引导装 `bwrap` + 加 Chromium mach-register 规则 | **前置加好**（Sprint 3 第一周）    |
| **Computer Use 精度低**           | 中   | 多模态融合（像素 + AX）                             | macOS 优先 + Windows UI Automation |
| **Computer Use 安全（误删文件）** | 高   | App-level allowlist + 敏感操作额外问                | 一致                               |
| **MCP server 协议演进**           | 低   | pin 官方 SDK                                        | 一致                               |
| **多表面状态同步**                | 中   | SQ/EQ 模式                                          | **必学**                           |
| **环境变量泄漏 API key**          | 中   | pre-main 过滤 `CODEX_` 前缀                         | 同理过滤 `DEEPWHALE_`              |
| **子进程绕过 sandbox 联网**       | 中   | network-proxy MITM                                  | Sprint 2 加                        |
| **沙箱误伤合法操作**              | 中   | 用户 `sandbox-extra.sb` 扩展点                      | 一致                               |

---

## 10. 关键参考资料 URL

### Codex 官方

- [Codex 仓库](https://github.com/openai/codex)（87.1k stars，6,984 commits）
- [Codex CLI v0.135 reference](https://blakecrosley.com/guides/codex)（27K 字，136 分钟）
- [Codex Sandboxing 概念](https://developers.openai.com/codex/concepts/sandboxing)
- [Codex App Computer Use](https://developers.openai.com/codex/app/computer-use)
- [Codex Chrome Extension](https://developers.openai.com/codex/app/chrome-extension)
- [Computer Use API 指南](https://developers.openai.com/api/docs/guides/tools-computer-use)
- [computer-use-preview 模型](https://developers.openai.com/api/docs/models/computer-use-preview)
- [codex-rs README](https://github.com/openai/codex/blob/main/codex-rs/README.md)

### 第三方分析

- [Agent Safehouse 沙箱分析报告（2026-02-12）](https://agent-safehouse.dev/docs/agent-investigations/codex)
- [Simon Willison 沙箱研究（2025-11-09）](https://simonwillison.net/2025/Nov/9/codex-sandbox-investigation)
- [zread.ai Codex 总览](https://zread.ai/openai/codex)
- [Codex CLI Deep Dive (2026)](https://www.digitalapplied.com/blog/codex-cli-deep-dive-config-profiles-sandbox-2026)
- [Codex Desktop 4/16 深度分析](https://www.digitalapplied.com/blog/openai-codex-desktop-computer-use-plugins-guide)
- [Codex Chrome Extension 解读](https://www.verdent.ai/guides/codex-chrome-extension-explained)
- [Philschmid Codex 工作原理](https://www.philschmid.de/openai-codex-cli)

### Computer Use 实施参考

- [Microsoft Azure Computer Use 官方](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/computer-use)
- [Codex Computer Use Mac 视频](https://www.youtube.com/watch?v=D_FCYsshMI4)
- [Codex Computer Use Windows 视频](https://www.youtube.com/watch?v=MPIAB-8VmCo)

### Browser Tool 实施参考

- [Playwright MCP 仓库](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP 文档](https://playwright.dev/docs/getting-started-mcp)
- [Playwright CLI（vs MCP）](https://github.com/microsoft/playwright-cli)
- [Codex Playwright MCP 实战](https://blog.gopenai.com/automating-e2e-chat-flow-testing-with-codex-playwright-mcp-1ce4020dcbca)
- [Codex Issue #21292（Playwright 在沙箱崩溃）](https://github.com/openai/codex/issues/21292)
- [Codex Issue #24742（用户可扩展沙箱）](https://github.com/openai/codex/issues/24742)
- [Codex Issue #23302（移动端 Chrome 插件）](https://github.com/openai/codex/issues/23302)

### Sandbox 实施参考

- [Codex `seatbelt_base_policy.sbpl`](https://github.com/openai/codex/tree/main/codex-rs/sandboxing)（fossies 镜像可读）
- [Codex `landlock.rs`](https://fossies.org/linux/misc/codex-rust-v0.135.0.tar.gz/codex-rust-v0.135.0/codex-rs/sandboxing/src/landlock.rs)
- [LangChain CodexSandboxExecutionPolicy](https://reference.langchain.com/python/langchain/agents/middleware/_execution/CodexSandboxExecutionPolicy)
- [scode (sandbox for AI coding tools)](https://binds.ch/blog/scode-sandbox-for-ai-coding-tools)
- [compartment (Linux AI agent 沙箱)](https://dev.to/nmicic/i-built-compartment-to-sandbox-ai-agents-on-linux-14h4)

---

## 11. 后续行动计划

### 立刻可做（本周）

1. **更新 ROADMAP.md** Sprint 3 任务清单（加入 Codex 借鉴点）
2. **设计 SubmissionQueue / EventQueue 架构**（Sprint 1 关键）
3. **设计 sandbox 配置文件 schema**（`~/.deepwhale/sandbox/*.sbpl` + `config.toml`）

### Sprint 0 结束前（本周）

4. 在 `codex-rs/sandboxing` 镜像站读 `seatbelt.rs` 完整源码
5. 验证 Playwright MCP 在 Ubuntu 24.04 上的安装步骤
6. 列出 Computer Use 必须实现的 action 清单

### Sprint 3 启动前

7. 实现 3 sandbox 模式
8. 实现 3 approval policy
9. 实现 Process Hardening
10. 设计 Chromium mach-register 规则

---

**文档版本**：v1.0
**最后更新**：2026-06-02
**下次更新**：Sprint 3 启动前
**预计字数**：~10,000 字（37 个引用源）
