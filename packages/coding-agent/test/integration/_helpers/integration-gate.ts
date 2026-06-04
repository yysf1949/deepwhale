/**
 * @deepwhale/coding-agent — integration test gate helpers
 *
 * 拍板 (Sprint 1c-revive-2-D-9, 2026-06-04):
 *   - 抽 6 个 integration test 文件**重复**的 boilerplate
 *     (INTEGRATION_ENABLED / HAS_ANTHROPIC_KEY / HAS_DEEPSEEK_KEY / canRun / skipReason)
 *     到一个 shared helper. 6 个文件**完全**等价, 抽完删 boilerplate.
 *   - 占位符过滤 (P2-1 拍板 D-9, 2026-06-04):
 *     `hasUsableApiKey(value)` 过滤 `***` / `<your-*` / `your-*` / 空 / 纯占位
 *     → 用户复制 .env.example 后只改 INTEGRATION=1, 不会因为残留 `***你的 key***`
 *       被当作"非空 = 可用"撞出 401 / 假 key 真请求
 *   - `it.runIf(hasXxxKey())` 走 Vitest SKIPPED 计数, 跟 file-level canRun 一致
 *     (P2-2 拍板 D-9, 2026-06-04)
 *   - `integrationSkipReason()` 提供一致的 skip reason 字符串
 *   - **不**抽 `describeIntegration()` wrapper (你说"抽 helper"但 6 个文件结构
 *     差异大, 多 case 测, 抽 wrapper 改动面 ×3, 不如直接走 hasXxxKey + it.runIf).
 *
 * 用法 (6 个 integration test 文件统一改成):
 *   import { hasAnthropicKey, hasDeepseekKey, integrationSkipReason } from './_helpers/integration-gate.js';
 *   ...
 *   it.runIf(hasAnthropicKey())(`name`, async () => { ... }, 300_000);
 *   // OR
 *   describe(...) {
 *     if (!integrationSkipReason()) {
 *       it.skip(integrationSkipReason()!);
 *       return;
 *     }
 *     it.runIf(hasAnthropicKey())(...);
 *     it.runIf(hasDeepseekKey())(...);
 *   }
 *
 * 不变量:
 *   - 占位符过滤是 conservative (宁可多 skip, 不可发假请求)
 *   - helper **不**读 .env 文件 (跟红线 1 一致, 只看 process.env)
 *   - helper **不**log key 值 (跟红线 3 一致)
 *
 * @module @deepwhale/coding-agent/test/integration/_helpers/integration-gate
 */

/**
 * 占位符模式 (D-9 P2-1 拍板, 2026-06-04).
 * 真 key 长这样: `sk-abc123...` (≥20 字符, 字母数字 + dash)
 * 占位符长这样: `***你的 key***` / `<your-key>` / `your-key` / 空 / 全 asterisk
 * → 用 regex 匹配**已知占位**模式
 */
const PLACEHOLDER_PATTERNS: ReadonlyArray<RegExp> = [
  /^\*+$/, // 纯 asterisk
  /<\s*your[\s_-]?key\s*>/i, // <your-key> / <your_key> / <your key>
  /\byour[\s_-]?key\b/i, // your-key / your_key / your key (英文)
  /你的\s*key/i, // 中文 "你的 key"
  /你的\s*密钥/i, // 中文 "你的密钥"
  /把.*换成.*key/i, // "把 *** 换成 key" 等注释残留
  /placeholder/i, // "placeholder" 英文
  /example\s*value/i, // "example value"
];

/**
 * 检查 `process.env` 取出来的 key 是否**真的**可用.
 *
 * @param value 来自 `process.env['DEEPSEEK_API_KEY' | 'ANTHROPIC_AUTH_TOKEN']`
 * @returns true = 真 key, false = 空 / 占位符
 *
 * 拍板 (D-9 P2-1, 2026-06-04):
 *   - undefined / 空字符串 → false
 *   - 命中 PLACEHOLDER_PATTERNS 任一 → false
 *   - 长度 < 8 (短于合理 key 长度) → false
 *   - 长度 >= 8 且不匹配占位符 → true
 */
export function hasUsableApiKey(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  if (value.length < 8) return false;
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(value)) return false;
  }
  return true;
}

/** 真接开关: 跟 6 个 integration test 红线 1 一致. */
export function isIntegrationEnabled(): boolean {
  return process.env['INTEGRATION'] === '1';
}

/** ANTHROPIC_AUTH_TOKEN 真有 (且非占位符) → true. */
export function hasAnthropicKey(): boolean {
  return hasUsableApiKey(process.env['ANTHROPIC_AUTH_TOKEN']);
}

/** DEEPSEEK_API_KEY 真有 (且非占位符) → true. */
export function hasDeepseekKey(): boolean {
  return hasUsableApiKey(process.env['DEEPSEEK_API_KEY']);
}

/** file-level 整文件 skip 原因: 跟 6 个文件原 skipReason 字符串一致. */
export function integrationSkipReason(): string | undefined {
  if (isIntegrationEnabled()) {
    if (!hasAnthropicKey() && !hasDeepseekKey()) {
      return (
        'process.env.ANTHROPIC_AUTH_TOKEN and DEEPSEEK_API_KEY both unset or placeholder ' +
        '(see README "integration tests" + .env.example)'
      );
    }
    return undefined; // 可跑, 但具体 case 用 it.runIf 自身 gate
  }
  return 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")';
}
