# D-24.3 实现 plan — bin dispatch + 1.0.9 ship

**前置**: D-24.1 (`3f6d67e`) + D-24.2 (`c51832e`) 已 ship 在 `feat/d24-full-ink`. 子包 + 5 子组件 + 3 hooks + 18 新测就位.

## 1. 关键拍板 (D-24.3 决策点)

### 1.1 `tui-ink` 维持 private (跟 Hermes 决策表一致)

Hermes `hermes-tui` + `@hermes/ink` 都是 private. Hermes 装路径走 Python `hermes-agent` (PyPI), UI-TUI 是 dev-build 产物 (`npm run dev` / `npm start`), **不走 npm 装路径**.

我们 deepwhale 装路径走 npm. 所以 D-24.3 拍板:

**bundle 打进 coding-agent 自己的 tarball**, 而**不**让 tui-ink 上 npm:
- coding-agent `build` script 加 postbuild: `cp tui-ink/dist/tui.js dist/tui-ink-bundle.js`
- tui-ink 维持 `private: true` workspace
- coding-agent `files: ["dist"]` 已包含 (实际 dist 内容自己管, **不**动 files 数组)
- tarball 装路径 1:1 bundle 包含 1.74MB Ink, runtime 0 依赖

### 1.2 App 内 confirm path + session writer 一并接

D-24.2 留 2 个 TODO:
1. App `handlePromptSubmit` 接 `confirmController.offerLine(line)` (D-19 串行化)
2. `useRunToolLoop` 接 `writer: SessionWriter` (D-19.5 finish 路径)

这俩跟 bin dispatch 一起做 (D-24.3 commit cluster 1 颗大 commit, 跟 D-21.0 节奏一致).

## 2. 范围 (1 颗 commit cluster — 跟 D-22/D-23.1/D-23.2 节奏)

### 2.1 coding-agent 改动 (核心)

#### a. `bin/deepwhale.js` (1 处)
- 现有 `case 'tui': return runTuiMode({...})` **不动** (作为 legacy fallback)
- 在 `case 'tui':` 之前加 `tuiInkOrLegacy(options)` 调度:
  ```js
  async function runTuiInkOrLegacy(options) {
    try {
      const { runTuiInkMode } = require('../dist/tui-ink-bundle.js');
      return await runTuiInkMode(options);
    } catch (e) {
      // bundle 找不到 (dev mode 还没 build) → fallback legacy
      if (e.code === 'MODULE_NOT_FOUND' || e.message.includes('tui-ink-bundle')) {
        return runTuiMode(options);
      }
      throw e;
    }
  }
  ```
- `case 'tui':` 改成 `return runTuiInkOrLegacy({...})` (5 行 → 1 行)

#### b. `package.json` `scripts.build` (1 处)
- 加 postbuild step:
  ```json
  "build": "tsc -b --force && node ../llm/scripts/copy-toml.mjs && node scripts/copy-tui-ink-bundle.mjs"
  ```
- 新增 `scripts/copy-tui-ink-bundle.mjs` (简单 fs.copyFile)

#### c. `modes/tui.ts` 头部 (1 处)
- 加 `@deprecated LEGACY` 注释块
- **不**删任何代码 (D-24.1 拍板)

### 2.2 README + docs 同步

- README TUI mode section: 注明 D-24.3+ 默认走 Ink 容器, 跟 Hermes 对齐
- ARCHITECTURE.md: 标 `modes/tui.ts` legacy, `@deepwhale/tui-ink` 是新容器
- 计划文档 `docs/plans/2026-06-06-D-24-full-ink.md` 末尾加 ship 状态

### 2.3 bump 版本号

- 4 packages: `1.0.8 → 1.0.9`
- `tui-ink`: 留 `1.0.9` (已经是, 不动)
- 跟 D-21.1 / D-22 / D-23 节奏一致

## 3. 验收红线

| 验证 | 期望 |
|---|---|
| `pnpm -F @deepwhale/coding-agent build` | 含 `dist/tui-ink-bundle.js` (1.74MB) |
| `pnpm typecheck` | 0 errors |
| `pnpm lint --max-warnings 0` | 0 errors |
| `pnpm test` | 全绿 (含 tui-ink 18 新测, 现有 558/20 0 破坏) |
| **`pnpm pack --dry-run` 体积** | unpacked < 2MB (1.74MB bundle + 932K coding-agent dist) |
| **legacy fallback** (临时改 bin.js dispatch 顺序) | 旧 readline 容器仍能跑 |
| **Linux install smoke** (`npm i -g` tarball) | `node $(which deepwhale) tui` 真启 Ink 容器, Ctrl+C 干净退出 |

## 4. 红线

- ✅ 0 改 `packages/core` / `packages/llm` / `packages/edit-engine`
- ✅ `modes/tui.ts` 标 legacy 但**不**删 (D-24.1 拍板保底)
- ✅ 现有 `tui-smoke.test.ts` 979 行 0 改动
- ✅ tui-ink 维持 private workspace
- ✅ bin dispatch 顺序: bundle 优先, fallback legacy (跟 D-24.1 plan §2.3 一致)
- ✅ 1.0.9 tarball 必须 self-contained (无 `@deepwhale/tui-ink` peerDep 必须装)

## 5. 不做 (defer)

- 真 SIGINT trigger 测 (D-24.7 P0)
- 真 LLM cache 命中 (sprint 2)
- REPL mode 迁 Ink (1.1+)
- bundle minify (Hermes 同等不 minify, stack trace 优先)
- Plan mode 嵌 TUI (1.1+)

## 6. Sprint 编号

**D-24.3** (接 D-24.2 v1.0.9). 跟 D-22 / D-23.1 / D-23.2 同性质 (TUI 容器升级 + bump 1 颗 commit + 1 GitHub Release v1.0.9).
