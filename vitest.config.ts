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
 */
import { loadProjectEnv } from './packages/coding-agent/src/env/load-project-env.js';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // 跨包: 用绝对路径 (cwd 是 monorepo 根, 相对路径也得解析)
    setupFiles: [resolve(import.meta.dirname, 'packages/coding-agent/test/setup-env.ts')],
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
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
