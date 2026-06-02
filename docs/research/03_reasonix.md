# DeepSeek-Reasonix 深度研究报告

> 调研对象：[esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) （分支 `main-v2`）
> 调研目的：为 deepwhale 项目借鉴 Reasonix 的 prefix-cache 经济性 + Skills/Memory/Hooks 平台 + 桌面端架构
> 调研时间：2026-06-03
> 调研方式：`gh repo clone` 拉取 main-v2 分支（depth=1）后逐文件验证，关键代码已与 issue tracker / Reddit / YouTube 工程评述交叉对照

---

## ⚠️ 三个必须先澄清的认知偏差

调研一开始就被 deepwhale 团队「5+ 次踩坑项目记录」里描述的 "Node.js DeepSeek 客户端" 误导了。在读完 README 和 `go.mod` 后必须先纠正三件事，否则后续借鉴全错位：

1. **不是 Node.js，是 Go**。`main-v2` 是 Reasonix **1.0+** 的全新重写。README 第 6 行明确："Reasonix 1.0 is a ground-up rewrite in Go … `main-v2` is the new default"。`go.mod`（`/tmp/reasonix/go.mod:1`）是 `module reasonix / go 1.25.0`，依赖链里只有 `BurntSushi/toml` 一个三方库（+ Charm Bubbletea 等纯 Go TUI 库），目标是 "single static binary, CGO-free, cross-compile one command"。旧的 `0.x` TypeScript 全部归档在 `v1` 分支做 maintenance only；`npm i -g reasonix` 命令本身在 1.0+ 里只是个"装二进制"的 npm 壳（`/tmp/reasonix/npm/build.mjs` + `npm/reasonix`），不是 Node 运行时。
2. **不是 Ink TUI，是 Charm Bubbletea TUI**。`/tmp/reasonix/go.mod:7-15` 锁定了 `charm.land/bubbles/v2`、`charm.land/bubbletea/v2`、`charm.land/lipgloss/v2`、`charm.land/colorprofile`、`charmbracelet/x/ansi`。Bubbletea 是 Go 的 Elm-style TUI 框架，与 Node 的 Ink 走的是同一种 declarative-update 模型（`Init` → `Update(msg) → View`），是 Ink 在 Go 里的精神继承者。
3. **不是 Tauri 桌面，是 Wails 桌面**。`desktop/wails.json:1-19` 明示是 `wailsapp/wails/v2 v2.12.0`（"Wails shell around the Go kernel"），不是 Tauri/Rust。`desktop/README.md:27-32` 解释了 "嵌套 Go 模块 + replace" 模式的原因：把 CGO/WebKit 构建跟 CLI 的 `CGO_ENABLED=0` 单文件二进制隔离。Webview 侧仍是 React+TS+Vite（`desktop/frontend/src/`），与 Tauri 的 webview 思路在「原生 webview + Go/Rust 后端」层面是同源的。

这三个纠偏非常重要：deepwhale 计划照搬的 "TypeScript + Ink + Tauri" 实际是 **"Go + Bubbletea + Wails"**，借鉴路径需要从语言栈到 build 工具链全部切换。

---

## 1. 项目概览

| 维度 | 数据 / 状态 |
|---|---|
| 仓库 | github.com/esengine/DeepSeek-Reasonix |
| 默认分支 | `main-v2`（开发），`v1`（legacy TS，maintenance only） |
| 许可证 | MIT |
| 当前 1.0 版本 | unreleased（`CHANGELOG.md:7` "## [1.0.0] — unreleased"） |
| commits | 272（`gh` 显示 "272 commits"），HEAD `053f2b9 fix(desktop): keep the NSIS installer script ASCII (#2780)` |
| 贡献者 | 17（README §About） |
| Releases | 32（README §About） |
| Stars | ~6,000+（YouTube 频道 "The Engineering Why" 在 2026-05-26 的视频描述中确认："already accumulating over six thousand GitHub stars in its first weeks"，5 月 1 日发布后数周内达成）；HN 729 分（news.ycombinator.com/item?id=48256953） |
| 模块设计 | **不是 monorepo**——是 `cmd/` + `internal/` 单 module Go 工程 + 一个嵌套的 `desktop/` 子 module（`desktop/go.mod:1-5` 用 `replace reasonix => ../` 复用主 kernel） |
| 桌面栈 | Wails v2.12.0 + React + Vite + pnpm（`desktop/wails.json`） |
| TUI 栈 | Bubbletea v2 + Lipgloss v2 + Bubbles v2 + Charm x/ansi（`go.mod:7-15`） |
| 三种 frontend 共享同一 kernel | Chat TUI · HTTP/SSE server (`reasonix serve`) · Wails desktop；都过 `internal/boot.Build()` 组装（`/tmp/reasonix/internal/boot/boot.go:115-393`） |
| 定位 | "A DeepSeek-native AI coding agent for your terminal. Engineered around prefix-cache stability — leave it running."（README 首段） |
| 第三方依赖哲学 | "Standard library by default. A third-party dependency must be pure-Go, lightweight, and must not compromise the single-binary / cross-platform / distribution story. TOML parsing is the one accepted dependency."（`docs/SPEC.md:14-16`） |

**这与 deepwhale 的关联**：Reasonix 的整套工程哲学（"kernel 不绑 frontend、prefix-cache 当成不变量而非功能、配置和插件驱动一切"）与 deepwhale 想要的"借鉴 Reasonix 平台层"完全契合，但具体落地的语言和工具栈要相应切换。

---

## 2. 核心架构

### 2.1 ASCII 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        three frontends (share one kernel)            │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐  │
│ │ Chat TUI         │ │ HTTP/SSE serve   │ │ Wails Desktop        │  │
│ │ Bubbletea+LPG    │ │ (internal/serve) │ │ React+TS+Vite webview│  │
│ │ + Bubbles inputs │ │ /events stream   │ │ window.go bindings   │  │
│ └────────┬─────────┘ └────────┬─────────┘ └──────────┬───────────┘  │
│          │   sink(event.Event) │   sink(event.Event) │  sink        │
│          └──────────────┬──────┴──────────┬───────────┘              │
└─────────────────────────┼─────────────────┼──────────────────────────┘
                          │                 │
              ┌───────────▼─────────────────▼────────────┐
              │   internal/control.Controller            │  ← transport-agnostic
              │   (one transport-agnostic controller)    │     "All three inherit
              │   每种 frontend 接同一组事件和命令         │      it" (REASONIX.md:9-11)
              └───────────────┬──────────────────────────┘
                              │
              ┌───────────────▼──────────────────────────┐
              │   internal/agent.Agent                   │  ← single-task harness
              │   (Provider, ToolRegistry, Session,       │
              │    Gate, Hooks, Compact, StormBreaker)    │
              └───────────────┬──────────────────────────┘
                              │
        ┌──────────┬──────────┼──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ▼
    provider/   tool/     memory/    skill/     hook/     permission/
    openai/   builtin/             (Markdown  (settings.  (deny>ask
    anthropic/ registry             playbooks)  json)      >allow)
                                                              │
                                              plugin/ (MCP)──┘
                                              stdio/Streamable HTTP
```

### 2.2 三大设计原则（来自 `docs/SPEC.md` §1）

1. **Config- and plugin-driven core** — kernel 只认接口；具体模型和工具由 config / registry 解析。
2. **Single static binary** — `CGO_ENABLED=0`，一个 `make cross` 出全平台。
3. **Lean dependencies** — 标准库优先；除 TOML parser 外不引入新三方。

这三原则直接决定了为什么 `internal/agent` 不写复杂逻辑：所有外部能力都通过 `Provider` 和 `Tool` 接口注入，core 只做"调度 + 缓存不变量"。

### 2.3 模块组成（`internal/` 38 个包，关键 8 个）

| 包 | 职责 | 关键类型 / 文件 |
|---|---|---|
| `provider` | 模型后端抽象 + 注册表 + SanitizeToolPairing + 4-pass-equivalent 修复 | `provider.go:78-150` 修复 |
| `provider/openai` | OpenAI-compatible 实现，覆盖 DeepSeek / MiMo / 任何 `/chat/completions` | `openai.go:125-175` buildRequest |
| `provider/anthropic` | Anthropic Messages API | `anthropic.go:196+` |
| `agent` | 单任务 driver：Run loop、Compact、StormBreaker、Parallel dispatch、Sub-agent | `agent.go`、`compact.go`、`coordinator.go` |
| `skill` | Markdown playbook 加载 + `run_skill`/`install_skill` 工具 + 内建 subagent 包装 | `skill.go`、`index.go`、`tools.go` |
| `memory` | 层次化 docs（`REASONIX.md`/`AGENTS.md`）+ auto-memory store + `remember`/`forget` 工具 | `memory.go`、`store.go`、`queue.go` |
| `hook` | Pre/PostToolUse/UserPromptSubmit/Stop/PostLLMCall 等 10 个事件的 shell hook | `hook.go:31-54` events 列表 |
| `permission` | Per-call 策略（deny > ask > allow > fallback） | `internal/permission/` |

---

## 3. 关键技术细节（4 大机制逐项验证）

### 3.1 前缀缓存 99% 命中的 4 个机制

Reasonix 文档化 + 代码化的 4 个机制都有真实代码引用，不是营销话术。每一个都对应一个具体的工程决策。

#### 机制 A — System Prompt 字节稳定化（一次组装，永不增删）

**真实代码**（`/tmp/reasonix/internal/boot/boot.go:120-148`）：

```go
sysPrompt, err := cfg.ResolveSystemPrompt()      // L120  base prompt
...
sysPrompt = outputstyle.Apply(sysPrompt, st)     // L128  persona style
sysPrompt += "\n\n" + config.LanguagePolicy      // L130  language
mem := memory.Load(memory.Options{CWD: ".", UserDir: config.MemoryUserDir()})  // L137
sysPrompt = memory.Compose(sysPrompt, mem)       // L139  memory docs + index
...
skillStore := skill.New(skill.Options{...})      // L146
skills := skillStore.List()
sysPrompt = skill.ApplyIndex(sysPrompt, skills)  // L148  skills index (names only)
```

注释（`boot.go:132-148`）直说："Persistent memory … folds into the system prompt exactly here, once: it becomes part of the durable, cache-stable prefix every turn reuses, so memory costs nothing per turn. Mid-session changes never touch this prefix — they ride the controller's transient turn-injection and fold in on the next session."

→ **mid-session 改 memory 不动 cache 段**：`memory.Compose`（`internal/memory/memory.go:154-163`）是 `base + memory`，base 永远在最前；`memory.Block()`（`memory.go:127-148`）"deterministic given the same files, which is what keeps it a stable cache prefix"。

→ **skills 索引只放 names + descriptions，不放 body**：`internal/skill/index.go:10` `IndexMaxChars = 4000`（硬上限），注释说"caps the pinned skills-index block so it can't bloat the cache-stable system-prompt prefix; bodies never enter the prefix"。Bodies 走 `run_skill` 工具按需加载（`tools.go:60-88`）。

#### 机制 B — Reasoning content **不**重传（实测省 ~500 tokens/turn）

**真实代码**（`/tmp/reasonix/internal/provider/openai/openai.go:131-137`）：

```go
for i, m := range src {
    // reasoning_content is deliberately NOT sent back: it's a response-only
    // field. DeepSeek counts re-sent reasoning as billable prompt input
    // (measured ~500 extra tokens per turn on a reasoner chain); MiMo accepts
    // it but does not require it ...
    cm := chatMessage{
        Role:       string(m.Role),
        Content:    m.Content,
        ToolCallID: m.ToolCallID,
        Name:       m.Name,
    }
```

`chatMessage` 结构体本身（`openai.go:354-368`）也明确写了"// no reasoning_content field: it is a response-only signal and is never sent back upstream"。

→ **regression test**：`internal/provider/openai/realcache_test.go:170-175` 的 probe 2 直接测了这条修复的效果：注释说"Before the fix this delta was ~+500 (DeepSeek billed the re-sent reasoning as prompt input). After the fix the openai provider drops reasoning_content from the request, so both variants send an identical wire request and the delta should be ~0."

这是 Reasonix 公开 benchmark 上 "435M tokens, 99.82% hit rate"（YouTube 视频描述，2026-05-01 真实一天）能成立的核心省 token 机制之一。

#### 机制 C — Wire-level 字节稳定序列化（两条具体规则）

1. **`content: ""` 永远序列化**（`/tmp/reasonix/internal/provider/openai/openai.go:354-368`）：

```go
type chatMessage struct {
    Role string `json:"role"`
    // content is always serialized, even when empty: an assistant turn that is
    // pure tool_calls (no preamble text) has empty content, and DeepSeek's
    // strict deserializer rejects a message missing the field ("missing field
    // `content`"). An empty string satisfies presence and is accepted by every
    // OpenAI-compatible backend for all roles (unlike null, which some reject
    // for a tool message).
    Content    string         `json:"content"`
    ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
    ...
}
```

有专门的 regression test `TestBuildRequestAlwaysSerializesContent`（`openai_test.go:128-148`）守这条："guards the DeepSeek 400 regression: an assistant turn that is pure tool_calls (no preamble text) has empty content, and DeepSeek rejects a message missing the `content` field."

2. **Schema key 排序**（`/tmp/reasonix/internal/provider/schema_canonicalize.go:31-67`）：

```go
func canonicalizeSchemaValue(v any) any {
    switch val := v.(type) {
    case map[string]any:
        for k, inner := range val {
            val[k] = canonicalizeSchemaValue(inner)
        }
        for key := range val {
            if setLikeSchemaArrays[key] {  // "required" / "dependentRequired"
                if arr, ok := val[key].([]any); ok {
                    sort.SliceStable(arr, func(i, j int) bool {
                        return schemaJSONString(arr[i]) < schemaJSONString(arr[j])
                    })
                }
            }
        }
        ...
```

→ 同一逻辑 schema 不同 Go map 序列化出来的 key 顺序可能不同，DeepSeek 的 prefix cache 按 byte hash，所以 `CanonicalizeSchema`（`schema_canonicalize.go:10-24`）递归 sort `required` / `dependentRequired` 数组，确保"same logical schema always produces the same byte representation"。

#### 机制 D — Compaction 作为**唯一**显式 cache-reset point

**真实代码 + spec**：

- `/tmp/reasonix/docs/SPEC.md:194-197`："This is the **only** point where the prompt prefix changes — a deliberate, rare 'cache-reset point'. Between compactions the session grows prepend-only and stays cache-friendly."
- `/tmp/reasonix/internal/agent/compact.go:16-20`："Compaction is a low-frequency cache-reset point: the prompt grows append-only (high cache hits) until a turn nears compactRatio of the window, then it is compacted down to a tail budget."
- `compact.go:63-94` `maybeCompact`：触发条件 `promptTokens >= window * compactRatio (0.8)`，触发后 `a.consecutiveCompacts++`，连续 2 次失败则 latch `compactStuck = true` 自动暂停 compaction 防止 death loop（注释里说"re-firing every turn is the loop users hit, so pause auto-compaction and say why, once"）。
- `compact.go:96-154` `compact`：把 session 重组为 `system + summary + recentTail`；`summary` 用 executor 自己的 provider 单次 summarize（无 tools），原本丢掉的原文写入 `archiveDir/20060102-150405.000.jsonl`（`compact.go:386-405`）做可追溯。
- `compact.go:266-289` `tailStart`：tail 边界按 token budget 划（不是 message count），并强制 "aligns the boundary back off any tool result so the tail never begins with an orphan whose assistant tool_calls were summarized away"——这是一条非常细的 cache 保护，避免 summarize 完丢了一个 tool_call 的 result 导致下一轮 API 报 "must be followed by tool messages"。

#### 机制补充 — Session bytes 不变策略（不是单独一项，但常被忽略）

`/tmp/reasonix/internal/agent/agent.go:194-212` 的 `compactStuck` / `consecutiveCompacts` / `stormSig` / `stormCount` 字段注释直说："**Context management: when a turn's prompt nears contextWindow, the older middle of the session is summarized away, keeping a token-bounded recent tail verbatim** … the prompt only grows from here; compact before the next turn so it stays within the model's window."（`agent.go:424-426`）

`a.session.Add(...)` 在每轮循环里只 append，绝不在 mid-turn 改写已有 message；这保证了 "session grows prepend-only" 的字节不变量。

---

### 3.2 Tool-call repair（不是"4 遍"，是 1 个函数 + 多种 pairing 策略）

> **关键澄清**：背景描述里的"4 遍 tool-call repair"在 Reasonix 1.0+ 的实际代码里**不存在**。实际只有 **`SanitizeToolPairing`** 一个函数（`/tmp/reasonix/internal/provider/provider.go:78-150`），它每次 send 时跑一次，但内部覆盖 4 种 pairing 情况。可能 YouTube 视频或第三方解读把它"4 种情况"误读成"4 遍"。

**真实代码**（`provider.go:78-150`）：

```go
// SanitizeToolPairing repairs a history so it satisfies the tool-call contract the
// OpenAI-compatible and Anthropic APIs enforce: every assistant tool_calls entry
// must be answered by a following tool message for its id, and a tool message must
// follow such a call. It backfills a placeholder result for any unanswered call
// (so the turn stays intact) and drops orphan tool messages. Well-formed histories
// pass through unchanged (results stay in call order). Callers send the result;
// the stored session keeps the original.
func SanitizeToolPairing(msgs []Message) []Message {
    out := make([]Message, 0, len(msgs))
    for i := 0; i < len(msgs); {
        m := msgs[i]
        if m.Role == RoleAssistant && len(m.ToolCalls) > 0 {
            j := i + 1
            for j < len(msgs) && msgs[j].Role == RoleTool {
                j++
            }
            out = append(out, m)
            out = append(out, pairToolResults(m.ToolCalls, msgs[i+1:j])...)
            i = j // tool messages consumed here; any non-matching ones are orphans, dropped
            continue
        }
        if m.Role == RoleTool {
            i++ // orphan tool message (no preceding assistant tool_calls) — drop
            continue
        }
        out = append(out, m)
        i++
    }
    return out
}
```

4 种 pairing 情况（`pairToolResults` + `idDistinct` / `openai.go:293-298` + buildRequest 前的调用）：

| 情况 | 检测 | 行为 | 代码 |
|---|---|---|---|
| **1. 中断的 tool call（resume 时 tool result 没落地）** | 一个 assistant tool_calls 后面没有 tool message | 填一个 placeholder string `"[no result: the previous turn was interrupted before this tool call completed]"`（`provider.go:69`） | `provider.go:108-122` |
| **2. 孤儿 tool message（assistant 之前没有 tool_calls）** | 一上来就 RoleTool | 直接 drop | `provider.go:92-95` |
| **3. id 唯一且非空**（绝大多数 DeepSeek 直连） | `idDistinct(calls) == true` | 按 `id` key map 配对；reorder 也照 call 顺序输出 | `provider.go:110-122` |
| **4. id 为空或重复**（某些 gateway 按 index 流式发） | `idDistinct` false | 按 position 配对，强行把 result 的 `ToolCallID` 改成 call 的 ID | `provider.go:124-133` |

`idDistinct` 实现（`provider.go:138-150`）：每个 call 的 id 非空且 batch 内互异。

调用点（`/tmp/reasonix/internal/provider/openai/openai.go:125-129`）：

```go
func (c *client) buildRequest(req provider.Request) chatRequest {
    // Repair tool-call pairing before sending: an interrupted/resumed history can
    // carry an assistant tool_calls turn whose results never landed, which DeepSeek
    // rejects with a 400 ("must be followed by tool messages …").
    src := provider.SanitizeToolPairing(req.Messages)
```

对 id 为空场景的进一步补救（`openai.go:293-298`）：

```go
for _, idx := range order {
    tc := acc[idx]
    if tc.ID == "" {
        // Some OpenAI-compatible gateways stream tool calls by index with no id.
        // Synthesize a stable one so the result can be paired back to its call —
        // an empty tool_call_id collapses multi-tool turns downstream.
        tc.ID = fmt.Sprintf("call_%d", idx)
    }
```

E2E 测试 `TestRunMultiToolRoundEmptyIDsSurvivePairing`（`/tmp/reasonix/internal/agent/loop_e2e_test.go:21-55`）守的正是"按 index 流的两个 tool call 不能被 map-by-id 折叠成同一个 result"——注释里直说"Keying on tool_call_id alone collapsed them into one, dropping a result from the model's context on the very next turn"。

**deepwhale 借鉴建议**：复刻 `SanitizeToolPairing` 4 种 pairing 情况 + 占位符常量，但**不要在 deepwhale 里硬塞"4 遍"**——这是误解。

---

### 3.3 Skills / Memory / Hooks 平台的具体 API

#### Skills（`internal/skill/`）

**文件发现**（`/tmp/reasonix/internal/skill/skill.go:54-66`）：

```go
type Skill struct {
    Name        string
    Description string
    Body        string
    Scope       Scope
    Path        string
    AllowedTools []string
    RunAs        RunAs
    Model        string
}
```

**Scope 优先级**（`skill.go:30-35`）：`project > custom > global > builtin`（数字越大越优先，在 `List()` 里 deduped by name 时"first root wins"——`skill.go:208-241`）。

**RunAs 两种模式**（`skill.go:42-45`）：`inline`（body 折进当轮 tool result）/ `subagent`（独立 child loop，只回 final answer）。

**Frontmatter 字段**（`skill.go:308-337` + `parseRunAs` `skill.go:439-453`）：

| 字段 | 含义 |
|---|---|
| `name` | 覆盖文件名 stem（需 valid） |
| `description` | 进 cache-stable 索引；缺了 skill 仍加载但不进索引（warning） |
| `allowed-tools` | 逗号分隔；限定 subagent 工具集 |
| `runas: subagent` | 显式 subagent 模式 |
| `context: fork` | 跨工具约定的别名（同样触发 subagent） |
| `agent: <name>` | 跨工具约定的别名 |
| `model: <name>` | subagent 覆盖模型 |

**目录布局两种**（`skill.go:288-306`）：

- 目录型：`<name>/SKILL.md` + 可选 `references/*.md`（Anthropic Skills 兼容，references 自动追加到 body，`loadBodyWithReferences` `skill.go:388-422`）
- flat：`<name>.md`

**run_skill 工具签名**（`/tmp/reasonix/internal/skill/tools.go:49-58`）：

```json
{
  "type":"object",
  "properties":{
    "name":{"type":"string","description":"Skill identifier as it appears in the pinned Skills index (e.g. 'explore', 'review'). Case-sensitive. Just the identifier, not the [🧬 subagent] tag."},
    "arguments":{"type":"string","description":"Free-form arguments. For inline skills: appended as an 'Arguments:' line; the skill's own instructions decide how to use them. For subagent skills: REQUIRED — becomes the entire task the subagent receives."}
  },
  "required":["name"]
}
```

**约定根**（`skill.go:154-156` + `config.ConventionDirs`）：`.reasonix / .agents / .agent / .claude` 四个目录都被扫描——这意味着 Claude Code / Codex / 其他 agent 写的 skill 直接迁移可用。

**子 agent skill 的 4 个内建包装**（`/tmp/reasonix/internal/skill/tools.go:90+` + `boot.go:378-380`）：`explore` / `research` / `review` / `security_review`，每个都是 thin wrapper，内部用 `run_skill` + subagent runner，避免模型把它们当成普通 inline skill。

**Cache 保护点**（`index.go:22-35`）：`ApplyIndex` 只挂 `name + description + [🧬 subagent]` tag，body 永远不进入 system prompt。

#### Memory（`internal/memory/`）

**两层结构**：

1. **Hierarchical docs**（`memory.go:15-21` `Set.Docs`）：
   - `REASONIX.md` / `AGENTS.md`（优先 REASONIX，其次 AGENTS，CLAUDE 作为 fallback 接受）
   - 范围：`project`（cwd）→ `local`（`*local.md`）→ `user`（`~/.config/reasonix/REASONIX.md`）→ ancestor dir 继承
   - 加载顺序按"ascending precedence"——user 覆盖 project，project 覆盖 ancestor
2. **Auto-memory store**（`/tmp/reasonix/internal/memory/store.go:20-22`）：
   - 每个项目一个目录 `~/.config/reasonix/projects/<slug>/memory/`
   - `slug` = 路径分隔符替换成 `-`（如 `/Users/me/proj` → `-Users-me-proj`）
   - 一条 memory 一个文件（frontmatter + body），同时维护 `MEMORY.md` 索引（一行一事实："- [title](name.md) — description"）

**Memory 类型**（`store.go:25-32`）：`user` / `feedback` / `project` / `reference`，外加 `NormalizeType` 兜底（`store.go:40-46`）。

**工具 API**（`/tmp/reasonix/internal/memory/remember.go` + `forget.go`，签名来自 `boot.go:336-337`）：

- `remember(name, type, description, body)`：写一条新 memory，刷新 MEMORY.md 索引行
- `forget(name)`：删 memory 文件 + 索引行

**Cache 保护**（`memory.go:79-82` + `memory.go:127-148`）：

```go
// Empty reports whether the set carries nothing to inject, so Compose can leave
// the base prompt byte-for-byte untouched (and the cache prefix maximal) when
// there is no memory at all.
func (s *Set) Empty() bool { ... }

// Block renders the memory as a single Markdown section, or "" when empty. It is
// deterministic given the same files, which is what keeps it a stable cache
// prefix across sessions that don't change their memory.
```

→ **mid-session 改 memory 不动 prefix**：`/tmp/reasonix/internal/memory/queue.go` 提供 turn-tail 注入通道，agent.go:236 `SetMemoryQueue(q memory.Queue)` 把"刚改的 memory"挂到下个 turn 的 user message 末尾，本 session 立即可见，但 prefix bytes 保持稳定。

**辅助功能**：`/tmp/reasonix/internal/memory/quickadd.go`（快速 #note 添加到 REASONIX.md），`writedoc.go`（写 doc 文件），都受 `allowedDocPaths`（`memory.go:92-103`）白名单保护——只允许写"已被发现的 memory 文件"。

#### Hooks（`internal/hook/`）

**10 个事件**（`/tmp/reasonix/internal/hook/hook.go:31-54`）：

| Event | 触发 | 能否 block |
|---|---|---|
| `PreToolUse` | 工具调用前 | ✅（gating event） |
| `PostToolUse` | 工具调用后 | ❌（只观测） |
| `UserPromptSubmit` | 用户 turn 边界 | ✅（gating event） |
| `Stop` | 一轮 turn 结束 | ❌ |
| `PostLLMCall` | 模型流式结束、reasoning 落库前 | ❌（stdout 可替换 reasoning） |
| `SessionStart` | session 激活（fresh/resume/after /new） | ❌ |
| `SessionEnd` | session 关闭/轮换 | ❌ |
| `SubagentStop` | `task` sub-agent 完成 | ❌ |
| `Notification` | agent 需要用户注意（如待审批） | ❌ |
| `PreCompact` | compaction pass 前 | ❌（stdout 注入 summary guidance） |

**Hook 配置格式**（`hook.go:89-106`）：写在 `settings.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "match": ".*write_file.*|.*edit_file.*",
        "command": "prettier --check $FILE",
        "description": "format check before write",
        "timeout": 5000,
        "cwd": "/path/to/project"
      }
    ]
  }
}
```

`match` 是 anchored regex（注释直说 `"file" won't match "read_file" — use ".*file"`；`hook.go:212-225`）。

**Exit code 语义**（`hook.go:272-288` `decideOutcome`）：
- `0` = pass
- `2` = block（只对 gating event `PreToolUse` / `UserPromptSubmit` 生效）
- 其他非零 / timeout = warn

**Per-event 默认 timeout**（`hook.go:70-77`）：
- `PreToolUse` / `UserPromptSubmit` = 5s
- 其他 = 30s

**Payload 字段**（`hook.go:228-240`）：`event`/`cwd`/`toolName`/`toolArgs`/`toolResult`/`prompt`/`lastAssistantText`/`turn`/`message`/`trigger`/`reasoning`——按 hook 事件不同只填相关字段。

**Trust model**（`/tmp/reasonix/internal/hook/trust.go`）：
- Global hooks（`~/.reasonix/settings.json`）永远跑（用户自己的）
- Project hooks（`<root>/.reasonix/settings.json`）**必须先 trust**——`hook.IsTrusted(cwd, "")` 查 `~/.reasonix/trust.json` 的 `projects[absRoot] = true`
- `Trust(projectRoot, homeDir)` 是幂等 set
- 关键设计：**trust flag 存在 user-global 状态而不是 project 文件里**（`trust.go:9-14` 注释：an attacker controls the latter）

**输出捕获**（`hook.go:309-312` + `cappedBuffer`）：每 stream 上限 `outputCapBytes = 256 * 1024`（`hook.go:311`），溢出标记 `Truncated=true` 但 child 仍报"全写成功"避免 short-write error。

**Spawner 可注入**（`hook.go:307-316`）：`Spawner func(ctx, in) SpawnResult`——生产用 `DefaultSpawner`（`hook.go:373-412`），测试可换 mock。

---

### 3.4 桌面端架构（`desktop/`）

> **重要**：是 **Wails v2.12.0 + CGO + WebKit/WebView2**，不是 Tauri。

**模块嵌套**（`/tmp/reasonix/desktop/go.mod:1-9`）：

```go
module reasonix/desktop
// The desktop shell is a nested module so its CGO/WebKit build never touches the
// CLI's CGO_ENABLED=0 single-static-binary guarantee. The replace lets it import
// the same reasonix/internal/* kernel (the import path stays under reasonix/, so
// the internal rule still permits it).
require reasonix v0.0.0
require github.com/wailsapp/wails/v2 v2.12.0
```

**数据流**（`/tmp/reasonix/desktop/README.md:7-24` ASCII 图）：

```
webview (React + TS, Vite)
  bridge.ts ──calls──▶ window.go.main.App.{Submit,Cancel,…}
  bridge.ts ◀─events── window.runtime.EventsOn("agent:event")

desktop/app.go   App (bound)  +  eventSink (event.Sink)
desktop/main.go  Wails options, window, embed frontend/dist
       commands │                            │ typed event stream
internal/boot.Build → internal/control.Controller (kernel)
(同 CLI 的装配：providers, tools, gate, …)
```

**App 绑定**（`/tmp/reasonix/desktop/app.go:46-68`）：`App` 结构暴露方法给前端，事件走单一 channel `"agent:event"`（`app.go:39`），payload 里的 `kind` 字段区分事件类型——和 `internal/serve` 的 SSE 协议是同一份 `event.Event` 抽象的不同 wire 编码。

**Async boot**（`app.go:86-95`）：webview 进程起来后立刻让前端能加载；`boot.Build()` 跑在后台 goroutine；前端轮询 `Meta().Ready` 看到 true 才把按钮 enable。这样 webview 启动不会被 Go 端 init 阻塞。

**Editor seam**（`desktop/README.md:124-150`）：

- `components/CodeViewer.tsx` 默认实现是 `<pre>`（`editors/PlainCode.tsx`），可换成 Monaco / CodeMirror
- `components/DiffView.tsx` 默认 LCS line diff（`editors/PlainDiff.tsx`），可换 Monaco DiffEditor / CodeMirror Merge
- 这俩 seam 都有"stable prop contracts + lazy boundary"，装一个 Monaco 不用改任何 consumer

**自动更新**（`desktop/README.md:74-95`）：
- 用 `desktop-v<semver>` tag namespace（CLI 用 `v*`）
- minisign 签名 + `latest.json` manifest，R2 主源，GitHub 兜底
- Linux/Windows：in-place update + NSIS（无 admin 权限）
- macOS：未签名/notarized，banner 链下载页手动更（注释说"Developer ID / Authenticode certificates are added"后切签名路径）

**多平台适配**（`desktop/README.md:152-174`）：
- WebKitGTK 上 `WebviewGpuPolicy: OnDemand` 避免 blank/flicker；`WEBKIT_DISABLE_COMPOSITING_MODE=1` 兜底；CSS 故意不用 `backdrop-filter`（在 GTK 上慢且不一致）
- WebView2 用 `Theme: SystemDefault` 跟 OS 主题
- macOS WebKit：inset title bar + drag region 留 traffic light 位

---

## 4. 踩过的坑（2025-2026 真实 issues）

> 来源：调研拉了 issue 列表 top 20 + closed 中几个高优先级 bug + GitHub 上的 HN/YouTube/Reddit 公开反馈。

### 4.1 工程层面

| Issue | 现象 | 真实根因（从 issue 标题+issue body + 代码定位） |
|---|---|---|
| **#2778** OPEN high | MEMORY.md 索引加载截断：第一条记忆静默丢失（priority: high 失效） | 索引 load 逻辑截断了首行；参考 `internal/memory/store.go:81-90` `Index()` 直接 `os.ReadFile + TrimSpace`，没有 head-tail 截断；可能上层调用方在拼接时截了 |
| **#2750** OPEN | HTTP SSE 前端会话恢复/压缩持久化/连接状态异常（v2） | session persistence + 压缩 + SSE 重连三件套的边界 case（`internal/serve/serve.go` 长） |
| **#2748** OPEN | macOS cmd+m 无法最小化窗口 | Wails + macOS WebKit 焦点/最小化交互的已知坑（桌面 v1 bug，v2 待修） |
| **#2730** CLOSED | setup wizard duplicate key prompt, /models not used for built-ins, custom/anthropic magic names collide | 已修 |
| **#2716** CLOSED | tmux 跑 TUI 时无法复制会话文本 | 已修（终端粘贴路径的 bracketed paste 折叠） |
| **#2687** CLOSED | AGENTS.md symlinks to CLAUDE.md 时 memory docs 重复加载 | 已修——symlink resolve 去重 |
| **#2685** OPEN | 切换会话会中断思考 | session 切换时 in-flight reasoning stream 没收尾 |
| **#2735** OPEN | 标题空的 bug（v2） | 提交时缺描述信息，无更详细 body 可查 |

### 4.2 设计层 / 经济性

| 来源 | 反馈 |
|---|---|
| HN 评论 (`news.ycombinator.com/item?id=48256953` embedding-shape, 7 天前) | "I'm not sure you need a 'DeepSeek native coding agent' to take advantage of DeepSeek's cache, … I wrote a tiny little bridge so I could use DeepSeek V4 Pro via Codex, and seems most of everything I did was basically cached as far as I can tell: (2026-05-23 Input (Cache hit): 39,123,200 tokens, Input (Cache miss) 1,692,286)"——挑战 "Reasonix 必要性"，但也证明 **prefix cache 在任何 prompt-shape 稳定 harness 上都能拿到**，不一定要 Reasonix 的全套设计 |
| Verdent AI 评述 | "Reasonix talks to `api.deepseek.com` directly — its loop is built for DeepSeek's specific behaviors, including the prefix cache that makes repeated context cheap."——确认 DeepSeek-only 是设计选择而非限制 |
| YouTube "The Engineering Why"（2026-05-26） | $61 → $12 真实账单 5× 节省，435M tokens 99.82% 命中；明确提到 "Reasonix's tool-call repair pipeline fixes DeepSeek's known failure modes"——但 4 遍 repair 在代码里**不成立**（见 3.2 节） |
| AI Weekly / WinBuzzer / CosmicJS / PyShine / TrendingBots 5 月集中报道 | 一致认可 prefix-cache 工程学价值 |

### 4.3 实战细节

| 现象 | 工程教训 |
|---|---|
| DeepSeek reasoning 模型的 reasoning_content **重传会被计费** | `realcache_test.go` 是这条 regression 的活测试——mid-2026 仍有项目踩这个 |
| DeepSeek 直连拒绝 missing `content` 字段 | `TestBuildRequestAlwaysSerializesContent` 守这条 |
| 某些 OpenAI-compatible gateway 按 index 流式发（无 id） | `TestRunMultiToolRoundEmptyIDsSurvivePairing` + 合成 `call_<idx>` 守这条 |
| `prompt_cache_{hit,miss}_tokens` 在 DeepSeek 是 top-level，在 OpenAI/MiMo 是 nested under `prompt_tokens_details` | `normaliseUsage`（`openai.go:304-330`）做统一归一化 |
| 同一 turn 多个 read-only 工具可并发，写工具必须串行 | `partitionToolCalls` + `runParallel`（`agent.go:629-682`）扇出到 8 并发（`maxParallel = 8`） |
| 模型在 truncated-args 上 death-loop（`a.stormCount`） | `applyStormBreaker`（`agent.go:690-729`）在连续 3 次同 (tool, error) 时改写 result 强制让模型换打法（`stormBreakThreshold = 3`，注释里"the dominant case being a tool call whose arguments are truncated at the output-token ceiling"） |
| `context_window` 设小了，compaction 救不回来 | `compactStuck` latch（`compact.go:88-93`）避免 auto-compact 无限打转 |

---

## 5. 对 deepwhale 的具体借鉴清单

按"P0（必须抄）/ P1（强烈建议抄）/ P2（看情况抄）"分级，每条都标注**真实代码出处**和**deepwhale 该往哪里放**。

### P0 — 必须抄

| 借鉴点 | Reasonix 真实出处 | deepwhale 落地建议 |
|---|---|---|
| **Cache-stable system prompt 一次组装** | `boot.go:120-148` + `REASONIX.md:9-11` "Cache-first: the system-prompt prefix (base prompt + tools + memory) must stay byte-stable across turns" | 写一个 `composeSystemPrompt()` 函数，每个项目只跑一次，结果按 session ID 缓存；mid-session 改 memory 走 turn-tail 不动 prefix |
| **`content: ""` 永远序列化** | `openai.go:354-368` + `TestBuildRequestAlwaysSerializesContent` | 在 deepwhale 的 OpenAI-compatible wire 层加 `Content string `json:"content"``（不带 omitempty）；加同样 regression test |
| **Reasoning content 不重传** | `openai.go:131-137` + `realcache_test.go:170-175` | deepwhale 走 DeepSeek / 类似 reasoning 模型时，对 `chatMessage` 不序列化 `reasoning_content` 字段；session 内仍保留它（用于显示/归档） |
| **`SanitizeToolPairing`（4 种 pairing）** | `provider.go:78-150` | 抄整个函数；不要在 deepwhale 里"做 4 遍"——误解。4 种是 cases 不是一个函数跑 4 次 |
| **Compaction = 唯一 cache-reset point** | `compact.go:16-20` + `SPEC.md:194-197` | 在 deepwhale 里也设"任何改 system prompt 的地方都该 review：是不是要改 compaction 策略"。Tail 边界按 token budget 而不是 message count（`tailStart` `compact.go:271-289`） |
| **StormBreaker（避免 death loop）** | `agent.go:690-729` `applyStormBreaker` | 抄 `stormBreakThreshold = 3` + (tool, error) 签名（不是 args 签名！）的 key——"a stuck model reworks the arguments cosmetically while failing identically" 这条是实战观察 |
| **Schema canonicalize** | `schema_canonicalize.go:10-67` | deepwhale 接任何 OpenAI-compatible 时，build tool definitions 前跑 `CanonicalizeSchema`，避免 map 序列化 key 顺序变 → cache hash 变 |

### P1 — 强烈建议抄

| 借鉴点 | Reasonix 真实出处 | deepwhale 落地建议 |
|---|---|---|
| **Skills 4 约定目录 + Anthropic Skills 兼容** | `skill.go:154-156` + `config.ConventionDirs` `.reasonix/.agents/.agent/.claude` | deepwhale 也用这 4 个根——用户从其他 agent 迁 skill 直接能用 |
| **Skills 索引只放 names+descriptions，body 按需** | `index.go:10` `IndexMaxChars = 4000` + `tools.go:60-88` | 设 `MAX_SKILL_INDEX_CHARS` 硬上限；body 走 `run_skill` 工具按需 |
| **Subagent skill（runAs: subagent）+ 4 个内建包装** | `tools.go:90+` + `boot.go:378-380` | explore / research / review / security_review 这 4 个内建 subagent skill 强烈建议抄——"context-heavy work where you only need the conclusion" |
| **Memory `Empty()` 检测 + base 不动** | `memory.go:79-82` + `memory.go:154-163` `Compose` | 没 memory 时 `Compose` 直接返回 base（byte-for-byte 不动） |
| **Auto-memory `MEMORY.md` 索引 + frontmatter 文件** | `store.go:20-22` + `reindex` `store.go:196-200` | 一条 memory 一个 md 文件 + 一个总索引；用户能 hand-edit；用 `indexLineRe`（`store.go:161`）精准修改一行不动其他 |
| **Hook trust model（user-global flag 不放 project 文件）** | `trust.go:9-14` | deepwhale 接用户 git 仓库的 hooks 必须有这个；trust flag 在 `~/.config/<tool>/trust.json` 而非 `.config/hooks.json` |
| **Hook payload 走 JSON on stdin，exit 2 = block，exit 0 = pass，其他 = warn** | `hook.go:31-54` events + `decideOutcome` `hook.go:272-288` | 标准语义，可以直接照抄 |
| **Wails "嵌套 module + replace" 模式** | `desktop/go.mod:1-9` + `desktop/README.md:27-32` | 如果 deepwhale 真的想做桌面端而非 CLI，参考这条把 CGO 构建和主 kernel 隔离（**注意 deepwhale 题目里说的是 Tauri，但 Reasonix 实际是 Wails**——见开头的认知纠偏） |
| **单 transport-agnostic controller** | `REASONIX.md:9-11` + `app.go:46-68` | deepwhale 无论是 TUI / web / 桌面，先在 `controller` 包里把"业务逻辑"全部放好，前端只做 IO |
| **Editor seam（lazy boundary + 两种默认实现）** | `desktop/README.md:124-150` | CodeViewer / DiffView 抽象 seam 模式：默认 `<pre>`，可换 Monaco/CodeMirror，consumer 不动 |

### P2 — 看情况抄

| 借鉴点 | Reasonix 真实出处 | 评估 |
|---|---|---|
| **CodeGraph（tree-sitter 符号/调用图替代 embedding 搜索）** | `CHANGELOG.md:38-40` + `boot.go:202-230` | 如果 deepwhale 不打算做长上下文代码检索，跳过；如果做，Reasonix 这条"symbol graph tools land in the system prompt, so the agent must see them on first turn"是合理的 eager 选择 |
| **HTTP/SSE serve frontend** | `internal/serve/serve.go` | 如果 deepwhale 有 web 客户端需求再上；目前是 TUI + 桌面双前端够用 |
| **Plan mode 切换不改 cache 段** | `agent.go:148-152` `planMode atomic.Bool` 注释"cache-friendly bits — system prompt, tools schema, message history — are left untouched" | 如果 deepwhale 也有 "read-only plan vs execute" 双模式，抄这条 |
| **证据账本（`evidence.Ledger`）** | `agent.go:175-181` + `finalReadinessFailure` `agent.go:434-465` | "完成一个 write 工具后必须看到完整 evidence 才放行 final answer"——很严的契约。如果 deepwhale 走 strict 模式建议抄；走宽松模式可忽略 |
| **PreCompact hook stdout 注入 summary guidance** | `hook.go:51-54` + `compact.go:114-122` | 让用户能用 hook 控制 compaction 怎么 summariz——高级功能，按 deepwhale 用户群规模决定 |
| **Minisign 签名 + R2 镜像更新** | `desktop/README.md:74-95` | 仅 desktop 需要；deepwhale 如果做桌面端再考虑 |
| **WebKitGTK `WebviewGpuPolicy: OnDemand` + 避免 `backdrop-filter`** | `desktop/README.md:158-160` | Wails 专属；Tauri/WebView2 路径不同 |
| **`makeCross` 一键全平台** | `Makefile` + `SPEC.md:13` "cross-compile with one command" | deepwhale 如果也坚持 single static binary，抄 |

### 不要抄

| 反面教训 | Reasonix 自己踩过的坑 | deepwhale 怎么避 |
|---|---|---|
| **"DeepSeek-only" 立场** | 整个 1.0 哲学是 DeepSeek-only（README 头几段 + "cache-first" 设计都强依赖 DeepSeek 的 64-token cache block granularity） | deepwhale 想做多 provider 的话，要重新设计；不能照搬 |
| **没有 release 的 1.0.0** | `CHANGELOG.md:7` "## [1.0.0] — unreleased" + README "1.0.0 isn't on npm yet — build from source meanwhile"——6 周过去仍未正式 release | deepwhale 起步时把 release 节奏拉到 Reasonix 之前 |
| **`memory.indexLinesExcept` 截断首行 bug（#2778）** | 2026-06-02 报 open，未修 | 抄 memory 索引时重点测试"首行不被吞" |
| **macOS 桌面 cmd+m 失灵（#2748）** | Wails 1.x bug | 如果 deepwhale 走 Tauri 路线，可绕开（但 Tauri 自己也有 macOS quirks） |
| **HTTP/SSE 会话恢复 + 压缩 + 连接状态异常（#2750）** | 服务端长连接 + session 持久化的边界 case | deepwhale 做 web frontend 时把 session 状态、压缩、SSE 重连三件套的 boundary 当成 first-class concern |
| **"4 遍 tool-call repair"** | 这是外部误解——实际是 1 个函数 4 种 pairing cases | 别在 deepwhale 里写"4 遍"——把 `SanitizeToolPairing` 的 4 种情况理解清楚即可 |
| **TypeScript v1 → Go v2 断崖式重写** | 整个 v1 TS 投入归零 | deepwhale 选型阶段想清楚：是要从 TS 起家（更易上手但后期重写代价大），还是直接 Go（单二进制 + 强 prefix-cache 保证，但入门门槛高） |

---

## 6. 一句话总结

> Reasonix 是一个**用 Go 重写、围绕 DeepSeek prefix-cache 不变量设计**的 AI coding agent——`system prompt 一次组装永不动` + `reasoning 不重传` + `wire-level 字节稳定` + `compaction 是唯一 cache-reset 点` 是它拿到 99% 命中率的 4 个具体机制；`SanitizeToolPairing` 是它处理 DeepSeek 已知 tool-call 失败的 1 个函数（不是 4 遍）；Skills/Memory/Hooks 三件套是它作为"AI 平台"的扩展层；Wails + React 是它的桌面端（不是 Tauri）。
> **deepwhale 借鉴的核心不是"用 Ink/Tauri"**，而是"把 prefix-cache 不变量当成架构契约"——具体到 Node.js 栈就是把 Reasonix 的 `boot.go` / `compact.go` / `provider.go:78-150` / `schema_canonicalize.go` / `storm breaker` 几条核心逻辑用 TypeScript 重写一版，然后围绕它构建 UI。
