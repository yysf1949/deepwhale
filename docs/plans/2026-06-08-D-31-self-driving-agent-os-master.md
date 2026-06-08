# D-31 Self-Driving Agent OS Master Plan — 从 coding agent 升 workflow OS (2026-06-08)

> **For 拍板者 (user) + 实施者 (subagent / 后续 sprint):** D-30 ship 5 packages 1.0.15
> (release/v1.0 @ 72face6, 84 commit, 803/5/0 test) 后, D-30 master plan 留 ~50+ stretch
> 项 (智能家居/媒体/创作/邮件/知识库/硬件 + 8 tool + 7 生产力 + 6 工程 skill + 9 slash +
> 5 UI + 3 dir + 3 渠道). D-31 拍 "Self-Driving Agent OS" theme, 4 sub-sprint 拆, 估 ~52
> commit, ship 1.0.16.

## Context

**D-30 ship 现状 (1.0.15 ready, 5 packages live on npm)**:
- 14 slash 命令 + 17 工具 + 7 UI 组件 + 5 dirs + 3 渠道 (TG/DC/ChannelRouter) + vision/tts
- Mermaid 4-shape subset + requesting-code-review skill + 5 红线 0 改
- 803/5/0 test, 10 packages published (1.0.14 + 1.0.15)
- npm publish 走 registry API bypass (skill saved)
- opencode 1.16.2 + Hermes ACP ready for subagent dispatch

**D-30 → D-31 转折点**:
- D-30 = "真终端 coding agent" (TUI parity 100%, 但 user 仍要 手动 ship)
- D-31 = "self-driving workflow OS" (auto ship + auto research + auto product surface, 减 user 介入)
- 从「coding-only」升「general knowledge work + daily life integration」

**D-30 留 stretch 重点盘点** (~50 项, 分 6 类):
1. 8 stretch tools (arxiv / blogwatcher / llm-wiki / polymarket / cloudflare / github-* / kanban) — **D-31 重点**
2. 7 productivity tools (notion / linear / airtable / google-workspace / maps / powerpoint / ocr) — **D-31 重点**
3. 5 media (spotify / youtube / heartmula / comfyui / remotion) — D-31 部分 (spotify + youtube)
4. 3 knowledge (obsidian / llm-wiki / o知识库) — D-31 部分 (obsidian read-only + llm-wiki)
5. 6 engineering skill (TDD / debugging / subagent-dev / writing-plans / finishing-branch / spike) — **skip** (Hermes 已有 `superpowers:*` alias)
6. 5 stretch UI + 3 dir + 3 渠道 + 9 slash + smart-home + 邮件 + 创作 + 硬件 — D-31 部分 (按 主题 排)

## D-31 Theme: Self-Driving Agent OS

**核心拍板**:
- Auto ship (PR/Review/Deploy/Orchestrate 自动化)
- Auto research (paper/market/wiki/blog 1 query 拿)
- Auto product surface (notion/linear/airtable 双向 sync)
- Media control (spotify/youtube 1 slash)
- Knowledge vault (obsidian read-only bridge)

**核心 (D-31 必做) / 部分 (D-31 sub-sprint 排) / skip (D-32+ 视需要)**:
- 核心: 6 engineering tool + 4 research tool + 4 productivity tool + 2 media tool + 1 obsidian bridge + 4 UI 组件
- 部分: 9 stretch slash (只 /profile + /docs) + 3 stretch dir (profiles/) + 5 stretch UI (3 个)
- skip: 智能家居 / 硬件 / 邮件 / 创作 (ComfyUI/Remotion/TouchDesigner/p5js/manim 等) / 5 渠道 (Feishu/SMS/WebSocket) / 6 engineering skill / 6 媒体 (HeartMuLa/ComfyUI/Remotion) / diagram 完整 Mermaid 升

**5 packages ship v1.0.16** (1 version, 4 ship marker, 跟 D-30 协议 1:1).

---

## D-31.1: Engineering Automation — Auto Ship (~14 commit, ~40 min)

**目标**: 从 `git push` 到 `npm publish` 到 `cloudflare deploy` 全自动, 加 PR/Issue/Review/Kanban 协同.

**Tech Stack**: TypeScript, vitest, @octokit/rest (GitHub API), wrangler (cloudflare), child_process (kanban)

### Task 1: github-pr-workflow 工具 (D-31.1.1)
**Files**:
- Create: `packages/coding-agent/src/tools/github-pr-workflow.ts`
- Test: `packages/coding-agent/test/unit/github-pr-workflow.test.ts`

**实现要点** (TDD):
- `createPR` / `mergePR` / `closePR` / `listPRs` 4 action
- 走 @octokit/rest 调 `gh` CLI (avoids GH App auth complexity)
- 输入: `owner`, `repo`, `title`, `body`, `head`, `base`, `action`
- 输出: `{ success, prNumber, prUrl, state }`

**Test** (mock child_process.exec, 不实调 GH):
- mock `gh pr create` → assert exec 调用
- mock 返 url → assert output 解析
- mock 失败 → assert error 兜底

### Task 2: github-issues 工具 (D-31.1.2)
**Files**:
- Create: `packages/coding-agent/src/tools/github-issues.ts`
- Test: `packages/coding-agent/test/unit/github-issues.test.ts`

**实现**: `createIssue` / `listIssues` / `closeIssue` / `comment` 4 action (跟 PR workflow 1:1 协议)

### Task 3: github-code-review 工具 (D-31.1.3)
**Files**:
- Create: `packages/coding-agent/src/tools/github-code-review.ts`
- Test: `packages/coding-agent/test/unit/github-code-review.test.ts`

**实现**: `addReviewComment` / `submitReview` (approve / request-changes / comment) 3 action, 复装 D-30.5 `requesting-code-review` skill 输出

### Task 4: kanban-orchestrator 工具 (D-31.1.4)
**Files**:
- Create: `packages/coding-agent/src/tools/kanban-orchestrator.ts`
- Test: `packages/coding-agent/test/unit/kanban-orchestrator.test.ts`

**实现**: 多 subagent 编排 — 接 D-30.3 `delegate_task`, 加 board 状态 (todo / in-progress / review / done), persist `~/.deepwhale/kanban/board.json`

### Task 5: cloudflare-pages-deploy 工具 (D-31.1.5)
**Files**:
- Create: `packages/coding-agent/src/tools/cloudflare-pages-deploy.ts`
- Test: `packages/coding-agent/test/unit/cloudflare-pages-deploy.test.ts`

**实现**: `deploy` (走 `wrangler pages deploy`) / `listDeploys` / `rollback` 3 action, 调 CF API key 走 env

### Task 6: webhook-subscriptions 工具 (D-31.1.6)
**Files**:
- Create: `packages/coding-agent/src/tools/webhook-subscriptions.ts`
- Test: `packages/coding-agent/test/unit/webhook-subscriptions.test.ts`

**实现**: 1 source of truth `~/.deepwhale/webhooks/subs.json` (url + event filter), trigger 走 child_process spawn local handler, `list` / `add` / `remove` 3 action

### Task 7: registry 装 6 新工具 (D-31.1.7)
**Files**:
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Test: `packages/coding-agent/test/unit/registry-profile-engineering.test.ts`

**实现**: `createDefaultRegistry` 加 6 import + 6 register, 17 → 23 tools

### Task 8: `<SubagentIndicator>` UI 组件 (D-31.1.8)
**Files**:
- Create: `packages/tui-ink/src/components/SubagentIndicator.tsx`
- Test: `packages/tui-ink/test/subagentindicator.test.tsx`

**实现**: 显示 kanban 跑中的 subagent (status: queued / running / done / failed), 接 kanban-orchestrator

### Task 9-14: test + ship marker + version bump + push + npm publish (D-31.1.9-14)
**Acceptance**:
- 23 tools in registry (17 + 6)
- pnpm test +12 new test (4 file × 3 case avg)
- 5 红线 0 改
- registry 装完 ship marker

---

## D-31.2: Research Stack — Auto Knowledge (~12 commit, ~30 min)

**目标**: 1 query 拿 paper / market / wiki / blog, 1 slash 调.

**Tech Stack**: TypeScript, vitest, fetch (arXiv API), cheerio (HTML parse for blogwatcher), better-sqlite3 (llm-wiki)

### Task 1: arxiv 工具 (D-31.2.1)
**Files**:
- Create: `packages/coding-agent/src/tools/arxiv.ts`
- Test: `packages/coding-agent/test/unit/arxiv.test.ts`

**实现**: `search` (query + maxResults) / `get` (arxiv id) / `downloadPdf` 3 action, 调 arXiv API `export.arxiv.org/api/query`, 返 title/abstract/authors/pdfUrl

### Task 2: blogwatcher 工具 (D-31.2.2)
**Files**:
- Create: `packages/coding-agent/src/tools/blogwatcher.ts`
- Test: `packages/coding-agent/test/unit/blogwatcher.test.ts`

**实现**: `add` / `list` / `fetchNew` / `read` 4 action, RSS/Atom parse, persist `~/.deepwhale/blogwatcher/subs.json`, store fetched `~/.deepwhale/blogwatcher/entries/`

### Task 3: llm-wiki 工具 (D-31.2.3)
**Files**:
- Create: `packages/coding-agent/src/tools/llm-wiki.ts`
- Test: `packages/coding-agent/test/unit/llm-wiki.test.ts`

**实现**: Karpathy LLM Wiki 协议 — `addPage` / `link` / `query` / `list`, 走 better-sqlite3 存 `~/.deepwhale/wiki.db`, FTS5 全文索引

### Task 4: polymarket 工具 (D-31.2.4)
**Files**:
- Create: `packages/coding-agent/src/tools/polymarket.ts`
- Test: `packages/coding-agent/test/unit/polymarket.test.ts`

**实现**: `search` / `getMarket` / `getPrice` / `getOrderbook` 4 action, 调 polymarket.com CLOB API

### Task 5: session_search 升 full-text (D-31.2.5)
**Files**:
- Modify: `packages/coding-agent/src/util/session-index.ts` (升 FTS5 schema)
- Test: `packages/coding-agent/test/unit/session-search-fulltext.test.ts`

**实现**: 现 FTS5 只 title — 加 content column, content 索引 message[].text, 跨 session 召 命中 整段

### Task 6-12: registry 装 4 工具 + ship marker + bump (D-31.2.6-12)
**Acceptance**:
- 23 → 27 tools
- pnpm test +4 new test
- 5 红线 0 改

---

## D-31.3: Productivity Suite — Daily Surface (~14 commit, ~40 min)

**目标**: 文档/任务/数据/spreadsheet 双向 sync, OCR 走 sandbox.

**Tech Stack**: TypeScript, vitest, @notionhq/client (notion), @linear/sdk (linear), airtable (rest), tesseract.js (ocr)

### Task 1: notion 工具 (D-31.3.1)
**Files**:
- Create: `packages/coding-agent/src/tools/notion.ts`
- Test: `packages/coding-agent/test/unit/notion.test.ts`

**实现**: `search` / `getPage` / `createPage` / `updatePage` / `queryDatabase` 5 action, 调 @notionhq/client

### Task 2: linear 工具 (D-31.3.2)
**Files**:
- Create: `packages/coding-agent/src/tools/linear.ts`
- Test: `packages/coding-agent/test/unit/linear.test.ts`

**实现**: `listIssues` / `createIssue` / `updateIssue` / `addComment` 4 action, 调 @linear/sdk

### Task 3: airtable 工具 (D-31.3.3)
**Files**:
- Create: `packages/coding-agent/src/tools/airtable.ts`
- Test: `packages/coding-agent/test/unit/airtable.test.ts`

**实现**: `listBases` / `listRecords` / `createRecord` / `updateRecord` / `deleteRecord` 5 action, 调 airtable REST API

### Task 4: ocr-and-documents 工具 (D-31.3.4)
**Files**:
- Create: `packages/coding-agent/src/tools/ocr-and-documents.ts`
- Test: `packages/coding-agent/test/unit/ocr-and-documents.test.ts`

**实现**: `ocr` (本地 image/PDF → text) / `extractText` (PDF → text) 2 action, 调 tesseract.js + pdf-parse

### Task 5: registry 装 4 工具 (D-31.3.5)
**Files**:
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Test: `packages/coding-agent/test/unit/registry-profile-productivity.test.ts`

**实现**: 27 → 31 tools

### Task 6: `~/.deepwhale/profiles/` 创 (D-31.3.6)
**Files**:
- Create: `packages/coding-agent/src/util/profile-store.ts`
- Test: `packages/coding-agent/test/unit/profile-store.test.ts`

**实现**: `list` / `switch` / `current` 3 action, persist `~/.deepwhale/profiles/<name>/config.json`

### Task 7: /profile slash (D-31.3.7)
**Files**:
- Modify: `packages/coding-agent/src/repl/repl-command-router.ts` (加 /profile case)
- Test: `packages/coding-agent/test/unit/repl-router-profile.test.ts`

**实现**: 跟 D-30.1 14 slash 1:1 协议, 接 profile-store

### Task 8: `<MemoryEditor>` ship 后调 (D-31.3.8)
**Files**:
- Modify: `packages/tui-ink/src/components/MemoryEditor.tsx` (加 onChange callback)
- Modify: `packages/tui-ink/src/components/MemoryEditor.tsx` (接 MEMORY.md write)

**实现**: D-30.5 ship 了静态 view, 现加 edit 模式 (Ctrl+E enter edit, Esc cancel, Ctrl+S save)

### Task 9: `<ImagePreview>` UI 组件 (D-31.3.9)
**Files**:
- Create: `packages/tui-ink/src/components/ImagePreview.tsx`
- Test: `packages/tui-ink/test/imagepreview.test.tsx`

**实现**: 缩略图 + 链接到 ocr-and-documents

### Task 10-14: registry 装 + ship marker + bump (D-31.3.10-14)
**Acceptance**:
- 27 → 31 tools
- /profile slash 15 命令
- pnpm test +7 new test
- 5 红线 0 改

---

## D-31.4: Media + Knowledge — Content Surface (~12 commit, ~30 min)

**目标**: spotify + youtube 1 slash 控, obsidian read-only bridge, 2 UI 组件.

**Tech Stack**: TypeScript, vitest, spotify-web-api-node (spotify), youtube-transcript (youtube content), obsidian-api (vault read)

### Task 1: spotify 工具 (D-31.4.1)
**Files**:
- Create: `packages/coding-agent/src/tools/spotify.ts`
- Test: `packages/coding-agent/test/unit/spotify.test.ts`

**实现**: `search` / `play` / `pause` / `next` / `queue` / `currentTrack` 6 action, 走 spotify-web-api-node (OAuth refresh token 走 env)

### Task 2: youtube-content 工具 (D-31.4.2)
**Files**:
- Create: `packages/coding-agent/src/tools/youtube-content.ts`
- Test: `packages/coding-agent/test/unit/youtube-content.test.ts`

**实现**: `getTranscript` / `searchVideos` 2 action, 走 youtube-transcript npm + youtube data API

### Task 3: obsidian skill 桥 (D-31.4.3)
**Files**:
- Create: `packages/coding-agent/src/skills/obsidian-bridge.ts`
- Test: `packages/coding-agent/test/unit/obsidian-bridge.test.ts`

**实现**: read-only `listNotes` / `readNote` / `search`, 走 vault 路径 env `OBSIDIAN_VAULT_PATH`, 不写 (write 留 D-32+)

### Task 4: registry 装 2 工具 + obsidian skill (D-31.4.4)
**Files**:
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Test: `packages/coding-agent/test/unit/registry-profile-media.test.ts`

**实现**: 31 → 33 tools (spotify + youtube-content)

### Task 5: `<WebResultView>` UI 组件 (D-31.4.5)
**Files**:
- Create: `packages/tui-ink/src/components/WebResultView.tsx`
- Test: `packages/tui-ink/test/webresultview.test.tsx`

**实现**: web_search/web_extract 返结果 列表渲染 (title + url + snippet)

### Task 6: `<ProfileSwitcher>` UI 组件 (D-31.4.6)
**Files**:
- Create: `packages/tui-ink/src/components/ProfileSwitcher.tsx`
- Test: `packages/tui-ink/test/profileswitcher.test.tsx`

**实现**: 跟 D-31.3.6 profile-store 联, 列表 渲染 当前 profile

### Task 7-12: pnpm test + ship marker + bump + push (D-31.4.7-12)
**Acceptance**:
- 31 → 33 tools
- 5 红线 0 改
- pnpm test +6 new test = 803 + ~33 = **~836/5/0**

---

## D-31 ship 验收

- **commit 累计**: D-30.x 84 + D-31.x ~52 = **~136 commit** in 5 sub-sprint
- **LOC 累计**: tui-ink + modes/tui.ts 2744L + D-30 ~5000L + D-31 ~3500L = **~11250L** (+310% 累计)
- **测试**: 803 → **~836+** pass (D-31 ship 后)
- **5 packages**: core, edit-engine, llm, coding-agent, tui-ink → **v1.0.16**
- **npm dist-tag latest**: 1.0.15 → 1.0.16
- **Tools count**: 17 → 33 (+16, 16 几乎全 stretch)
- **Slash count**: 14 → 15 (+1 /profile)
- **UI count**: 7 → 12 (+5: SubagentIndicator/ImagePreview/WebResultView/ProfileSwitcher/MemoryEditor 升)
- **Dirs count**: 5 → 6 (+1 profiles/)
- **新增 dep**: @octokit/rest, wrangler, @notionhq/client, @linear/sdk, tesseract.js, spotify-web-api-node, youtube-transcript, cheerio, pdf-parse
- **docs**: README.md / docs/plans/2026-06-08-D-31-master.md / docs/sprints/D-31/ (4 sub)

## 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| GitHub/Notion/Linear API rate limit | mid | 加 retry + 走 `gh` CLI 走 user credential |
| OAuth flow spotify/youtube/notion | high | stub 返 fake token, 真实 OAuth 留 D-32 |
| OCR 慢 (tesseract.js ~5s/page) | mid | async + 进度显示 |
| Kanban persist 并发 | low | 加 file lock (D-30.3 sessions.db 同款) |
| Cloudflare wrangler auth | high | 走 env `CF_API_TOKEN`, 失败 退 to manual deploy |
| 33 tools registry 装 性能 | low | lazy load (现都 static import, 估 +50ms 启动) |
| Obsidian vault path 在 Windows | mid | 走 forward slash + home expand |

## Out of Scope (D-32+)

- 智能家居 (CUA / HomeAssistant / OpenHue) — 留 D-33
- 创作 (ComfyUI / Remotion / p5js / pixel-art / manim / excalidraw / TouchDesigner) — 留 D-33
- 邮件 (himalaya IMAP/SMTP) — 留 D-33
- 硬件 (pokemon-player) — 留 D-34
- 5 媒体 剩 (HeartMuLa / ComfyUI / Remotion / songsee) — 留 D-32
- 3 stretch 渠道 (Feishu / SMS / WebSocket) — 留 D-32 (跟 D-30.4 TG/DC 协议 1:1)
- 6 engineering skill (TDD / debugging / subagent-dev / writing-plans / finishing-branch / spike) — 留 D-32 (Hermes 已有 `superpowers:*` 别名, 优先 复用)
- 9 stretch slash 剩 8 (/whoami /login /logout /config /share /export /import /docs /web) — 留 D-32
- 5 stretch UI 剩 2 (CodeReviewCard 升 / DiagramRenderer 升) — 留 D-32
- 3 stretch dir 剩 2 (todos/ / plans/) — 留 D-32
- 7 生产力 剩 3 (google-workspace / maps / powerpoint) — 留 D-32
- 5 packages oauth 真实 flow (D-31 stub) — 留 D-32

**D-31~D-40 (10 sprint / 2.5 release cycle) 全做完 ~50+ stretch**.

## 拍板 拍板 拍板 (4 项)

1. **Theme**: Self-Driving Agent OS ✓ (user 拍板)
2. **4 sub-sprint 拆**: Engineering Automation → Research → Productivity → Media/Knowledge ✓ (user 拍板)
3. **5 红线 preserved**: D-30 5 红线 0 改走 1:1
4. **5 packages v1.0.16**: 1 version, 4 ship marker, 跟 D-30 协议 1:1

## D-31 拍板 → 派 opencode 写 4 D-31.x detailed plan

**Task handoff**:
1. `docs/plans/2026-06-08-D-31-master.md` (this file) — write + commit
2. `docs/plans/2026-06-08-D-31.1-engineering-automation.md` — opencode 写 (writing-plans protocol)
3. `docs/plans/2026-06-08-D-31.2-research-stack.md` — opencode 写
4. `docs/plans/2026-06-08-D-31.3-productivity-suite.md` — opencode 写
5. `docs/plans/2026-06-08-D-31.4-media-knowledge.md` — opencode 写
6. 4 plan files commit (single commit)
7. User 拍板 实施 时序 (4 sub-sprint 一次 ship 还是 1-by-1)

## 来源

- D-30 master: `docs/plans/2026-06-07-D-30-tui-parity-master.md` (448 行)
- D-30 ship 账: release/v1.0 @ 72face6, 84 commit, 803/5/0, 1.0.15
- npm-publish-registry-api-bypass skill: `~/AppData/Local/hermes/skills/npm-publish-registry-api-bypass/`
- opencode-hermes-minimax-setup skill: `~/AppData/Local/hermes/skills/opencode-hermes-minimax-setup/`
