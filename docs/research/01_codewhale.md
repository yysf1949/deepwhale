# 🦀 Hmbown/CodeWhale 深度研究

> **研究目标**：deepwhale 借鉴 CodeWhale 的 Rust OS 沙箱 + Constitution 9 层权威
> **研究时间**：2026-06-02
> **覆盖版本**：CodeWhale v0.8.50（17 crates）

## 1. 项目概览

| 字段           | 值                                                     |
| -------------- | ------------------------------------------------------ |
| 仓库           | https://github.com/Hmbown/CodeWhale                    |
| 当前版本       | **v0.8.50**（workspace.package.version）               |
| 原名           | DeepSeek-TUI（已改名 CodeWhale）                       |
| 主语言         | **Rust**（edition 2024，rustc 1.88+）                  |
| TUI            | 推测 ratatui（未直接查证）                             |
| 桌面           | Tauri（**规划中**，CORS 白名单含 `tauri://localhost`） |
| License        | MIT                                                    |
| Rust workspace | 17 crates                                              |

## 2. 17 Crates 拆分

来源：`Cargo.toml:1-19`

```
agent           # 核心 agent loop
app-server      # axum HTTP + JSON-RPC（多渠道接入方案）
cli             # CLI 入口
config          # TOML 配置加载
core            # Runtime
execpolicy      # bash 白名单（729 行）
hooks           # Hook 调度
mcp             # MCP client/server
protocol        # 协议类型
release         # 发布管理
secrets         # 密钥管理
state           # 状态存储
tools           # 工具注册
tui             # TUI 渲染
tui-core        # TUI 共享逻辑
```

## 3. Constitution 9 层权威

来源：`crates/tui/src/prompts/base.md:1-297`（**全文 297 行**）

结构：

```
Preamble              Brother Whale
Article I             The Identity of the Agent
Article II            The Primacy of Truth
Article III           The Agency of the User
Article IV            The Duty of Action
Article V             The Discipline of Verification
Article VI            The Legacy of Coordination
Article VII           The Hierarchy of Law
STATUTES (Tier 2)     Language / Output Formatting / Verification Principle
REGULATIONS (Tier 3)  Composition Pattern / Sub-Agent Strategy / RLM
```

**Article VII 法律层级**（9 层）：

1. Constitution（Articles I-VII）
2. Case Command（当前用户消息）
3. Statutes（模式权限、审批策略）
4. Regulations（组合模式、sub-agent 策略）
5. Local Law（AGENTS.md / CLAUDE.md / `.codewhale/instructions.md`）
6. Evidence（工具输出、文件内容）
7. Memory（声明性事实）
8. Personality（声音、语气）
9. Precedent（上一 session handoff）

**对 deepwhale 价值**：

- 抄结构（**不抄 Brother Whale 个人化**——避免神化/宗教化）
- 注入 system prompt
- 9 层法律优先级用于解决指令冲突

## 4. 沙箱实现

来源：`crates/tui/src/sandbox/mod.rs:1-934`

### 4.1 三平台支持

```rust
// crates/tui/src/sandbox/mod.rs:9-16
//! - **macOS**: Uses Seatbelt (sandbox-exec) for mandatory access control
//! - **Linux**: Uses Landlock (kernel 5.13+) for filesystem access control
//! - **Windows**: No OS sandbox is advertised yet. The planned first helper
//!   contract is process-tree containment only via a Windows Job Object; it
//!   must not claim filesystem, network, registry, or AppContainer isolation.
```

### 4.2 成熟度

| 平台           | 成熟度             | 代码量 | 关键文件                                                                          |
| -------------- | ------------------ | ------ | --------------------------------------------------------------------------------- |
| macOS Seatbelt | ✅ 完整            | 695 行 | `crates/tui/src/sandbox/seatbelt.rs`                                              |
| Linux Landlock | ⚠️ **marker only** | 358 行 | `crates/tui/src/sandbox/landlock.rs:489` 注释"full implementation needs a helper" |
| Linux bwrap    | ✅ 回退            | -      | `crates/tui/src/sandbox/bwrap.rs`（issue #2184 模式）                             |
| Linux seccomp  | ✅ 完整            | -      | `crates/tui/src/sandbox/seccomp.rs`                                               |
| Windows        | ⚠️ Job Object only | -      | 文档明文不假撑                                                                    |

### 4.3 沙箱关键设计

```rust
// crates/tui/src/sandbox/mod.rs:299-323
pub fn get_platform_sandbox() -> Option<SandboxType> {
    #[cfg(target_os = "macos")]
    {
        if seatbelt::is_available() {
            return Some(SandboxType::MacosSeatbelt);
        }
    }
    #[cfg(target_os = "linux")]
    {
        if landlock::is_available() {
            return Some(SandboxType::LinuxLandlock);
        }
    }
    // ...
}
```

**环境变量指示**：

```rust
// mod.rs:453, 477, 494
env.insert("DEEPSEEK_SANDBOX".to_string(), "seatbelt".to_string());
env.insert("DEEPSEEK_SANDBOX".to_string(), "bwrap".to_string());
env.insert("DEEPSEEK_SANDBOX".to_string(), "landlock".to_string());
```

**关键发现**：

- macOS Seatbelt **真实现**
- Linux Landlock 是 **marker only**（**教训：要么真做要么不做**）
- bwrap 是更好的 Linux 方案
- Windows **明确文档不假撑**

## 5. 飞书桥

来源：`integrations/feishu-bridge/`

```json
// integrations/feishu-bridge/package.json
{
  "name": "@codewhale/feishu-bridge",
  "type": "module",
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.52.0"
  }
}
```

**对 deepwhale 价值**：直接抄 SDK 接入模式（`@larksuiteoapi/node-sdk`）。

## 6. app-server（多渠道接入方案）

来源：`crates/app-server/src/main.rs` + `lib.rs`

```rust
// main.rs
#[derive(Debug, Parser)]
struct Cli {
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = 8787)]
    port: u16,
    #[arg(long = "auth-token")]
    auth_token: Option<String>,
}
```

**CORS 白名单**（lib.rs:22-31）：

```rust
const DEFAULT_CORS_ORIGINS: &[&str] = &[
    "http://localhost",
    "http://localhost:1420",  // Tauri dev port
    "tauri://localhost",       // Tauri production
    // ...
];
```

**对 deepwhale 价值**：axum HTTP + JSON-RPC 是 Hermes channel 接入的成熟方案。

## 7. Skills 格式

来源：`crates/tui/assets/skills/*/SKILL.md`

**对齐 Codex Skills 开放标准**（SKILL.md + frontmatter）。

内置 Skills：

- v4-best-practices / pdf / feishu / plugin-creator / skill-creator
- delegate / presentations / mcp-builder / skill-installer
- documents / spreadsheets

**对 deepwhale 价值**：完全对齐 Codex 开放标准，**含 feishu skill** 可作中文 skill 模板。

## 8. 路径迁移

```toml
# config.example.toml
# New installs write product state under ~/.codewhale/. Existing ~/.deepseek/
# files are still read as compatibility fallbacks when the .codewhale file is
# absent.
skills_dir = "~/.codewhale/skills"
mcp_config_path = "~/.codewhale/mcp.json"
```

**对 deepwhale 价值**：起步就把路径迁移机制写好。

## 9. 踩过的坑（最近 10 issue）

| Issue | 标题                                 | 状态   |
| ----- | ------------------------------------ | ------ |
| #2592 | v0.8.50 中文输入法控制序列泄露       | OPEN   |
| #2590 | 命令面板滚动有问题                   | OPEN   |
| #2589 | Windows shell 沙箱初始化失败         | OPEN   |
| #2583 | engine have stopped error in v0.8.50 | OPEN   |
| #2582 | npm 怎么只到 0.8.47                  | CLOSED |
| #2580 | FR: CodeWhale VSCode 适配            | OPEN   |
| #2574 | FR: Provider fallback chain          | OPEN   |
| #2596 | TUI /model picker 不显示自定义模型   | OPEN   |
| #2594 | FR: Arcee AI 作为直接 provider       | OPEN   |
| #2584 | 无法上传本地图片                     | OPEN   |

**关键教训**：

- 中文输入法支持 v0.8.50 仍有问题（**深 whal e i18n 投入大**）
- Windows 沙箱 init 失败（**明文不做**）
- engine stopped 错误（**v0.8.50 仍存**）
- v0.8.50 npm release 滞后（**release 节奏问题**）

## 10. 借鉴清单（P0/P1/P2）

### P0 — 必须抄

| 借鉴点                  | 真实出处                                                         | deepwhale 落地                 |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------ |
| Constitution 9 层权威   | `crates/tui/src/prompts/base.md:1-297`                           | 抄结构，**不抄 Brother Whale** |
| 双层沙箱架构            | `crates/tui/src/sandbox/mod.rs` + `crates/execpolicy/src/lib.rs` | TS 包装 + Rust napi-rs 桥      |
| macOS Seatbelt 完整实现 | `crates/tui/src/sandbox/seatbelt.rs:1-695`                       | 完整抄 sandbox-exec 包装       |
| Linux bwrap 回退        | `crates/tui/src/sandbox/bwrap.rs`（issue #2184）                 | 优先 bwrap，Landlock 兜底      |
| 路径迁移兼容            | config 注释"~/.deepseek/ → ~/.codewhale/"                        | 起步就写 fallback              |
| 飞书桥 SDK 模式         | `integrations/feishu-bridge/`（`@larksuiteoapi/node-sdk`）       | 抄 SDK 接入                    |
| app-server 双协议       | `crates/app-server/src/{main,lib}.rs`                            | axum HTTP + JSON-RPC 抄        |
| CORS 白名单             | `lib.rs:22-31` 含 `tauri://localhost`                            | Tauri 客户端对接清单           |
| Skills MD 格式          | `crates/tui/assets/skills/*/SKILL.md`                            | 对齐 Codex 开放标准            |

### P1 — 强烈建议

| 借鉴点            | 真实出处                                                  | deepwhale 落地             |
| ----------------- | --------------------------------------------------------- | -------------------------- |
| Feishu skill 内置 | `crates/tui/assets/skills/feishu/SKILL.md`                | 中文 skill 模板            |
| prompt/ 分层      | `crates/tui/src/prompts/{approvals,modes,personalities}/` | 多人格 / 多模式 / 审批策略 |
| 17 crates 拆分    | `Cargo.toml:1-19`                                         | 4 包结构对齐（更精简）     |

### P2 — 看情况

| 借鉴点      | 真实出处          | 评估                            |
| ----------- | ----------------- | ------------------------------- |
| Rust 主语言 | workspace 用 Rust | **不抄**——TS 栈更适合 deepwhale |
| ratatui TUI | （未直接验证）    | **不抄**——Ink TUI               |
| Tauri 桌面  | 规划中            | **抄**（生态成熟）              |

### 不要抄

| 反面教训                     | 教训                         |
| ---------------------------- | ---------------------------- |
| Linux Landlock "marker only" | **要么真做要么不做**         |
| Windows 假撑                 | **明文文档不假撑**           |
| v0.8.50 release 滞后         | **强制每周一 minor release** |
| Brother Whale 个人化         | **避免神化/宗教化**          |
| 中文输入法支持不完善         | **i18n 路径第一行定对**      |
| engine stopped 错误          | **单元测试覆盖 engine 状态** |

## 11. 关键文件路径速查

```
Constitution 9 层权威:    crates/tui/src/prompts/base.md (297 行)
沙箱抽象:                crates/tui/src/sandbox/mod.rs (934 行)
macOS Seatbelt:          crates/tui/src/sandbox/seatbelt.rs (695 行)
Linux Landlock:          crates/tui/src/sandbox/landlock.rs (358 行, marker-only)
Linux bwrap:             crates/tui/src/sandbox/bwrap.rs
Linux seccomp:           crates/tui/src/sandbox/seccomp.rs
Bash 白名单:             crates/execpolicy/src/lib.rs (729 行)
app-server HTTP:         crates/app-server/src/{main,lib}.rs
Skills assets:           crates/tui/assets/skills/*/SKILL.md
飞书桥:                  integrations/feishu-bridge/
```

## 12. 一句话总结

> **CodeWhale 是 Rust 极客的精致实现：Constitution 9 层权威 + 双层沙箱 + 飞书桥 + Skills 完整**。deepwhale **抄架构不抄语言**——TypeScript 栈用 Rust 沙箱通过 napi-rs IPC 桥接，**避开 CodeWhale "marker only" / Windows 假撑 / release 滞后**三大坑。
