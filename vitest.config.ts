import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
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
