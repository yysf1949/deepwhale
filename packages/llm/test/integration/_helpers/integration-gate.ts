/**
 * @deepwhale/monorepo — integration test gate helpers
 *
 * ⚠️ **位置说明 (Sprint 1c-revive-2-D-10, 2026-06-04)**
 *
 * 这个 helper 是 **monorepo-wide** shared helper, 供 `coding-agent` 和 `llm` 包的
 * integration test 文件使用. **当前托管**在 `packages/llm/test/integration/_helpers/`
 * 路径下, 因为:
 *   1. `llm` 是上游包 (被 `coding-agent` 依赖), 先有 integration test 需求
 *   2. `coding-agent` 跨包相对引用 `'../../../llm/test/integration/_helpers/integration-gate.js'`
 *      略丑, 但不值得为了这个 test-only helper 新建 `packages/test-utils/` 包
 *      (会引入 workspace 拓扑变化 + tsconfig 调整, 改动面 ×10)
 *
 * 如果以后有更多包 (tui / edit-engine) 也要用, **不要**复制 helper, 而是:
 *   - 选项 A: 保持现位置, 加 tui/edit-engine 跨包引用
 *   - 选项 B: 升级 `packages/test-utils/` (视 workspace growth 决定, 1-2 个包不值得)
 *
 * ─── Sprint 1c-revive-2-D-10c hotfix (2026-06-04) ───
 *
 * **D-9 拍板的 `integrationSkipReason()` 语义过宽**: 任一 key 存在就允许文件运行.
 * 但实际测试用例语义更细:
 *
 *   - **DeepSeek-only 测试** (打 `api.deepseek.com` 走 `DeepSeekClient`):
 *     **必须**要求 `DEEPSEEK_API_KEY`. 用户即使只有 `ANTHROPIC_AUTH_TOKEN`
 *     (没有 DEEPSEEK) 也不能跑 — 否则撞 401.
 *
 *   - **DeepSeek /anthropic shim 测试** (打 DeepSeek 提供的 `/anthropic` 端点,
 *     走 `AnthropicClient` 但 `baseUrl=DEEPSEEK_ANTHROPIC_BASE_URL`):
 *     **也必须**要求 `DEEPSEEK_API_KEY`. 因为 DeepSeek /anthropic 端点认证用
 *     DEEPSEEK_API_KEY, 不是 ANTHROPIC_AUTH_TOKEN. R7 揭示: server 端
 *     authentication 走 DEEPSEEK key 走 OAI 协议兜底.
 *
 *   - **真 Anthropic native 测试** (打 `api.anthropic.com`):
 *     走 `ANTHROPIC_AUTH_TOKEN`. 当前 deepwhale 仓库没有这种测试, 但 helper
 *     仍暴露 `hasAnthropicKey()` 供未来用.
 *
 * **D-10c 拍板拆 4 gate function**:
 *   - `hasDeepseekKey()`: DEEPSEEK_API_KEY 真有
 *   - `hasAnthropicKey()`: ANTHROPIC_AUTH_TOKEN 真有
 *   - `deepseekSkipReason()`: 严格 deepseek gate (用于 DeepSeek-only 测试)
 *   - `deepseekAnthropicShimSkipReason()`: 严格要求 DEEPSEEK_API_KEY 的 Anthropic shim
 *     (说明: 跟 deepseekSkipReason 实际**同语义**, 拆 2 函数是给 reviewer 显式
 *     标识"这个 AnthropicClient 走的是 DeepSeek /anthropic 端点, 不是真 Anthropic")
 *   - `anyProviderSkipReason()`: 真正支持任一 provider 的测试用 (跟之前
 *     `integrationSkipReason()` 同语义, 但**改名**强制 reviewer 显式选)
 *
 * **`integrationSkipReason()` 删**: D-9 留的 "any key 都能跑" 拍板已废, 留会
 * 让 reviewer 无意中误用. 17 个集成测文件必须**显式**选上面 4 个 gate 之一.
 *
 * 用法 (integration test 文件统一改成):
 *
 *   llm 包内 (同包):
 *     import { deepseekSkipReason } from './_helpers/integration-gate.js';        // DeepSeek-only
 *     import { deepseekAnthropicShimSkipReason } from './_helpers/integration-gate.js';  // DeepSeek shim
 *     import { anyProviderSkipReason, hasAnthropicKey, hasDeepseekKey } from './_helpers/integration-gate.js';  // 混合
 *
 *   coding-agent 包 (跨包, 相对路径):
 *     import { deepseekSkipReason } from '../../../llm/test/integration/_helpers/integration-gate.js';
 *
 *   describe(...) {
 *     const reason = deepseekSkipReason();  // 或 deepseekAnthropicShimSkipReason() / anyProviderSkipReason()
 *     if (reason !== undefined) {
 *       it.skip(`SKIPPED: ${reason}`, () => {});
 *       return;
 *     }
 *     it.runIf(hasDeepseekKey())(...);  // 或 hasAnthropicKey() / it (无 gate)
 *   }
 *
 * 不变量:
 *   - 占位符过滤是 conservative (宁可多 skip, 不可发假请求)
 *   - helper **不**读 .env 文件 (跟红线 1 一致, 只看 process.env)
 *   - helper **不**log key 值 (跟红线 3 一致)
 *   - helper **不**做 ASCII-only sanitize (你 D-9 review 拍, ByteString 错应该走
 *     client 层 `APIKeyInvalidError` 显式报错, 不是改写 key)
 *     真正占位符过滤靠 `hasUsableApiKey` 黑名单正则 (中英文 / <>-bracket / placeholder)
 *   - helper **不**默认允许 OR 任一 key 存在就 skip (D-10c 拍板, 必须显式选 gate)
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

/**
 * DeepSeek-only gate skip reason.
 *
 * 用法: 任何走 `DeepSeekClient` 打 `api.deepseek.com` 的测试.
 *
 * 拍板 (D-10c, 2026-06-04): 严格 DEEPSEEK_API_KEY gate, **不**用 ANTHROPIC_AUTH_TOKEN.
 * 即使用户只有 ANTHROPIC_AUTH_TOKEN, 也不能跑 DeepSeek-only 测试 — 否则撞 401.
 */
export function deepseekSkipReason(): string | undefined {
  if (!isIntegrationEnabled()) {
    return 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")';
  }
  if (!hasDeepseekKey()) {
    return 'process.env.DEEPSEEK_API_KEY is unset or placeholder (see README "integration tests" + .env.example)';
  }
  return undefined;
}

/**
 * DeepSeek /anthropic shim gate skip reason.
 *
 * 用法: 走 `AnthropicClient` 但 `baseUrl=DEEPSEEK_ANTHROPIC_BASE_URL` 的测试
 * (e.g. llm/anthropic-shim.test.ts, ca/multi-tool-calls-2d4.test.ts,
 *  ca/schema-validation-2d3.test.ts).
 *
 * 拍板 (D-10c, 2026-06-04):
 *   - 跟 deepseekSkipReason **同语义** (都要求 DEEPSEEK_API_KEY), 因为
 *     DeepSeek /anthropic 端点认证用 DEEPSEEK key 走 OAI 协议兜底 (R7 揭示).
 *   - 拆 2 函数是给 reviewer **显式**标识"这个 AnthropicClient 走的是 DeepSeek
 *     /anthropic 端点, 不是真 Anthropic", 防止后续真 Anthropic 测试混入
 *     ANTHROPIC_AUTH_TOKEN 误用.
 */
export function deepseekAnthropicShimSkipReason(): string | undefined {
  if (!isIntegrationEnabled()) {
    return 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")';
  }
  if (!hasDeepseekKey()) {
    return 'process.env.DEEPSEEK_API_KEY is unset or placeholder (see README "integration tests" + .env.example)';
  }
  return undefined;
}

/**
 * Any-provider gate skip reason.
 *
 * 用法: 真正支持任一 provider 的测试 (e.g. compaction-cross-protocol-2d5
 * 混合 DS OAI + Anthropic shim, file-level skip 用 any-provider, 但具体 case
 * 用 `it.runIf(hasDeepseekKey())` / `it.runIf(hasAnthropicKey())` 自身 gate).
 *
 * 拍板 (D-10c, 2026-06-04): 取代 D-9 `integrationSkipReason()`, 改名为
 * `anyProviderSkipReason` **强制** reviewer 显式选. 即任一 key 存在就允许
 * 文件运行, 具体 case 由 `it.runIf` 自行 gate.
 *
 * 注意: D-10c 拍板**仅**对真正 mixed-provider 测试用此 gate.
 * 单 provider 测试 (deepseek-only / DeepSeek shim) **必须**用
 * `deepseekSkipReason()` / `deepseekAnthropicShimSkipReason()` — 不能
 * 用 anyProvider 偷懒, 否则用户只配 DEEPSEEK 也能跑 ANTHROPIC native 撞 401.
 */
export function anyProviderSkipReason(): string | undefined {
  if (!isIntegrationEnabled()) {
    return 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")';
  }
  if (!hasAnthropicKey() && !hasDeepseekKey()) {
    return (
      'process.env.ANTHROPIC_AUTH_TOKEN and DEEPSEEK_API_KEY both unset or placeholder ' +
      '(see README "integration tests" + .env.example)'
    );
  }
  return undefined; // 可跑, 但具体 case 用 it.runIf 自身 gate
}
