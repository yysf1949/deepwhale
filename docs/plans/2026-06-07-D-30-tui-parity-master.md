# D-30 TUI Parity Master Plan — Hermes TUI 能力全面对照 (2026-06-07)

> **For 拍板者 (user) + 实施者 (subagent / 后续 sprint):** 全面列出 deepwhale
> TUI v1.0.13 (release/v1.0 @ 0d97095) 跟 Hermes TUI (本会话) 的能力差距, 并拆
> 4 sub-sprint 拍板 ship 时序。**核心 (D-30 必做)** / **stretch (D-31+)** / 
> **out-of-scope (never)** 三档分类。

## Context

D-25→D-28 ship 65% Hermes 对齐 (status bar / transcript / confirm / multi-line
input / 3 themes / EMA / session 闭环)。D-29 ship 7 failing test 修 + repl.ts
god-file 947L → 286L 拆。**D-30 起, 目标把 Hermes 核心能力 systemically 搬过
来, 从「CLI 壳」升级为「真终端 agent」。**

**D-29.x 现状**:
- repl.ts: 286L (8 sub-modules, ≤300L ✓)
- tui-ink/ + modes/tui.ts: 2744L (Ink 容器 + 5 子组件 + 3 hooks, 3 themes, EMA, history, multi-line)
- 5 packages 1.0.13 published ✓
- 628/5/0 test ✓
- 5 红线 (D-19.5 / D-19.6 / 6afccc8 / 1ceef94 / no-unsafe-finally) 全保

**D-30 target**:
- Slash 命令 3 → **10+** (核心交互扩展)
- ToolRegistry ~10 → **25+** (web / vision / delegate / todo / memory / cron / skill)
- 持久化 2 文件 → **5+ dirs** (memory / skills / cron / sessions.db / profiles)
- UI 组件 5 → **12+** (TodoList / PlanView / MemoryEditor / SkillLoader / CronList / SessionList)
- Multi-channel 1 → **3** (terminal + Telegram + Discord)
- 5 packages ship v1.0.14

---

## 全面差距清单 (Gap Inventory)

> 标记:**核心 (D-30)** / **stretch (D-31+)** / **out-of-scope (never)**。
> 文件参考:deepwhale 现状 / Hermes 等价物。

### A. Slash 命令差距 (3 → 20+)

**deepwhale 已有 (3)**: `/exit`, `/q`, `/quit` (D-24.3 app.tsx:201)。

| # | 命令 | Hermes 等价 | 状态 | 文件参考 |
|---|------|------------|------|----------|
| 1 | `/help` | /help 列出所有命令 + 用法 | **核心** | D-29.1.3 router `dispatchSlashBuiltin` 已有 dispatcher 框架, 加 case |
| 2 | `/status` | /status 显示 model/session/usage/ema | **核心** | `<StatusBar>` 内容搬出 + 加 `/status` slash |
| 3 | `/verify` | /verify 跑 check 列表 | **核心** | router `/verify` 已有 (D-29.1.3, 1ceef94 try/finally), TUI app.tsx 没接 |
| 4 | `/theme` | /theme [name] 切主题 (default/solarized/monochrome) | **核心** | app.tsx 加 theme state + `<Prompt>` placeholder 改 |
| 5 | `/model` | /model [provider/model] 切模型 (Mid-turn) | **核心** | 需抽 `client` 出 `<App>` 变 state, `createDefaultClient` 多次调 |
| 6 | `/clear` | /clear 清屏 | **核心** | simple, 调 `process.stdout.write('\x1b[2J\x1b[H')` |
| 7 | `/sessions` | /sessions 列历史 session | **核心** | 需 sessions.db (FTS5), 跟单 JSONL 现状重构 |
| 8 | `/load <id>` | /load <id> 切 session | **核心** | 跟 `/sessions` 配套 |
| 9 | `/new` | /new 开新 session | **核心** | `createDefaultRegistry` + 跟 workingMessages 配合 |
| 10 | `/memory` | /memory view/edit MEMORY.md | **核心** | 需 MEMORY.md 系统, 后面 N 段必备 |
| 11 | `/skills` | /skills list/load/unload | **核心** | 需 skills/ dir |
| 12 | `/cron` | /cron list/add/remove | **核心** | 需 cron/jobs.json |
| 13 | `/plan` | /plan EnterPlanMode | **核心** | Plan mode, 跟 subagent 配 |
| 14 | `/tools` | /tools 列 ToolRegistry 状态 | **核心** | simple, 列 `createDefaultRegistry()` 名 |
| 15 | `/whoami` | /whoami 显示 user info | stretch | 需 USER.md, 简单 |
| 16 | `/profile` | /profile [name] 切 profile | stretch | 需 ~/.deepwhale/profiles/ |
| 17 | `/login` | /login 配 provider key | stretch | 需 `~/.deepwhale/.env` 加密? |
| 18 | `/config` | /config view/edit | stretch | 需 TUI 配置系统 |
| 19 | `/share` | /share 导出 session | stretch | 需 export 工具 |
| 20 | `/export` | /export 导 transcript | stretch | 简单 file write |

**核心 (D-30)**: 1-14 = **14 个**。stretch (D-31+): 15-20 = 6 个。

### B. 工具能力差距 (10 → 25+)

**deepwhale 已有 (~10)**: bash, edit-file, find, read (kind of), apply, glob?
需 `find packages/coding-agent/src/tools -name "*.ts" | head` 确认下。

**核心 (D-30, 14 个)**:
| # | 工具 | Hermes 等价 | 用途 |
|---|------|------------|------|
| 1 | `web_search` | web_search | Hermes 联网查 |
| 2 | `web_extract` | web_extract | 抓 markdown |
| 3 | `browser_navigate` | browser_navigate | 浏览器导航 |
| 4 | `browser_snapshot` | browser_snapshot | 抓 a11y tree |
| 5 | `vision_analyze` | vision_analyze | 看图 (本地/URL) |
| 6 | `text_to_speech` | text_to_speech | TTS 音频 |
| 7 | `delegate_task` | delegate_task | 并行 subagent |
| 8 | `todo` | todo (write/read/list) | 任务追踪 |
| 9 | `session_search` | session_search (FTS5) | 跨 session 召 |
| 10 | `read_file` | read_file | 文件读 |
| 11 | `write_file` | write_file | 文件写 |
| 12 | `patch` | patch | find-replace |
| 13 | `search_files` | search_files (ripgrep) | 文件搜 |
| 14 | `skill_manage` | skill_manage (create/patch/list/view) | skill 生命周期 |

**stretch (D-31+, 8 个)**:
- `execute_code` (Python script, 需 sandbox)
- `cronjob` (create/list/pause/resume/remove)
- `memory` (MEMORY.md read/write)
- `browser_click` / `browser_type` / `browser_console` (browser 完整)
- `nanoclaw` skill 类 (PDF 改, OCR)
- `notion` / `linear` / `airtable` (生产力)
- `arxiv` / `blogwatcher` / `llm-wiki` / `polymarket` (研究)
- `cloudflare_pages_deploy` / `webhook_subscriptions` / `github_*` (DevOps)
- `spotify` / `gif_search` / `youtube_content` / `heartmula` (媒体)

**out-of-scope (never, 7+ 类)**:
- Smart home: `cua_*` (computer use) / `homeassistant` / `openhue`
- 媒体: `songsee` (音频 spectrogram) / `remotion` (视频)
- 创作: `ascii-art` / `p5js` / `manim_video` / `pixel-art` / `excalidraw` / `comfyui` / `baoyu_*` / `claude-design` / `pretext` / `touchdesigner-mcp`
- 邮件: `himalaya` IMAP/SMTP
- 知识: `obsidian` (Obsidian vault 读)
- 硬件: `pokemon-player` (游戏机 emu)

### C. UI 组件差距 (5 → 12+)

**deepwhale 已有 (5)**: StatusBar, Transcript, Confirm, Divider, Prompt (D-24.2)

| # | 组件 | Hermes 等价 | 状态 | 来源 |
|---|------|------------|------|------|
| 1 | `TodoList` | ☐/☑ 渲染 | **核心** | 新建 `<TodoList>` 组件 |
| 2 | `PlanView` | plan mode plan 渲染 | **核心** | 新建 `<PlanView>` 组件 |
| 3 | `MemoryEditor` | /memory 编辑 | **核心** | 新建 `<MemoryEditor>` 组件 |
| 4 | `SkillLoader` | /skills load/unload | **核心** | 新建 `<SkillLoader>` 组件 |
| 5 | `CronList` | /cron list | **核心** | 新建 `<CronList>` 组件 |
| 6 | `SessionList` | /sessions 列表 | **核心** | 新建 `<SessionList>` 组件 |
| 7 | `CodeReviewCard` | receiving-code-review | **核心** | 新建 review card |
| 8 | `ProfileSwitcher` | /profile | stretch | 新建 |
| 9 | `ImagePreview` | vision_analyze 显示 | stretch | 新建 |
| 10 | `WebResultView` | web_search 结果 | stretch | 新建 |
| 11 | `SubagentIndicator` | delegate_task 跑中 | stretch | 新建 |
| 12 | `DiagramRenderer` | Mermaid 内嵌渲染 | stretch | 新建 (Mermaid → ASCII) |

**核心 (D-30)**: 1-7 = 7 个。stretch (D-31+): 8-12 = 5 个。

### D. 持久化状态差距 (2 → 5+ dirs)

**deepwhale 已有**:
- `~/.deepwhale/tui-history` (JSONL, 1000 条 LRU)
- `<session>.jsonl` (per session working messages)

**核心 (D-30, 5 个 dirs)**:
| # | 路径 | 形态 | 来源 |
|---|------|------|------|
| 1 | `~/.deepwhale/memory/MEMORY.md` | flat markdown | 持久 agent 学习 |
| 2 | `~/.deepwhale/memory/USER.md` | flat markdown | 持久 user 偏好 |
| 3 | `~/.deepwhale/skills/<name>/SKILL.md` | dir per skill | skill 系统 |
| 4 | `~/.deepwhale/cron/jobs.json` | flat JSON | cron 调度 |
| 5 | `~/.deepwhale/sessions.db` | SQLite FTS5 | 跨 session 召 |

**stretch (D-31+, 3 个 dirs)**:
- `~/.deepwhale/profiles/<name>/` (config + memory per profile)
- `~/.deepwhale/todos/<session>.md` (per-session todo 持久)
- `~/.deepwhale/plans/<sprint>.md` (per-sprint plan 持久)

### E. 多渠道差距 (1 → 3)

**deepwhale 已有**: terminal only (tui mode / repl mode / print mode)

**核心 (D-30, 2 个)**:
| # | 渠道 | Hermes 等价 | 复杂度 |
|---|------|------------|--------|
| 1 | Telegram | Telegram bot | 中 (BotFather + webhook + 长轮询) |
| 2 | Discord | Discord bot | 中 (discord.js + slash + gateway) |

**stretch (D-31+, 3 个)**:
- Feishu (留 飞书 script 兜底, 复用现有 credential)
- SMS (Twilio, 估 5 commit)
- WebSocket (custom, 估 4 commit)

### F. 媒体 / 声音

**核心 (D-30, 2 个)**:
- `vision_analyze` (本地/URL 图像分析, 1 commit)
- `text_to_speech` (edge-TTS 兜底, 1 commit)

**stretch (D-31+)**:
- audio spectrograms (songsee)
- gif search
- spotify control
- youtube transcripts

### G. 视觉 / 图表

**核心 (D-30, 1 个)**:
- Mermaid 内嵌 (assistant 输出 ```mermaid ``` block → ASCII 渲染或骨架图)

**stretch (D-31+)**:
- architecture-diagram (dark-themed SVG)
- sketch (HTML mockup)
- excalidraw
- p5js / pixel-art
- manim video (offline video gen)

### H. 研究 / 数据

**stretch (D-31+, 4 个)**:
- arxiv
- blogwatcher
- llm-wiki
- polymarket

### I. 生产力

**stretch (D-31+, 7 个)**:
- notion
- linear
- airtable
- google-workspace
- maps
- powerpoint
- ocr-and-documents (pymupdf, marker-pdf)

### J. DevOps

**stretch (D-31+, 5 个)**:
- cloudflare-pages-deploy
- webhook-subscriptions
- github-auth / github-pr-workflow / github-issues / github-code-review
- kanban-orchestrator / kanban-worker
- monorepo-npm-publish

### K. 智能家居 / 硬件

**out-of-scope (never)**: cua / homeassistant / openhue / pokemon-player

### L. 工程流程

**核心 (D-30, 3 个)**:
| # | 能力 | 用途 |
|---|------|------|
| 1 | `requesting-code-review` skill | 提交前自动 review |
| 2 | `plan` 工具 + Plan mode UI | EnterPlanMode / ExitPlanMode |
| 3 | `branch_state_recon` skill | finish-a-branch 协议 |

**stretch (D-31+)**:
- TDD enforcement (test-driven-development skill)
- systematic-debugging skill
- subagent-driven-development skill
- writing-plans skill
- finishing-a-development-branch skill

### M. 子代理

**核心 (D-30, 1 个)**:
- `delegate_task` (并行 subagent, 跟 tui-ink 联动, 估 5 commit)

**stretch (D-31+)**:
- `delegate_task` 加 model 选项
- Subagent 进度展示 UI

### N. 记忆 / 学习

**核心 (D-30, 2 个)**:
- MEMORY.md (agent 持续学习)
- USER.md (user 偏好)

**stretch (D-31+)**:
- Memory 自动注入 system prompt
- Memory 编辑器 (TUI 模态)

### O. 技能

**核心 (D-30, 1 个)**:
- skills/ dir + skill_manage tool + /skills slash

**stretch (D-31+)**:
- skill auto-load
- skill 模板生成

### P. 定时任务

**核心 (D-30, 1 个)**:
- cron/jobs.json + cronjob tool + /cron slash

**stretch (D-31+)**:
- Cron 调度执行 (跟 daemon 进程配合)

### Q. 会话管理

**核心 (D-30, 1 个)**:
- sessions.db FTS5 + /sessions / /load / /new

**stretch (D-31+)**:
- session_search tool
- 跨 session 引用

### R. Profile 切换

**stretch (D-31+, 1 个)**:
- profiles/ + /profile

---

## D-30 拍板 Sprint 拆分 (4 sub-sprint)

> 1 sprint = ~1 周 (按 D-25→D-28 历史节奏)。
> D-30 = 4 sub-sprint = 1 release cycle。
> 累计估 **~50 commit**, ship v1.0.14 (5 packages)。

### D-30.1: Slash 命令 + Web 工具 (1 sprint, ~12 commit)

**目标**: 14 个 slash 命令全实装 + web_search / web_extract / browser_* 装 ToolRegistry。

| commit | 内容 | LOC | 风险 |
|--------|------|-----|------|
| D-30.1.1 | 加 plan 文档 + 拍板 split | - | low |
| D-30.1.2 | `/help` 拆 (router 加 case) | +50 | low |
| D-30.1.3 | `/status` (StatusBar 内容搬出) | +80 | low |
| D-30.1.4 | `/verify` 接 TUI (1ceef94 try/finally 验) | +60 | low |
| D-30.1.5 | `/theme` mid-turn 切 | +70 | low |
| D-30.1.6 | `/model` 抽 client state | +100 | mid (LLM client 复用) |
| D-30.1.7 | `/clear` + `/new` | +30 | low |
| D-30.1.8 | web_search 工具 + ToolRegistry 注入 | +200 | mid (HTTP 调) |
| D-30.1.9 | web_extract 工具 + Markdown 解析 | +150 | mid |
| D-30.1.10 | browser_navigate / browser_snapshot 工具 (browser MCP 集成) | +200 | high (browser) |
| D-30.1.11 | `<ToolResult>` UI 组件 (tool call 显示统一) | +120 | low |
| D-30.1.12 | D-30.1 ship + bump v1.0.14-rc1 | - | low |

**红线**:
- 0 改业务 (slash 命令 1:1 行为, 跟 REPL/print 兼容)
- 0 破 D-19.5 P2-SIGINT 顺序
- 1ceef94 /verify try/finally 全保

**测试**: 628 → **680+** pass

### D-30.2: Memory + Todo + Plan (1 sprint, ~10 commit)

**目标**: MEMORY.md / USER.md / TodoList 渲染 / Plan mode UI / read_file / write_file / patch / search_files / execute_code。

| commit | 内容 | LOC | 风险 |
|--------|------|-----|------|
| D-30.2.1 | plan 文档 | - | low |
| D-30.2.2 | `~/.deepwhale/memory/MEMORY.md` + `USER.md` schema | +150 | low |
| D-30.2.3 | `read_file` / `write_file` / `patch` 工具 (TUI 跟 tui-ink 复用) | +400 | mid (sandbox perm) |
| D-30.2.4 | `search_files` 工具 (ripgrep) | +200 | low |
| D-30.2.5 | `execute_code` 工具 (Python sandbox) | +250 | high (sandbox) |
| D-30.2.6 | `todo` 工具 + `<TodoList>` 组件 | +300 | low |
| D-30.2.7 | `/memory` slash + `<MemoryEditor>` | +200 | low |
| D-30.2.8 | `plan` 工具 + `<PlanView>` 组件 + `/plan` slash | +300 | mid |
| D-30.2.9 | Plan mode 跟 tui-ink UI 集成 (EnterPlanMode hook) | +150 | low |
| D-30.2.10 | D-30.2 ship + bump v1.0.14-rc2 | - | low |

**红线**:
- execute_code 走 sandbox 跟 D-12 一致 (fail-closed)
- patch 走 file_glob 限制 (D-22.1 拍板)

**测试**: 680 → **740+** pass

### D-30.3: Subagent + Session + Skill + Cron (1 sprint, ~14 commit)

**目标**: delegate_task + sessions.db FTS5 + skills/ dir + cron/jobs.json + 4 slash。

| commit | 内容 | LOC | 风险 |
|--------|------|-----|------|
| D-30.3.1 | plan 文档 | - | low |
| D-30.3.2 | `~/.deepwhale/sessions.db` FTS5 schema | +200 | mid (SQLite) |
| D-30.3.3 | `session_search` 工具 (FTS5 跨 session 召) | +150 | mid |
| D-30.3.4 | `/sessions` + `/load` + `<SessionList>` 组件 | +300 | mid |
| D-30.3.5 | `delegate_task` 工具 (subagent 并行) | +400 | high (model 调用 × N) |
| D-30.3.6 | `<SubagentIndicator>` 组件 + UI 集成 | +200 | low |
| D-30.3.7 | `~/.deepwhale/skills/<name>/SKILL.md` schema | +150 | low |
| D-30.3.8 | `skill_manage` 工具 + `/skills` slash | +300 | low |
| D-30.3.9 | `~/.deepwhale/cron/jobs.json` schema | +150 | low |
| D-30.3.10 | `cronjob` 工具 (create/list/pause/resume/remove) | +250 | mid |
| D-30.3.11 | `/cron` slash + `<CronList>` 组件 | +200 | low |
| D-30.3.12 | Skill auto-load (启动时 detect skills/ 列表) | +100 | low |
| D-30.3.13 | `<SkillLoader>` 组件 + UI 集成 | +150 | low |
| D-30.3.14 | D-30.3 ship + bump v1.0.14-rc3 | - | low |

**红线**:
- delegate_task 走 跟 tui-ink 同 sandbox
- sessions.db 写并发加 lock
- cron 调 sandbox 跟 D-12 一致

**测试**: 740 → **800+** pass

### D-30.4: Vision + TTS + Multi-channel + Ship (1 sprint, ~14 commit)

**目标**: vision_analyze + text_to_speech + Telegram + Discord + ship v1.0.14。

| commit | 内容 | LOC | 风险 |
|--------|------|-----|------|
| D-30.4.1 | plan 文档 | - | low |
| D-30.4.2 | `vision_analyze` 工具 (本地/URL 图像) | +250 | mid (model 调) |
| D-30.4.3 | `<ImagePreview>` 组件 + UI 集成 | +200 | low |
| D-30.4.4 | `text_to_speech` 工具 (edge-TTS 兜底) | +150 | low |
| D-30.4.5 | `<DiagramRenderer>` 组件 (Mermaid → ASCII) | +200 | mid |
| D-30.4.6 | Telegram bot 桥 (BotFather + webhook) | +400 | high (production) |
| D-30.4.7 | Telegram 跟 tui-ink 联动 (long polling) | +300 | mid |
| D-30.4.8 | Discord bot 桥 (discord.js) | +400 | high (production) |
| D-30.4.9 | Discord 跟 tui-ink 联动 (gateway) | +300 | mid |
| D-30.4.10 | Multi-channel session 路由 (terminal / TG / DC 同源) | +200 | mid |
| D-30.4.11 | `requesting-code-review` skill 实装 | +200 | low |
| D-30.4.12 | 5 packages bump 1.0.14 + README sync | - | low |
| D-30.4.13 | D-30 ship ritual (worktree 双发) | - | low |
| D-30.4.14 | D-30 ship + tag v1.0.14 + 5 packages publish ✓ | - | low |

**红线**:
- Telegram/Discord credential 走 env, 不 hardcode
- Multi-channel 跟 tui-ink 同 session 状态 (single source of truth)
- Code review skill 跟 D-29.3 红线 0 冲突

**测试**: 800 → **860+** pass

---

## D-30 ship 验收

- **commit 累计**: D-29.x 16 + D-30.x ~50 = **~66 commit** in 4 sub-sprint
- **LOC 累计**: tui-ink + modes/tui.ts 2744L → **~7500L** (+175%)
- **测试**: 628 → **860+** pass (D-30 ship 后)
- **5 packages**: core, edit-engine, llm, coding-agent, tui-ink → v1.0.14
- **npm dist-tag latest**: 1.0.13 → 1.0.14
- **docs**: README.md / docs/plans/2026-06-07-D-30-tui-parity-master.md / docs/sprints/D-30/

## 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| delegate_task subagent 撞 budget | mid | 限并发 3 + 总 cost cap |
| browser_navigate 走 playwright | high | 复用 Hermes `mcp_cua_*` 或 puppeteer-core |
| Telegram/Discord prod 部署 | high | 先 stub, D-31+ 启 daemon |
| sessions.db FTS5 跨平台 | low | better-sqlite3 跨平台 build OK |
| execute_code sandbox escape | mid | 走 D-12 docker runner (跟现有一致) |
| Mermaid → ASCII 渲染 | mid | 限 mermaid-cli 子集 + 退化为纯文本 |

## Out of Scope (D-31+)

- 智能家居 (CUA / HomeAssistant / OpenHue)
- 媒体 (Spotify / YouTube / HeartMuLa / ComfyUI / Remotion)
- 创作 (p5js / pixel-art / manim / excalidraw / TouchDesigner)
- 邮件 (himalaya IMAP/SMTP)
- 知识库 (Obsidian vault)
- 硬件 (pokemon-player)
- 9 个 stretch slash 命令 (/whoami /profile /login /logout /config /share /export /import /docs /web)
- 8 个 stretch 工具 (arxiv / blogwatcher / llm-wiki / polymarket / cloudflare / github / kanban)
- 7 个生产力工具 (notion / linear / airtable / google-workspace / maps / powerpoint / ocr)
- 6 个工程 skill (TDD / systematic-debugging / subagent-driven-development / writing-plans / finishing-a-branch / spike)
- 5 个 stretch 组件 (ProfileSwitcher / ImagePreview / WebResultView / SubagentIndicator / DiagramRenderer)
- 3 个 stretch dir (profiles/ / todos/ / plans/)
- 3 个 stretch 渠道 (Feishu / SMS / WebSocket)

**这些累计 ~50+ 项 stretch, 估需 D-31~D-40 (10 sprint / 2.5 release cycle) 全做。**

## 来源

- D-25→D-28 master plan: `.hermes/plans/d19/d25-d28-tui-parity-sprint.md` (398 行)
- D-29 master plan: `docs/plans/2026-06-07-D-29-master.md` (80 行)
- D-29.2 plan: `docs/plans/2026-06-07-D-29.2-utilities-extract.md` (337 行)
- D-29.3 plan: `docs/plans/2026-06-07-D-29.3-startrepl-internal-extract.md` (360 行)
- Hermes skills 列表: `~/.hermes/skills/` (250+ skills, 6+ categories)
- Hermes toolsets 列表: `~/.hermes/config.yaml` (40+ toolsets)
- Hermes 渠道: `~/.hermes/channels/` (5+ channels)
- deepwhale 现状: `release/v1.0 @ 0d97095`, 5 packages 1.0.13, 628/5/0 test
