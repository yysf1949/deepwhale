import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Sprint 1c-revive-2-D-7 (review, 2026-06-04): 跨包测试 setupFile — 在 vitest
 * 启动时调一次 loadProjectEnv(), 让 INTEGRATION=1 / API key 之类从项目根 .env
 * 注入到 process.env. 红线 (跟 llm/test 红线 1 一致): 永远只补缺 (??=), CI /
 * shell 显式 export 优先级最高, .env 不会覆盖.
 *
 * 拍板: setupFile 走"load → re-export 同一份" 模式, 这样跨包 (coding-agent +
 * llm + edit-engine + core) 都能拿到, 单测试里调 loadProjectEnv() 也幂等.
 *
 * === Sprint 1c-revive-3-D-19.6.1 (2026-06-05): vitest alias @deepwhale/core → src ===
 * 拍板 (D-19.6.1, user review 2026-06-05 P1.1): reviewer 跑 `vitest.CMD run ...`
 * (focused suite, 不走 pnpm test) 不触发 `pretest: tsc -b`, dist/ 还是上一次
 * 编译时的老 key set, 找不到新加的 i18n key, 测就 fail. 修复: vitest alias 让
 * `@deepwhale/core` 永远走 `packages/core/src/index.ts`, 测试吃 src 同步 i18n.
 * 生产仍走 dist (package.json exports 锁定), 此差异接受 — 反而避免 "dist stale
 * 导致 focused 测假失败" 的 reviewer 摩擦. 注: src/i18n/* 的 t() / locale 字典
 * 直接 import, 不走 .js 编译产物, 不依赖 dist 同步.
 */
import { loadProjectEnv } from './packages/coding-agent/src/env/load-project-env.js';

export default defineConfig({
  resolve: {
    alias: {
      // 拍板 (D-19.6.1): @deepwhale/core 测试永远走 src, 不依赖 dist 同步.
      // 改 src/index.ts 单个 import 解析 (D-19.6.1 只覆盖这一个 package, 不
      // 扩到 @deepwhale/llm / @deepwhale/edit-engine — 那俩目前没这个雷).
      '@deepwhale/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    // 跨包: 用绝对路径 (cwd 是 monorepo 根, 相对路径也得解析)
    setupFiles: [resolve(import.meta.dirname, 'packages/coding-agent/test/setup-env.ts')],
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'packages/*/test/**/*.test.tsx',
      // Sprint 1b.5 Step 3: 真接 DeepSeek shim 集成测. 默认 skip, INTEGRATION=1 才跑.
      // 跟单测同 include 让 vitest 看到文件 (否则根本不收集), 但**测试内部**自己检查 env.
      'packages/*/test/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    },
  },
});
