# 🐋 deepwhale

> **DeepSeek-first AI coding client. 复刻 Codex 全功能 + 集成 pi-mono 扩展生态 + Hermes 多渠道。**

[![Status](https://img.shields.io/badge/status-MVP-yellow)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-green)]()

## 一句话定位

**deepwhale = DeepSeek 模型 + CodeWhale 的 Rust 沙箱 + Reasonix 的 prefix-cache 经济性 + pi-mono 的扩展平台 + Hermes 的多渠道**。目标是成为**国内最强、对开发者最友好、可扩展性最高**的 AI 编码客户端。

## 为什么需要 deepwhale

| 现状 | 痛点 |
|---|---|
| OpenAI Codex CLI 不支持 DeepSeek，绑定 GPT 模型 | ✅ deepwhale **DeepSeek-first**（V4-Flash 默认走省钱，V4-Pro 按需升级） |
| Claude Code 闭源、模型绑定 Anthropic | ✅ deepwhale MIT 开源，模型可换 |
| CodeWhale 偏 Rust 极客，扩展性弱 | ✅ deepwhale 借鉴 pi-mono 的 **Extension API**（`defineTool`） |
| Reasonix Node 生态完整但缺 OS 级沙箱 | ✅ deepwhale 借鉴 CodeWhale 的 **macOS Seatbelt / Linux Landlock** |
| Hermes 多渠道但不是 coding agent | ✅ deepwhale 复用 Hermes 飞书/Telegram/邮件 channel 模式 |

## 核心特性（v1.0 目标）

- 🐋 **DeepSeek 优先**：V4-Flash 默认（前缀缓存 99% 命中，单 turn $0.05 以内），V4-Pro `/pro` 升级
- 🔌 **pi-mono 扩展生态**：Skills / Extensions / Hooks / Prompt Templates / Themes
- 🛡 **双层沙箱**：白名单 shell + Rust OS 级沙箱（macOS Seatbelt、Linux Landlock、Windows Job Object）
- 🧠 **多模型切换**：DeepSeek / OpenAI / Anthropic / 自定义 OpenAI-compatible
- 🌐 **MCP 一等公民**：client + server，开箱即用 Playwright MCP
- 🖥 **Computer Use**：截图 + 鼠标键盘，sandbox 内操控 GUI
- 💬 **多渠道**：CLI / Tauri 桌面 / 飞书 / Telegram / 邮件 / Web UI
- ⏰ **Cron Automations**：定时任务（日报、code review、test runner）
- 💾 **Session 持久化 + Compaction**：上下文超限自动摘要压缩

## 快速开始（开发版，预览）

```bash
# 克隆
git clone https://github.com/yysf1949/deepwhale.git
cd deepwhale

# 安装依赖（pnpm workspace）
pnpm install

# 配置 DeepSeek API key
echo "DEEPSEEK_API_KEY=sk-xxx" > .env

# 跑！
pnpm dev
```

## 路线图

详见 [ROADMAP.md](./ROADMAP.md) —— 5 个 Sprint，从 MVP 到 v1.0。

## 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  Channels（Hermes 借鉴）                                       │
│  CLI  │ 飞书 │ Telegram │ 邮件 │ Web UI │ Tauri Desktop        │
└─────────────────────────┬────────────────────────────────────┘
                          ↓ 统一 RPC
┌──────────────────────────────────────────────────────────────┐
│  deepwhale-runtime（TypeScript / Node ≥ 22）                   │
│  Agent Core │ Tools │ Extension API │ Skills │ Memory          │
│  Hooks      │ Sandbox 桥 │ Cache（前缀稳定）                  │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Providers（pi-ai 模式）                                        │
│  DeepSeek V4-Flash/Pro │ OpenAI │ Anthropic │ 自定义            │
└─────────────────────────┬────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  deepwhale-sandbox（Rust，可选）                               │
│  macOS Seatbelt │ Linux Landlock │ Windows Job Object          │
└──────────────────────────────────────────────────────────────┘
```

## 技术栈

- **主语言**：TypeScript（strict）+ Node ≥ 22
- **包管理**：pnpm workspace + Turborepo
- **TUI**：Ink（React 19 终端渲染）起步，后期可切 ratatui
- **桌面**：Tauri 2.x
- **沙箱**：Rust + napi-rs（Node ↔ Rust IPC）
- **MCP**：`@modelcontextprotocol/sdk` 官方
- **Skills 格式**：对齐 [Codex Agent Skills 开放标准](https://developers.openai.com/codex/skills)
- **配置**：TOML（`~/.deepwhale/config.toml`）

## 致谢 / 灵感来源

deepwhale 站在以下开源项目肩膀上：

- **[Hmbown/CodeWhale](https://github.com/Hmbown/CodeWhale)**（原 DeepSeek-TUI）—— Rust 双二进制架构、Constitution 9 级权威法典、OS 级沙箱
- **[esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)** —— byte-stable 前缀缓存、Flash-first 经济性、4 遍 tool-call repair、Memory/Skills/Hooks 平台
- **[earendil-works/pi](https://github.com/earendil-works/pi)**（58.6k stars）—— monorepo 设计、Extension API、4 种运行模式、Package Manager
- **[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)** —— 多渠道、Plugins、MEMORY + library 分层、Context 压缩
- **[OpenAI Codex CLI](https://github.com/openai/codex)** —— 要复刻的功能基线：Computer Use / Browser MCP / Skills / Plugins / Automations

## 贡献

项目处于早期 MVP 阶段，**欢迎任何形式的参与**：提 issue、PR、写 skill / extension、文档改进。

详见 [ROADMAP.md](./ROADMAP.md) 当前 Sprint。

## License

[MIT](./LICENSE)
