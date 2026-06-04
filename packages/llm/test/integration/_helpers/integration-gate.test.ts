/**
 * @deepwhale/monorepo — integration-gate helper 单测
 *
 * 拍板 (Sprint 1c-revive-2-D-9, 2026-06-04):
 *   - 验 hasUsableApiKey 占位符过滤 (P2-1 拍板)
 *   - 验 hasAnthropicKey / hasDeepseekKey 走 process.env
 *   - 验 integrationSkipReason 字符串形态一致
 *   - 验占位符命中: '***你的 key***' / '*** your key ***' / '<your-key>' / 'your-key' / 'placeholder' / 空
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  hasUsableApiKey,
  hasAnthropicKey,
  hasDeepseekKey,
  isIntegrationEnabled,
  deepseekSkipReason,
  deepseekAnthropicShimSkipReason,
  anyProviderSkipReason,
} from './integration-gate.js';

describe('integration-gate helper (D-9 2026-06-04)', () => {
  // ---- backup env (跟 loadProjectEnv.test.ts 一样模式) ----

  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // 重置 integration 相关 env
    delete process.env['INTEGRATION'];
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
    delete process.env['DEEPSEEK_API_KEY'];
  });

  afterEach(() => {
    // 还原 (避免污染其他 test)
    for (const k of Object.keys(process.env)) {
      if (!(k in ORIGINAL_ENV)) {
        delete process.env[k];
      }
    }
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      process.env[k] = v;
    }
  });

  describe('hasUsableApiKey (P2-1 占位符过滤, 2026-06-04)', () => {
    it('undefined → false', () => {
      expect(hasUsableApiKey(undefined)).toBe(false);
    });

    it('空字符串 → false', () => {
      expect(hasUsableApiKey('')).toBe(false);
    });

    it('短字符串 (长度 < 8) → false', () => {
      expect(hasUsableApiKey('abc')).toBe(false);
      expect(hasUsableApiKey('1234567')).toBe(false);
    });

    it('纯 asterisk 占位符 → false', () => {
      expect(hasUsableApiKey('***')).toBe(false);
      expect(hasUsableApiKey('*********')).toBe(false);
    });

    it('"***你的 key***" 占位符 → false (P2-1 核心 case)', () => {
      expect(hasUsableApiKey('***你的 key***')).toBe(false);
    });

    it('"*** your key ***" 占位符 (带空格) → false', () => {
      expect(hasUsableApiKey('*** your key ***')).toBe(false);
    });

    it('<your-key> 占位符 → false', () => {
      expect(hasUsableApiKey('<your-key>')).toBe(false);
      expect(hasUsableApiKey('<YOUR_KEY>')).toBe(false);
    });

    it('"your-key" 无尖括号 → false', () => {
      expect(hasUsableApiKey('your-key')).toBe(false);
      expect(hasUsableApiKey('your_key')).toBe(false);
    });

    it('"你的密钥" 中文占位 → false', () => {
      expect(hasUsableApiKey('你的密钥')).toBe(false);
      expect(hasUsableApiKey('你的 密钥')).toBe(false);
    });

    it('"把 *** 换成 key" 注释残留 → false', () => {
      expect(hasUsableApiKey('把 *** 换成 key')).toBe(false);
    });

    it('"placeholder" 英文 → false', () => {
      expect(hasUsableApiKey('placeholder')).toBe(false);
      expect(hasUsableApiKey('PLACEHOLDER_VALUE')).toBe(false);
    });

    it('"example value" 英文 → false', () => {
      expect(hasUsableApiKey('example value')).toBe(false);
    });

    it('真 DeepSeek key 形态 → true', () => {
      expect(hasUsableApiKey('sk-abc123def456ghi789')).toBe(true);
    });

    it('真 Anthropic key 形态 → true', () => {
      expect(hasUsableApiKey('sk-ant-api03-abc123def456ghi789')).toBe(true);
    });

    it('长度 >= 8 不命中任何占位符 → true', () => {
      expect(hasUsableApiKey('12345678')).toBe(true);
      expect(hasUsableApiKey('abcdefghijklmnop')).toBe(true);
    });
  });

  describe('hasAnthropicKey / hasDeepseekKey (走 process.env)', () => {
    it('env 都 unset → 都 false', () => {
      expect(hasAnthropicKey()).toBe(false);
      expect(hasDeepseekKey()).toBe(false);
    });

    it('env 都有真 key → 都 true', () => {
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-api03-abc123def456ghi789';
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc123def456ghi789';
      expect(hasAnthropicKey()).toBe(true);
      expect(hasDeepseekKey()).toBe(true);
    });

    it('env 只有 Anthropic 占位符 → hasAnthropicKey false, hasDeepseekKey false', () => {
      process.env['ANTHROPIC_AUTH_TOKEN'] = '***你的 key***';
      expect(hasAnthropicKey()).toBe(false);
      expect(hasDeepseekKey()).toBe(false);
    });

    it('env 只有 DeepSeek 真 key → hasDeepseekKey true, hasAnthropicKey false', () => {
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc123def456ghi789';
      expect(hasAnthropicKey()).toBe(false);
      expect(hasDeepseekKey()).toBe(true);
    });

    it('env 只有 Anthropic 真 key → hasAnthropicKey true, hasDeepseekKey false', () => {
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-api03-abc123def456ghi789';
      expect(hasAnthropicKey()).toBe(true);
      expect(hasDeepseekKey()).toBe(false);
    });
  });

  describe('integrationSkipReason (D-9 字符串一致) — D-10c 拆 3 gate', () => {
    it('INTEGRATION !== 1 + 无 key → 3 gate 都包含 "INTEGRATION !== 1"', () => {
      process.env['INTEGRATION'] = '0';
      for (const fn of [deepseekSkipReason, deepseekAnthropicShimSkipReason, anyProviderSkipReason]) {
        const reason = fn();
        expect(reason).toBeDefined();
        expect(reason).toMatch(/INTEGRATION !== 1/);
      }
    });

    it('INTEGRATION === 1 + DEEPSEEK_API_KEY 设 + ANTHROPIC_AUTH_TOKEN unset → deepseekSkipReason undefined (可跑)', () => {
      process.env['INTEGRATION'] = '1';
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc...i789';
      expect(deepseekSkipReason()).toBeUndefined();
    });

    it('INTEGRATION === 1 + DEEPSEEK_API_KEY 设 + ANTHROPIC_AUTH_TOKEN unset → deepseekAnthropicShimSkipReason undefined (shim 跟 deepseek 同)', () => {
      process.env['INTEGRATION'] = '1';
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc...i789';
      expect(deepseekAnthropicShimSkipReason()).toBeUndefined();
    });

    it('INTEGRATION === 1 + DEEPSEEK_API_KEY 设 + ANTHROPIC_AUTH_TOKEN unset → anyProviderSkipReason undefined (任一 key 即跑)', () => {
      process.env['INTEGRATION'] = '1';
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc...i789';
      expect(anyProviderSkipReason()).toBeUndefined();
    });

    it('INTEGRATION === 1 + 全部占位符 → 3 gate 都 "DEEPSEEK_API_KEY is unset or placeholder" (shim/any 略有差异但都非 undefined)', () => {
      process.env['INTEGRATION'] = '1';
      process.env['ANTHROPIC_AUTH_TOKEN'] = '***你的 key***';
      process.env['DEEPSEEK_API_KEY'] = 'placeholder';
      // deepseek / shim 都要求 DEEPSEEK_API_KEY, 全部占位符 → 都 skip
      expect(deepseekSkipReason()).toMatch(/DEEPSEEK_API_KEY is unset or placeholder/);
      expect(deepseekAnthropicShimSkipReason()).toMatch(/DEEPSEEK_API_KEY is unset or placeholder/);
      // anyProvider 任一即可, 全部占位符也 skip
      expect(anyProviderSkipReason()).toMatch(/both unset or placeholder/);
    });
  });

  describe('D-10c gate semantic (2026-06-04) — 严要求, 显式 OR 行为', () => {
    it('only ANTHROPIC_AUTH_TOKEN + DeepSeek-only 测试 → skip (不因 ANTHROPIC key 误跑)', () => {
      // 拍板: DeepSeek-only 测试用 deepseekSkipReason, 严格要求 DEEPSEEK_API_KEY.
      // 即使用户只配 ANTHROPIC_AUTH_TOKEN, 也不能跑 deepseek-only 测试 — 否则撞 401.
      process.env['INTEGRATION'] = '1';
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant...i789';
      delete process.env['DEEPSEEK_API_KEY'];
      const reason = deepseekSkipReason();
      expect(reason).toBeDefined();
      expect(reason).toMatch(/DEEPSEEK_API_KEY is unset or placeholder/);
    });

    it('only ANTHROPIC_AUTH_TOKEN + DeepSeek shim 测试 → skip (跟 deepseek-only 同)', () => {
      // 拍板: DeepSeek shim (AnthropicClient 打 DEEPSEEK_ANTHROPIC_BASE_URL) 认证用 DEEPSEEK_API_KEY.
      // 即使用户只配 ANTHROPIC_AUTH_TOKEN, 也不能跑 — 否则撞 401.
      process.env['INTEGRATION'] = '1';
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant...i789';
      delete process.env['DEEPSEEK_API_KEY'];
      const reason = deepseekAnthropicShimSkipReason();
      expect(reason).toBeDefined();
      expect(reason).toMatch(/DEEPSEEK_API_KEY is unset or placeholder/);
    });

    it('only DEEPSEEK_API_KEY + DeepSeek-only 测试 → run (undefined = 可跑, 走 it.runIf(hasDeepseekKey) 自身 gate)', () => {
      process.env['INTEGRATION'] = '1';
      delete process.env['ANTHROPIC_AUTH_TOKEN'];
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc...i789';
      expect(deepseekSkipReason()).toBeUndefined();
    });

    it('only DEEPSEEK_API_KEY + DeepSeek shim 测试 → run (跟 deepseek-only 同)', () => {
      process.env['INTEGRATION'] = '1';
      delete process.env['ANTHROPIC_AUTH_TOKEN'];
      process.env['DEEPSEEK_API_KEY'] = 'sk-abc...i789';
      expect(deepseekAnthropicShimSkipReason()).toBeUndefined();
    });
  });

  describe('isIntegrationEnabled (D-9 改: const → fn, 2026-06-04)', () => {
    it('env unset → false', () => {
      delete process.env['INTEGRATION'];
      expect(isIntegrationEnabled()).toBe(false);
    });

    it('env === "1" → true', () => {
      process.env['INTEGRATION'] = '1';
      expect(isIntegrationEnabled()).toBe(true);
    });

    it('env === "0" → false', () => {
      process.env['INTEGRATION'] = '0';
      expect(isIntegrationEnabled()).toBe(false);
    });
  });
});
