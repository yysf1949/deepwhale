# D-25 → D-28 tui parity 4-sprint master plan — 跟 Hermes ui-tui 65% 对齐

**Sprint Owner**: 周礼攀 / Hermes agent
**Created**: 2026-06-06 (Sat)
**Sprint 总长**: 46h / 22 commit / 4 sprint
**起点**: D-24.4 ship 1.0.9 (commit `4b0aba0`, 2026-06-06 19:13)
**终点**: `@deepwhale/tui-ink` 跟 Hermes ui-tui 65% 对齐, 装出来体验"生产级 TUI"

## 1. 上下文 (Context)

### 1.1 当前 tui-ink 真实能力 (D-24.4 拍板)

`@deepwhale/tui-ink` v1.0.9 已 ship, 装路径自包含 (bundle 1.74MB), 5 子组件 + 3 hooks + 3 主题 + 3 类染色 + history 持久化 + confirm 流程 + session 持久化 + TTY detection。**满足 v1.0 拍板 100%**。

### 1.2 vs Hermes ui-tui 真实差距 (深读 70+ 文件后拍死)

| # | 维度 | tui-ink 现状 | Hermes 实际 | 差距 |
|---|---|---|---|---|
| 1 | slash command 系统 | 字符串 if-else, 3 命令 | `SLASH_COMMANDS` registry + 5 类 + 30+ 命令 | **0% → 100%** |
| 2 | composer 状态机 | 1 useState + ink-text-input | `useComposerState` 5 子能力 | 20% → 100% |
| 3 | turn 状态机 | 1 hook 129 行 | `turnController.ts` 12,146 行 | 10% → 100% |
| 4 | submission / input handlers | Prompt.tsx 105 行 | `useSubmission` 303 + `useInputHandlers` 331 + 30+ 快捷键 | 15% → 100% |
| 5 | markdown 渲染 | 无 | `markdown.tsx` 648 行 (fence/heading/table/footnote) | **0% → 100%** |
| 6 | thinking/reasoning 渲染 | 无 | `thinking.tsx` 995 行 (折叠 + tree + subagent) | **0% → 100%** |
| 7 | completion / 补全 | 无 | `useCompletion.ts` slash + path | **0% → 100%** |
| 8 | virtual history (虚拟滚动) | 无 | `useVirtualHistory.ts` 227 行 | **0% → 100%** |
| 9 | queue / 多消息队列 | 无 | `useQueue.ts` enqueue/dequeue | **0% → 100%** |
| 10 | memory 监控 / OOM 防护 | 无 | `memory.ts` 187 + `memoryMonitor.ts` 55 | **0% → 100%** |
| 11 | lib 工具集 | **0 个** | 15 个 (circularBuffer/clipboard/osc52/syntax/text/...) | **0% → 100%** |

**综合差距**: 11 维度加权平均 ~10% (D-24.4 ship 状态)。

### 1.3 触发依据

- 用户 2026-06-06 22:24 拍板: "D 路线, 4 sprint 全跑, 22 commit, 目标 65% Hermes 对齐度"
- D-24.4 ship 后留 9 件事 (skill `deepwhale-tui-evolution` §8 实战撞出):
  1. F1 (root build 串 tui-ink) — 实际**已 D-24.3 postbuild 修**
  2. F2 (useRunToolLoop 调错 3 参签名) — **未修, P0.5**
  3. F3 (Windows verify import-check/bin-check shell 安全性) — **未修, P1**
  4. F4 (tui-ink history DEEPWHALE_HOME override) — **未修, P1**
  5. F5 (looksLikeSpawnError 短匹配) — **未修, P2**
  6. F6 (tui-ink history 跟 legacy 不兼容) — **未修, P2**
  7. tui-ink npm 未独立发布 — **未修, P1**
  8. sub-package `pnpm test` 找不到文件 — **未修, P2**
  9. release/v1.0 stale 6 commit — **未修, P1**

## 2. 4 sprint 拍板 (Sprint breakdown)

### 2.1 总览

| Sprint | 主题 | 耗时 | Commit | 优先级目标 | 跟 Hermes 对齐度 |
|---|---|---|---|---|---|
| **D-25** | release chain stabilize + fix F2/F3/F4/F5/F6 | 12h | 8 | ship blocker 全清 + tui-ink 独立发布 | 10% → 12% |
| **D-26** | slash registry + lib 工具奠基 + useSubmission/useInputHandlers | 12h | 5 | "/help" 9 命令 + 5 lib 工具 + App.tsx 减重 | 12% → 30% |
| **D-27** | markdown + thinking + MEDIA tag | 10h | 4 | LLM 长答案可读 + reasoning 折叠 | 30% → 45% |
| **D-28** | composer 状态机 + completion + virtual history + queue | 12h | 5 | input 体验对齐 + 1000 条 transcript 不卡 | 45% → 65% |

### 2.2 版本节奏 (跟 D-21.1 4-package bump 一致)

| Sprint | tui-ink | core / edit-engine / llm / coding-agent | 触发 |
|---|---|---|---|
| D-25 | 1.0.9 → **1.0.10** | 1.0.9 → **1.0.10** | F1-F6 + publish tui-ink |
| D-26 | 1.0.10 → **1.0.11** | 1.0.10 → **1.0.11** | slash + lib |
| D-27 | 1.0.11 → **1.0.12** | 1.0.11 → **1.0.12** | markdown + thinking |
| D-28 | 1.0.12 → **1.0.13** | 1.0.12 → **1.0.13** | composer + virtual |

## 3. 4 sprint 详细拍板

### 3.1 D-25 release chain stabilize + fix F2/F3/F4/F5/F6

**目标**: 修 6 finding, publish `@deepwhale/tui-ink`, release chain 完整可重现
**耗时**: 12h / 8 commit
**详细 plan**: `.hermes/plans/2026-06-06-d25-release-chain-stabilize.md` (141 行, 已写完)
**风险**: F2 useRunToolLoop 修错导致 turn loop 崩 → 集成测必覆盖

#### 8 commit cluster

| # | 等级 | commit | 文件 | 验收 |
|---|---|---|---|---|
| A1 | P1 | F4 — tui-ink `tuiHistoryPath` 支持 `DEEPWHALE_HOME` override + Windows USERPROFILE | `tui-ink/src/history/index.ts` | `pnpm -F @deepwhale/tui-ink type-check && test` 全过 + 新测 |
| A2 | P2 | F5 — `looksLikeSpawnError` 收窄, 删短匹配 `/No such file/i` | `coding-agent/src/verify/verify-runner.ts:341-358` | regression test 跑通 |
| A3 | P1 | F3 — Windows installed `import-check`/`bin-check` 改 `shell:false` 单 JS | `coding-agent/src/verify/verify-runner.ts:197-226` | 用户 Windows 端 `--verify` 4/4 pass |
| B1 | P1 | F1 — root `package.json` build 串 `pnpm -F @deepwhale/tui-ink build` + `tsconfig.json` references | `package.json:13` + `tsconfig.json` | 全新 `pnpm install --frozen-lockfile && pnpm build` → bundle 存在 |
| B2 | **P0.5** | F2 — `useRunToolLoop.ts:65` 修 3 参签名, client/registry 从 React context 注入 | `tui-ink/src/hooks/useRunToolLoop.ts` + `app.tsx` | `pnpm -F @deepwhale/tui-ink type-check` 0 错 + 集成测 |
| B3 | P0.5 | tui-ink 集成测 + 静态签名 smoke 测 (F7 P0.5) | `tui-ink/test/integration/tool-loop.test.ts` + `test/smoke/run-tool-loop-signature.test.ts` | 1 集成测 + 1 静态签名 smoke 测 |
| B4 | P2 | F6 — 抽 `tuiHistoryPath/Load/Append/Truncate` 到 coding-agent util, tui-ink 复用 | `coding-agent/src/util/tui-history.ts` + `tui-ink/src/history/index.ts` | 3 格式(legacy / Ink raw / 新)互读不破坏 |
| B5 | P1 | `@deepwhale/tui-ink` 独立 publish + `release/v1.0` fast-forward + 远端 ls-remote 验证 | `npm publish -F @deepwhale/tui-ink` + `git push origin release/v1.0:release/v1.0` | npm view @deepwhale/tui-ink = 1.0.10; ls-remote release/v1.0 = HEAD |

#### 拍板红线

- 0 删已有测试 (tui-smoke 979 行, tui-ink 18 test, 业务 0 重写)
- 0 改 public API
- 每个 commit 后立即 `git push` + 飞书 DM 推送通知 (commit hash + diff stat + 请 review)
- 每个 commit 必带可验证的 dist / 测试 / 命令输出证据
- 复盘 → `.hermes/plans/d19/d25-retro.md`

### 3.2 D-26 slash registry + lib 工具奠基

**目标**: 拆出 5 lib 工具 + 9 slash 命令 + useSubmission/useInputHandlers hook 拍板
**耗时**: 12h / 5 commit
**风险**: slash `/verify` 跟 `bin/deepwhale.js --verify` 冲突 → 拍板: slash 调 `runVerify()` 函数不 spawn

#### 5 commit cluster

| # | 等级 | commit | 文件 | 验收 |
|---|---|---|---|---|
| C1 | P0 | 抽 `lib/` 工具奠基 (5 个: text / circularBuffer / messages / platform / gracefulExit) | `tui-ink/src/lib/{text,circularBuffer,messages,platform,gracefulExit}.ts` | 跟 Hermes 对照 80% 行为一致, 复用 0 改业务 |
| C2 | P0 | slash command 中央 registry (类型 + registry + 5 类) | `tui-ink/src/commands/{registry,types,index}.ts` | 跟 Hermes `SLASH_COMMANDS` 同形态 |
| C3 | P0 | 5 类核心命令 ship (9 命令) | `tui-ink/src/commands/{core,session,setup,debug,ops}.ts` | 测: 9 命令全在 `<Prompt/>` 输入触发 |
| C4 | P1 | `useSubmission` + `useInputHandlers` 拍板 | `tui-ink/src/hooks/useSubmission.ts` + `useInputHandlers.ts` | 跟 Hermes 同形态, App.tsx 减重 50+ 行 |
| C5 | P0 | App 改造 + 集成测 | `tui-ink/src/app.tsx` 接入 registry + handlers + 新测 | `pnpm test` 新增 10+ 测, App LOC -50+ |

#### 9 命令列表 (D-26 拍板)

| 命令 | 类别 | 行为 | 跟 deepwhale 已有功能对应 |
|---|---|---|---|
| `/help` | core | 印 9 命令列表 (code-block 格式, 跟 REPL `--help` 风格一致) | 新加 |
| `/exit` / `q` / `quit` | core | 退出 TUI, writer.close 走 finish 路径 | D-24.3 已有 |
| `/clear` | core | 清空 transcript, 不关 session, 不写 session event | 新加 |
| `/verify` | core | 调 `runVerify()` 印到 transcript, 不 spawn bin | 包装 D-20.1 |
| `/status` | core | 印 model + session path + usage 状态 | 新加 |
| `/model <name>` | session | 切 model (走 env, 不接 gateway) | 跟 `args.model` 对接 |
| `/resume` | session | 列 session 路径让用户选 (D-28 升级为 picker) | 占位 |
| `/personality <name>` | session | 切 system prompt personality (D-27 接 markdown 渲染) | 占位 |
| `/heapdump` / `/mem` | debug | 调 V8 heap snapshot + 印 rss, 走 Hermes `memory.ts` 模式 (D-25 抽 lib 时) | D-26 抽 lib 时同步 ship |

#### 拍板红线

- 0 改 `runToolLoop` / `createReplConfirm` / `SessionWriter` / `formatUsageStatus` (跟 D-20.3 P0-B 一致)
- 0 改 slash 之外的 UI 组件 (5 子组件保持原样)
- `/verify` 调 `runVerify()` 函数, **不** spawn `bin/deepwhale.js --verify` (避免 child process 复杂)
- 复盘 → `.hermes/plans/d19/d26-retro.md`

### 3.3 D-27 markdown 引擎 + thinking 折叠

**目标**: LLM 长答案真渲染; `reasoning_content` 专门 UI
**耗时**: 10h / 4 commit
**风险**: markdown 引擎跟 raw text 兼容 → 拍板: 默认 raw, `<Markdown/>` opt-in

#### 4 commit cluster

| # | 等级 | commit | 文件 | 验收 |
|---|---|---|---|---|
| D1 | P0 | markdown 引擎基础 (fence/heading/list/table/inline code/bold/strikethrough) | `tui-ink/src/markdown/render.ts` (Hermes markdown.tsx 简化版 ~200 行) | 测覆盖 5 类 markdown, 跟 Hermes 行为 80% 对齐 |
| D2 | P0 | `<Markdown/>` 组件接入 `<Transcript/>` | `tui-ink/src/components/Markdown.tsx` | LLM 返回 ```js ... ``` 真染色 |
| D3 | P0 | thinking 折叠 (reasoning_content) | `tui-ink/src/components/Thinking.tsx` + `lib/reasoning.ts` (splitReasoning 抄 Hermes) | DeepSeek V4 `reasoning_content` 真渲染成可折叠 |
| D4 | P1 | MEDIA/audio tag 渲染 | `tui-ink/src/components/MediaLine.tsx` | `MEDIA:/path/to/image.png` 真显示 image; `[[audio_as_voice]]` 触发 TTS (走 mmx-cli) |

#### markdown 引擎简化拍板 (D-27 拍板)

跟 Hermes markdown.tsx 648 行对比, D-27 只做 5 类基础:
- **fence** (```lang ... ```) — 简化版, lang 染色 + 内层 code 走 syntax.ts (D-26 lib 抽时存在)
- **heading** (# H1 ~ ###### H6) — 字号缩小 + 主题色
- **list** (- item / 1. item) — 缩进 + bullet
- **table** (markdown table) — 简化, 不做 alignment, 走列对齐
- **inline** (`code` / **bold** / *italic* / ~~strike~~) — 5 种 inline

不做 (defer D-29+): footnote / autolink / MEDIA tag (D4 单独做) / 完整 GFM

#### 拍板红线

- 0 改 tui-ink 已 ship 的 5 子组件 React 树
- markdown 跟 raw text **并存**: 默认 raw, `<Markdown/>` 显式 opt-in
- `<Markdown/>` 走 `<Static items={...}>` (跟 Transcript 同形态) 防 re-render
- 复盘 → `.hermes/plans/d19/d27-retro.md`

### 3.4 D-28 composer 状态机 + completion + virtual history + queue

**目标**: input 体验对齐 Hermes; 长 transcript 不卡
**耗时**: 12h / 5 commit
**风险**: virtual history 跟 ink 6 ScrollBox 不兼容 → 拍板: rebuild 走独立 virtual list, 不接管 ScrollBox

#### 5 commit cluster

| # | 等级 | commit | 文件 | 验收 |
|---|---|---|---|---|
| E1 | P0 | composer 状态机抽 hook (5 子能力: input buf + paste + history + queue + editor open) | `tui-ink/src/hooks/useComposerState.ts` (Hermes 同形态) | input buf + paste 折 snip + history 翻 + queue + editor open 5 子能力 |
| E2 | P0 | `<TextInput/>` 升级 (paste 折 snip + 大 paste 走 `[paste:N label]`) | `tui-ink/src/components/Prompt.tsx` (替换 ink-text-input) | 1MB paste 不卡; 带 label token |
| E3 | P0 | `useCompletion` (slash + path) | `tui-ink/src/hooks/useCompletion.ts` | `/h` → `/help` 补全; `./sr` → 路径补全 |
| E4 | P0 | `useQueue` (等 turn 跑完 enqueue 下一条) | `tui-ink/src/hooks/useQueue.ts` | turn 跑中输入 1 条 → 完自动跑 |
| E5 | P1 | `useVirtualHistory` (虚拟滚动) | `tui-ink/src/hooks/useVirtualHistory.ts` | 1000 条 transcript 不卡, frame rate > 30fps |

#### useComposerState 5 子能力拍板 (D-28)

跟 Hermes useComposerState 1:1 对齐:

```ts
export interface UseComposerStateOptions {
  gw: GatewayClient  // D-29+ 接入, D-28 走 stub
  onClipboardPaste: (hotkey: boolean) => Promise<void>
  submitRef: React.MutableRefObject<((text: string) => void) | null>
}

export interface UseComposerStateResult {
  input: string; setInput: (s: string) => void
  inputBuf: string[]; setInputBuf: (b: string[]) => void
  pasteSnips: PasteSnippet[]; setPasteSnips: (s: PasteSnippet[]) => void
  // sub-hook 透传
  queue: UseQueueResult  // useQueue 集成
  history: UseInputHistoryResult  // useInputHistory 集成
  completion: UseCompletionResult  // useCompletion 集成
  clearIn: () => void
  handleTextPaste: (ev: PasteEvent) => { cursor: number; value: string } | null
  openEditor: () => Promise<string | null>  // $EDITOR 走 external editor
}
```

D-28 不接 Python gateway (`gw: GatewayClient` 走 stub, 用 `@deepwhale/coding-agent` 替代), D-29+ 拍 gateway bridge。

#### 拍板红线

- virtual history 走独立 virtual list, **不** 接管 ink 6 ScrollBox (跟 Hermes 拍板一致, 避免 ScrollBox API 限制)
- completion debounce 200ms (跟 Hermes 拍板), 用户打字不停就不发请求
- queue enqueue 限制 10 条 (跟 Hermes 拍板), 超过截断最老
- 复盘 → `.hermes/plans/d19/d28-retro.md`

## 4. 4 sprint 时间线 + ship ritual

### 4.1 时间线

```
2026-06-06 (今日) D-24.4 ship 1.0.9 ✓
   ↓
D-25 (12h, 8 commit) — 修 6 finding + publish tui-ink
   ↓ (D-25 ship 后, 推 1.0.10)
D-26 (12h, 5 commit) — slash + lib 奠基
   ↓ (推 1.0.11)
D-27 (10h, 4 commit) — markdown + thinking
   ↓ (推 1.0.12)
D-28 (12h, 5 commit) — composer + virtual history
   ↓ (推 1.0.13)
   ↓
2026-06-08 (预计) 4 sprint 全完, 出最终复盘
```

**累计**: ~46h / 22 commit / 4 sprint

### 4.2 每个 sprint 的 ship ritual (D-25 实战已沉淀, 后续沿用)

```bash
# 1. typecheck (必跑子包, 跟 D-24.4 教训)
pnpm -C packages/coding-agent exec tsc -b
pnpm -C packages/tui-ink exec tsc -b

# 2. lint
pnpm lint

# 3. test (必跑根 + 子包)
pnpm test  # 根目录, vitest config include 命中
pnpm -F @deepwhale/tui-ink exec vitest run  # 子包独立验

# 4. 装出 + 跑真验
rm -rf /tmp/npm-test-XX && mkdir -p /tmp/npm-test-XX
(cd /tmp/npm-test-XX && npm install --prefix . /tmp/dw*/deepwhale-*.tgz)
/tmp/npm-test-XX/node_modules/.bin/deepwhale --version
script -qfc "node packages/coding-agent/bin/deepwhale.js tui" /tmp/tui-out.log
head -10 /tmp/tui-out.log

# 5. 3 件套 (ship-quality-checks §10j)
git ls-remote origin | grep -E "refs/tags/v1\.0\.X"  # 期望 2 行
npm view @deepwhale/coding-agent version  # 期望 1.0.X
npm view @deepwhale/tui-ink version  # 期望 1.0.X (D-25 后)
```

### 4.3 4 sprint 推送通知协议 (跟 USER.md 拍板)

每次 `git push` 后**立即**在飞书 DM 发推送通知:
- commit hash(es) (短 7 位)
- 简明 diff stat (`+X / -Y / N files`)
- "请 review"

### 4.4 复盘节奏

每个 sprint ship 完出 1 份 retro 文档:
- `.hermes/plans/d19/d25-retro.md` (D-25 ship 后)
- `.hermes/plans/d19/d26-retro.md` (D-26 ship 后)
- `.hermes/plans/d19/d27-retro.md` (D-27 ship 后)
- `.hermes/plans/d19/d28-retro.md` (D-28 ship 后)

每份 retro 拍板:
- 实际 commit 数 / 跟 plan 偏差
- 实际耗时 / 跟 plan 偏差
- 4-bug-type 自检结果 (跟 ship-quality-checks §7a 一致)
- 6 finding 状态变化 (F1-F6)
- 下 1 sprint 的 1-2 个 "实战撞出" 项

## 5. 风险矩阵

| 风险 | 严重度 | 拍板 / 缓解 |
|---|---|---|
| D-25 F2 useRunToolLoop 修错导致 turn loop 崩 | P0 | 集成测必覆盖真 LLM mock client, ship 前必跑 |
| D-26 slash `/verify` 跟 bin `--verify` 冲突 | P1 | 拍板: slash 调 `runVerify()` 函数, 不 spawn bin |
| D-27 markdown 引擎跟 raw text 兼容 | P1 | 拍板: 默认 raw, `<Markdown/>` 显式 opt-in |
| D-28 virtual history 跟 ink 6 ScrollBox 不兼容 | P2 | 拍板: rebuild 走独立 virtual list, 不接管 ScrollBox |
| 4 sprint 跑完用户又提新需求 | P3 | 每个 sprint 独立 ship, 可中断 |
| 装出来跑真 LLM turn 时 hang | P1 | D-25 B2 集成测覆盖, 必装 `DEEPSEEK_API_KEY` (或 mock) 跑真 turn |
| `npm publish -F @deepwhale/tui-ink` 失败 (没 npm 登录) | P1 | D-25 B5 ship 前先验 `npm whoami`, 没登录让用户输入 npm token |

## 6. 红线 (4 sprint 贯穿, 0 改)

| 红线 | 不能动 |
|---|---|
| `runToolLoop` / `staticToolPolicy` / `createReplConfirm` / `SessionWriter` / `formatUsageStatus` | 0 改, 跟 `modes/tui.ts` 1:1 |
| legacy `runTuiMode` | 保留 source-install dev fallback, sprint 1.1+ 计划完全删除 |
| root `package.json` 4 packages 同步 bump | 1.0.9 → 1.0.10 → 1.0.11 → 1.0.12 → 1.0.13 |
| 5 子组件 React 树 (Confirm/Divider/Prompt/StatusBar/Transcript) | 0 删, 可加, 不改名 |
| 3 hooks (useAbortController/useHistory/useRunToolLoop) | 0 删, 可加, 不改名 (新 hook 加新文件) |
| 3 主题 (default/solarized/monochrome) | 0 删, 0 改, 用户拍过 |
| 3 类染色 (tool name/数字/路径) | 0 删, 0 改 |
| History 持久化 (0o600 file + LRU 1000 + `~/.deepwhale/tui-history`) | 0 删, D-25 B4 升级到 coding-agent util |
| Confirm 流程 (`createReplConfirm` D-19 串行化) | 0 改 |
| Session reader/writer | 0 改 |
| TTY 检测 + ANSI-safe 退出 | 0 改 |
| 新装 3rd party 依赖 (Ink 6 / React 19 / nanostores / unicode-animations) | D-24.1 已装, 不再加; D-25 ~ D-28 默认 0 新装; 例外: 4 sprint 拍板中明确"必装" 才加 |

## 7. 验证清单 (4 sprint ship 前必跑)

```bash
# ==== D-25 ship 前 (跟 ship-quality-checks §5a + §10d + §10j 一致) ====

# 1. typecheck
pnpm -C packages/coding-agent exec tsc -b   # 0 错
pnpm -C packages/tui-ink exec tsc -b        # 0 错 (D-25 B2 必跑)

# 2. lint
pnpm lint                                     # 0 警告

# 3. test
pnpm test                                     # 根目录
pnpm -F @deepwhale/tui-ink exec vitest run   # 子包 (D-24.4 教训)

# 4. 装出 + 跑真验
pnpm pack --filter @deepwhale/coding-agent
mkdir -p /tmp/npm-test-d25 && cd /tmp/npm-test-d25
npm install --prefix . /tmp/deepwhale-coding-agent-1.0.10.tgz
node_modules/.bin/deepwhale --version         # 期望 1.0.10
script -qfc "node node_modules/.bin/deepwhale tui" /tmp/tui-d25.log
head -10 /tmp/tui-d25.log                     # 期望 ⌬ deepwhale tui-ink v1.0.10

# 5. 3 件套
git ls-remote origin | grep "refs/tags/v1.0.10"   # 期望 2 行
npm view @deepwhale/coding-agent version           # 期望 1.0.10
npm view @deepwhale/tui-ink version                # 期望 1.0.10 (D-25 B5 后)

# 6. F2 useRunToolLoop 修后真跑 turn (有 LLM key 必跑, 没 key 验 mock)
DEEPSEEK_API_KEY=sk-xxx node node_modules/.bin/deepwhale tui <<< "hello"
# 期望: StatusBar 显示 usage, Transcript 有 user + assistant entry

# 7. release/v1.0 fast-forward 后 ls-remote 验
git ls-remote origin refs/heads/release/v1.0   # 期望 == HEAD sha
```

## 8. 4 sprint 完成后跟 Hermes 对齐度

| 维度 | D-24.4 (现在) | D-25 后 | D-26 后 | D-27 后 | D-28 后 |
|---|---|---|---|---|---|
| 1. slash | 5% | 5% | **70%** | 70% | 70% |
| 2. composer | 20% | 20% | 30% | 30% | **80%** |
| 3. turn | 10% | 10% | 10% | 10% | 10% (D-29+ 拍) |
| 4. submission | 15% | 15% | **60%** | 60% | 80% |
| 5. markdown | 0% | 0% | 0% | **70%** | 70% |
| 6. thinking | 0% | 0% | 0% | **60%** | 60% |
| 7. completion | 0% | 0% | 0% | 0% | **70%** |
| 8. virtual history | 0% | 0% | 0% | 0% | **70%** |
| 9. queue | 0% | 0% | 0% | 0% | **80%** |
| 10. memory | 0% | 0% | 0% | 0% | 0% (D-29+ 拍) |
| 11. lib | 0% | 0% | **40%** | 50% | 60% |
| **综合** | **~10%** | **~12%** | **~30%** | **~45%** | **~65%** |

## 9. 后续 sprint (D-29+, 可选, 不在 4 sprint 范围)

- **D-29 turn state machine 升级** — `turnController.ts` 拍板, 12K LOC 重写, **架构级改造**, 拆多个 sprint
- **D-30 Python gateway bridge** — 接 Hermes `tui_gateway/` JSON-RPC, 让 deepwhale TUI 可选走 Python 后端
- **D-31 memory 监控** — `memory.ts` + `memoryMonitor.ts` 拍 Hermes, 1 sprint
- **D-32 subagent progress** — sub-agent 并发支持, 多 turn 树状 UI
- **D-33 语音输入 / 语音输出** — 走 `[[audio_as_voice]]` 协议 + mmx-cli TTS

每个 D-29+ sprint 单独 plan doc, **不** 在 D-25 ~ D-28 范围。

## 10. 立即可执行 (next 4h)

D-25 sprint 立刻开干, 按 A1 → A2 → A3 → B1 → B2 → B3 → B4 → B5 顺序:

| step | 耗时 | 行动 |
|---|---|---|
| 1 | 5min | 切到 `feature/d25-fixes` 分支 (不在 main 改), checkout 干净 |
| 2 | 30min | A1: 改 `tui-ink/src/history/index.ts` + 写 1 新测, 验 3 路径优先级 |
| 3 | 30min | A2: 改 `verify-runner.ts:341-358` + 写 1 regression 测 |
| 4 | 1h | A3: 改 `verify-runner.ts:197-226` + 写 1 测 |
| 5 | 30min | B1: 改 root `package.json:13` + `tsconfig.json` references |
| 6 | 2h | B2: 改 `useRunToolLoop.ts:65` 修 3 参签名 + client/registry 从 context 注入 |
| 7 | 1h | B3: 写集成测 + 静态签名 smoke 测 |
| 8 | 2h | B4: 抽 `tuiHistoryPath/Load/Append/Truncate` 到 coding-agent util |
| 9 | 1h | B5: `npm publish -F @deepwhale/tui-ink` + `git push origin release/v1.0:release/v1.0` + 3 件套验 |
| 10 | 30min | 出 `.hermes/plans/d19/d25-retro.md` 复盘 |
| 11 | 30min | 飞书 DM 发推送通知 (8 commit + 1.0.10 ship) |

**D-25 ship 后立即开始 D-26**, 不停。
