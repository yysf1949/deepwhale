/**
 * @deepwhale/coding-agent — LLM provider factory
 *
 * Sprint 1b.5 Step 2 (2.5 拍板, C3 拍板 2026-06-03):
 * REPL 启动时 provider 怎么选, 拍板为 "env 推断 + flag 显式覆盖":
 * 1. options.provider 显式给 → 优先用显式值 (REPL --provider flag)
 * 2. options.provider 未给 → 看 env:
 *    - ANTHROPIC_AUTH_TOKEN 设了 + DEEPSEEK_API_KEY 没设 → anthropic (走 DeepSeek shim)
 *    - DEEPSEEK_API_KEY 设了 + ANTHROPIC_AUTH_TOKEN 没设 → deepseek
 *    - 两个都设了 → 报错 (静默走错 provider 误用 API key 是 P0 风险)
 *    - 两个都没设 → 报错 (让 user 知道必须设 key)
 *
 * 设计原则 (Hermes 1a follow-up #2 lesson):
 * - 不**静默** default 到某个 provider, 必报清晰错
 * - 不**做**汇率换算 / 跨 provider 兼容 (DeepSeek shim 走同一 endpoint, 接口层隔离)
 * - 注入点已存在 (ReplOptions.client), factory 只在 startRepl 入口用
 */

import { AnthropicClient, DeepSeekClient, type LLMClient, APIKeyMissingError } from '@deepwhale/llm';

export type Provider = 'deepseek' | 'anthropic';

export interface CreateClientOptions {
  /** 显式 provider. 跟 env 推断冲突时, 优先用显式值 + warn. */
  provider?: Provider;
  /** 显式 model ID. 不传则用 provider 默认 (deepseek → deepseek-v4-flash, anthropic → claude-sonnet-4-5). */
  model?: string;
}

/**
 * C3 拍板: env 推断 + flag 显式覆盖.
 * - provider 显式给 → 走 provider (不再读 env, 显式胜出)
 * - provider 未给 → 看 env (ANTHROPIC_AUTH_TOKEN vs DEEPSEEK_API_KEY)
 * - provider 显式 + env 也设了不一致 → 显式胜出, 不报错 (user 知道自己传了啥)
 * - 都没设 → 报错 (跟 1b 时代 APIKeyMissingError 行为一致, 引导 user 设 env)
 */
export function createDefaultClient(options: CreateClientOptions = {}): LLMClient {
  const resolved = resolveProvider(options.provider);
  switch (resolved) {
    case 'deepseek':
      return new DeepSeekClient({ ...(options.model !== undefined ? { model: options.model } : {}) });
    case 'anthropic':
      // Sprint 1b.5 Step 2.5 (F1 拍板, review 2026-06-03): 不**传** apiKey, 让 AnthropicClient
      // 内部 resolveApiKey() 读 env. 之前传 'placeholder' 是测试 mock 路径留下的 bug, 会**盖**
      // 真实 env ANTHROPIC_AUTH_TOKEN / DEEPSEEK_API_KEY, Step 3 真接会 401.
      //
      // X3 拍板: 测试场景单测 mock fetch, 不**走**真 HTTP, apiKey 走 env 也无所谓.
      // 真要测试"不传 apiKey 时 constructor 抛" 的路径, 显式 inject options.apiKey.
      return new AnthropicClient({ ...(options.model !== undefined ? { model: options.model } : {}) });
  }
}

/**
 * 公开 env key 解析, 给 mode 层 (repl/print/rpc) 显式判断 provider 用.
 * 跟 AnthropicClient.resolveApiKey 内部逻辑**保持一致**: ANTHROPIC_AUTH_TOKEN 优先,
 * DEEPSEEK_API_KEY 退路. 不抛 (返 undefined 让 caller 决定).
 */
export function resolveAnthropicApiKey(): string | undefined {
  const anthropic = process.env['ANTHROPIC_AUTH_TOKEN'];
  if (anthropic !== undefined && anthropic !== '') return anthropic;
  const deepseek = process.env['DEEPSEEK_API_KEY'];
  if (deepseek !== undefined && deepseek !== '') return deepseek;
  return undefined;
}

/**
 * 解析 provider (env 推断 + flag 显式).
 * 显式给 → 直接返, 跳过 env 推断.
 * 显式未给 → 看 env:
 *   - 都没设 → 抛 APIKeyMissingError (跟 1b 时代一致, 引导 user)
 *   - 都设了 → 抛 'both-set' 错误 (P0 风险, 强制 user 决断)
 *   - 只设一个 → 返那个
 */
function resolveProvider(explicit: Provider | undefined): Provider {
  if (explicit !== undefined) return explicit;
  const hasAnthropic = (process.env['ANTHROPIC_AUTH_TOKEN'] ?? '') !== '';
  const hasDeepseek = (process.env['DEEPSEEK_API_KEY'] ?? '') !== '';
  if (hasAnthropic && hasDeepseek) {
    throw new APIKeyMissingError(
      'Both ANTHROPIC_AUTH_TOKEN and DEEPSEEK_API_KEY are set. ' +
        'Unset one or pass --provider explicitly. This is a safety check to prevent ' +
        'silently using the wrong provider with the wrong API key.',
    );
  }
  if (hasAnthropic) return 'anthropic';
  if (hasDeepseek) return 'deepseek';
  throw new APIKeyMissingError(
    'No LLM API key set. Set DEEPSEEK_API_KEY (DeepSeek) or ' +
      'ANTHROPIC_AUTH_TOKEN (Anthropic, via DeepSeek shim /anthropic endpoint) ' +
      'environment variable, or pass --provider explicitly.',
  );
}

/**
 * 重新导出 Re-export 给 cli.ts 入口, 让 cli.ts 不必直接 import from @deepwhale/llm
 * (单测 mock LLMClient 时, 走 @deepwhale/coding-agent/llm-factory 一处 import 即可).
 *
 * Provider + CreateClientOptions type 已在上面 line 22-25 export, 这里只 re-export class.
 */
export { AnthropicClient, DeepSeekClient };
