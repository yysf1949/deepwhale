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
