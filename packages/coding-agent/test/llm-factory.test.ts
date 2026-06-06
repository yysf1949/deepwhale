/**
 * @deepwhale/coding-agent — LLM factory unit tests
 *
 * Sprint 1b.5 Step 2 (C3 拍板 2026-06-03): REPL 启动时 provider 选择
 * - 显式 options.provider 优先
 * - 未给时看 env: ANTHROPIC_AUTH_TOKEN / DEEPSEEK_API_KEY
 * - 都设 → 报错 (P0 风险: 静默走错 provider 误用 API key)
 * - 都没设 → 报错 (跟 1b 时代 APIKeyMissingError 行为一致)
 *
 * 3 tests:
 * 1. env 都设了 → APIKeyMissingError with "Both ... and ... are set"
 * 2. env 只设 ANTHROPIC_AUTH_TOKEN → 走 anthropic
 * 3. env 都没设 → APIKeyMissingError with "No LLM API key set"
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDefaultClient } from '../src/llm-factory.js';
import { APIKeyMissingError } from '@deepwhale/llm';

const originalEnv = { ...process.env };

describe('llm-factory — C3 拍板: env 推断 + 显式 provider', () => {
  beforeEach(() => {
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
    delete process.env['DEEPSEEK_API_KEY'];
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('1. env ANTHROPIC_AUTH_TOKEN + DEEPSEEK_API_KEY 都设 → APIKeyMissingError (P0 风险防护)', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-anthropic-key';
    process.env['DEEPSEEK_API_KEY'] = 'env-deepseek-key';
    expect(() => createDefaultClient()).toThrow(APIKeyMissingError);
    try {
      createDefaultClient();
    } catch (e) {
      expect((e as Error).message).toMatch(/Both ANTHROPIC_AUTH_TOKEN and DEEPSEEK_API_KEY/);
    }
  });

  it('2. env 只设 ANTHROPIC_AUTH_TOKEN → 走 anthropic (new AnthropicClient, model=claude-sonnet-4-5)', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-anthropic-key';
    const client = createDefaultClient();
    expect(client.model).toBe('claude-sonnet-4-5');
  });

  it('3. env 都没设 → APIKeyMissingError with "No LLM API key set"', () => {
    expect(() => createDefaultClient()).toThrow(APIKeyMissingError);
    try {
      createDefaultClient();
    } catch (e) {
      expect((e as Error).message).toMatch(/No LLM API key set/);
    }
  });

  it('4. Sprint 1c-revive-2-D-21.1 (2026-06-06): DEEPWHALE_PROVIDER=deepseek 显式, 优先级最高, 决断 both-set 错', () => {
    // D-21.1 拍板: user 在 shell 一行 set 决断 provider, 不必 unset 另一个 key.
    // 之前: 两个 key 都设 → 报错; 现在: DEEPWHALE_PROVIDER=deepseek → 走 deepseek.
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-anthropic-key';
    process.env['DEEPSEEK_API_KEY'] = 'env-deepseek-key';
    process.env['DEEPWHALE_PROVIDER'] = 'deepseek';
    const client = createDefaultClient();
    expect(client.model).toBe('deepseek-v4-flash');
  });

  it('5. Sprint 1c-revive-2-D-21.1: DEEPWHALE_PROVIDER=anthropic 即使 DEEPSEEK_API_KEY 设了, 也走 anthropic', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-anthropic-key';
    process.env['DEEPSEEK_API_KEY'] = 'env-deepseek-key';
    process.env['DEEPWHALE_PROVIDER'] = 'anthropic';
    const client = createDefaultClient();
    expect(client.model).toBe('claude-sonnet-4-5');
  });

  it('6. Sprint 1c-revive-2-D-21.1: DEEPWHALE_PROVIDER 拼错 (e.g. depseek) 静默 fall through, 不 fatal', () => {
    // 拍板: 拼错不该是 fatal, 静默忽略 → fall through 到 env 推断, 后续
    // "Both set" / "No key" 错仍是 user 看到的最具体错. 行为: 不抛,
    // 走到下面 hasAnthropic && hasDeepseek 抛 Both set.
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-anthropic-key';
    process.env['DEEPSEEK_API_KEY'] = 'env-deepseek-key';
    process.env['DEEPWHALE_PROVIDER'] = 'depseek';
    expect(() => createDefaultClient()).toThrow(/Both ANTHROPIC_AUTH_TOKEN and DEEPSEEK_API_KEY/);
  });

  it('7. Sprint 1c-revive-2-D-21.1: 只设 DEEPSEEK_API_KEY → 走 deepseek (品牌默认, deepseek-first)', () => {
    // 跟 README / package.json "DeepSeek-first" 品牌一致. 之前 1b.5 时代
    // "Anthropic 排第一" 拍板跟品牌矛盾, D-21.1 修正 (行为没变, 单 key 路径
    // 完全兼容, 测例保证不回归).
    process.env['DEEPSEEK_API_KEY'] = 'env-deepseek-key';
    const client = createDefaultClient();
    expect(client.model).toBe('deepseek-v4-flash');
  });
});

describe('llm-factory — 显式 provider 优先 (不读 env)', () => {
  beforeEach(() => {
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
    delete process.env['DEEPSEEK_API_KEY'];
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('4. 显式 provider=deepseek, env 都没设 → 走 deepseek (不报错)', () => {
    const client = createDefaultClient({ provider: 'deepseek' });
    expect(client.model).toBe('deepseek-v4-flash');
  });

  it('5. 显式 provider=anthropic, env 显式设 ANTHROPIC_AUTH_TOKEN → 走 anthropic (不报错, client 读 env)', () => {
    // Sprint 1b.5 Step 2.5 (F1 拍板): factory anthropic 路径**不**传 apiKey, 让 client
    // 内部 resolveApiKey() 读 env. 测试**必须**显式设 env, 验证 client 真的能 resolve.
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'test-anthropic-key';
    const client = createDefaultClient({ provider: 'anthropic' });
    expect(client.model).toBe('claude-sonnet-4-5');
  });

  it('6. 显式 provider=deepseek, env 跟 provider 矛盾 → 显式胜出 (不报错)', () => {
    // C3: 显式给 → 跳过 env 检查 (user 知道自己传了啥)
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-anthropic-key';
    const client = createDefaultClient({ provider: 'deepseek' });
    expect(client.model).toBe('deepseek-v4-flash');
  });

  it('7. 显式 model=deepseek-v4-pro, provider=deepseek → 透传 model', () => {
    const client = createDefaultClient({ provider: 'deepseek', model: 'deepseek-v4-pro' });
    expect(client.model).toBe('deepseek-v4-pro');
  });

  it('8. 显式 model=claude-opus-4-5, provider=anthropic → 透传 model (env 设了 key)', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'test-anthropic-key';
    const client = createDefaultClient({ provider: 'anthropic', model: 'claude-opus-4-5' });
    expect(client.model).toBe('claude-opus-4-5');
  });
});
