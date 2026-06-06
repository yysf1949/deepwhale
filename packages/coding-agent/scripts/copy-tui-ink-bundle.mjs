#!/usr/bin/env node
/**
 * Postbuild: copy @deepwhale/tui-ink bundle into coding-agent's dist/ for
 * tarball install path. Sprint 1c-revive-2-D-24.3 (2026-06-06) v1.0.9.
 *
 * 拍板 (D-24.3):
 *   - coding-agent 1.0.9 tarball 必须 self-contained (无外部 @deepwhale/tui-ink
 *     peerDeps 必须装).
 *   - bundle 复制到 coding-agent/dist/tui-ink-bundle.js (1.74MB unminified).
 *   - bin/deepwhale.js 'tui' mode 优先 import 这个 bundle, 找不到 fallback legacy.
 *   - tui-ink 维持 private workspace (跟 Hermes @hermes/ink private 决策表一致).
 *
 * 调用链:
 *   pnpm -F @deepwhale/coding-agent build
 *   └─ tsc -b --force
 *   └─ node ../llm/scripts/copy-toml.mjs
 *   └─ node scripts/copy-tui-ink-bundle.mjs  ← this script
 *
 * 失败处理:
 *   - tui-ink 还没 build → throw (跟 tsc -b 一致, fail-fast)
 *   - dist/ 不存在 → mkdir -p
 *   - tui.js 不存在 → throw "请先跑 pnpm -F @deepwhale/tui-ink build"
 */

import { copyFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const codingAgentRoot = resolve(here, '..')
// coding-agent 已经在 packages/coding-agent/, 上两级才是 monorepo 根
const monorepoRoot = resolve(codingAgentRoot, '..', '..')

const src = resolve(monorepoRoot, 'packages/tui-ink/dist/tui.js')
const dest = resolve(codingAgentRoot, 'dist/tui-ink-bundle.js')

if (!existsSync(src)) {
  console.error(`[copy-tui-ink-bundle] FATAL: source not found: ${src}`)
  console.error(`[copy-tui-ink-bundle] Run: pnpm -F @deepwhale/tui-ink build`)
  process.exit(1)
}

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)

const srcSize = statSync(src).size
const destSize = statSync(dest).size
const srcKB = (srcSize / 1024).toFixed(1)
const destKB = (destSize / 1024).toFixed(1)

if (srcSize !== destSize) {
  console.error(
    `[copy-tui-ink-bundle] FATAL: size mismatch src=${srcSize} dest=${destSize}`,
  )
  process.exit(1)
}

console.log(
  `[copy-tui-ink-bundle] copied ${src} -> ${dest} (${srcKB} KB)`,
)

// 软上限检查 (跟 tui-ink build.mjs 同: 1.5MB soft note, 1.8MB hard warn)
if (destSize > 1.8 * 1024 * 1024) {
  console.warn(
    `[copy-tui-ink-bundle] WARNING: bundle exceeds 1.8MB hard threshold (${destKB} KB) — consider trimming deps`,
  )
} else if (destSize > 1.5 * 1024 * 1024) {
  console.warn(
    `[copy-tui-ink-bundle] note: bundle over 1.5MB soft target (${destKB} KB) — within Hermes-comparable range`,
  )
}
