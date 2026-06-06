#!/usr/bin/env node
/**
 * Build @deepwhale/tui-ink — bundle src/index.tsx into dist/tui.js (self-contained).
 *
 * Aligned with Hermes ui-tui build.mjs:
 *   - esbuild bundle, platform: node, format: esm, target: node20
 *   - react-devtools-core stub (Ink dev mode only, we don't need it)
 *   - JSX automatic + jsxImportSource: 'react'
 *   - Self-contained: ink, react, nanostores all bundled in
 *   - Runtime: zero node_modules required
 */
import { build } from 'esbuild'
import { mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src/index.tsx')
const out = resolve(root, 'dist/tui.js')
const watch = process.argv.includes('--watch')

mkdirSync(resolve(root, 'dist'), { recursive: true })

const stubDevtools = {
  name: 'stub-react-devtools-core',
  setup(b) {
    b.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({
      path: args.path,
      namespace: 'stub-devtools',
    }))
    b.onLoad({ filter: /.*/, namespace: 'stub-devtools' }, () => ({
      contents: 'export default { initialize() {}, connectToDevTools() {} }',
      loader: 'js',
    }))
  },
}

const buildOptions = {
  entryPoints: [src],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  minify: false,
  treeShaking: true,
  plugins: [stubDevtools],
  // Keep banner for self-contained ESM
  banner: {
    // Sprint 1c-revive-2-D-24.3 (2026-06-06) v1.0.9: 注入 createRequire 让
    // esbuild 的 __require polyfill 在 ESM 上下文能正常 dispatch (CJS deps
    // like signal-exit / auto-bind / wrap-ansi 仍走 require). 跟 Hermes
    // ui-tui build.mjs 的 __require + esbuild 实践一致.
    js: `#!/usr/bin/env node
// @deepwhale/tui-ink — D-24 full Ink TUI container. Self-contained ESM bundle.
// Built ${new Date().toISOString()}
import { createRequire as __cr } from 'node:module';
import { fileURLToPath as __fpath } from 'node:url';
const require = __cr(__fpath(import.meta.url));
`,
  },
  // Externalize workspace packages — they're resolved at runtime via node_modules
  // (the consumer — coding-agent — provides them via its package.json).
  external: ['@deepwhale/coding-agent', '@deepwhale/core', '@deepwhale/llm'],
  logLevel: 'info',
}

if (watch) {
  const ctx = await import('esbuild').then((m) => m.context(buildOptions))
  await ctx.watch()
  console.log('[tui-ink] watching for changes...')
} else {
  await build(buildOptions)
}

const stat = statSync(out)
const sizeKB = (stat.size / 1024).toFixed(1)
console.log(`[tui-ink] built ${out} (${sizeKB} KB)`)

// Bundle size soft target: Hermes ui-tui is the reference (unminified + sourcemap).
// 1.5MB is the design budget; 1.8MB is the hard warn threshold.
// We do NOT minify by default to keep stack traces readable in the field.
if (stat.size > 1.8 * 1024 * 1024) {
  console.warn(`[tui-ink] WARNING: bundle exceeds 1.8MB hard threshold (${sizeKB} KB) — consider trimming deps`)
} else if (stat.size > 1.5 * 1024 * 1024) {
  console.warn(`[tui-ink] note: bundle over 1.5MB soft target (${sizeKB} KB) — within Hermes-comparable range`)
}
