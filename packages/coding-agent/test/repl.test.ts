/**
 * REPL 单测 — 重点测 runOneTurn（核心 chat 单元）。
 * startRepl 需要 readline + 真 stdin/stdout，单测只测核心可注入部分。
 *
 * 覆盖：
 * - runOneTurn empty/whitespace 输入 → { kind: 'empty' }
 * - runOneTurn happy path → { kind: 'chat', assistant }
 * - runOneTurn LLMError → { kind: 'error', error } 含 i18n 文案
 * - runOneTurn APIKeyMissingError → i18n 'error.api_key_missing'
 * - runOneTurn messages 不被修改（immutable 验证）
 * - runOneTurn 错误时不污染 messages
 * - runOneTurn custom signal 透传
 * - runOneTurn 普通 Error（非 LLMError）也能被 format
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale, t } from '@deepwhale/core';
import {
  APIKeyMissingError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMUnknownError,
} from '@deepwhale/llm';
import type { ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';
import { formatUsageStatus, runOneTurn } from '../src/repl.js';

// ---- 工具：mock LLMClient ----

function makeMockClient(
  responder: (messages: ChatMessage[]) => Promise<ChatResult> | ChatResult,
): LLMClient {
  return {
    model: 'mock-model' as ModelId,
    chat: vi.fn(async (messages: ChatMessage[]) => responder(messages)),
  };
}

// ---- Tests ----

describe('runOneTurn', () => {
  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    setLocale('en');
  });

  it('returns { kind: "empty" } for empty line', async () => {
    const client = makeMockClient(() => ({ model: 'x' as ModelId, content: 'nope' }));
    const result = await runOneTurn(client, '', []);
    expect(result).toEqual({ kind: 'empty' });
    expect(client.chat).not.toHaveBeenCalled();
  });

  it('returns { kind: "empty" } for whitespace-only line', async () => {
    const client = makeMockClient(() => ({ model: 'x' as ModelId, content: 'nope' }));
    const result = await runOneTurn(client, '   \t  \n  ', []);
    expect(result).toEqual({ kind: 'empty' });
    expect(client.chat).not.toHaveBeenCalled();
  });

  it('returns { kind: "chat" } on happy path', async () => {
    const client = makeMockClient(() => ({ model: 'mock' as ModelId, content: 'whale says hi' }));
    const result = await runOneTurn(client, 'hello', []);
    expect(result).toEqual({ kind: 'chat', assistant: 'whale says hi' });
  });

  it('appends user message to messages list when calling client', async () => {
    let seenMessages: ChatMessage[] = [];
    const client = makeMockClient((msgs) => {
      seenMessages = msgs;
      return { model: 'x' as ModelId, content: 'ok' };
    });
    const history: ChatMessage[] = [{ role: 'assistant', content: 'earlier' }];
    await runOneTurn(client, 'now ask me', history);
    expect(seenMessages).toEqual([
      { role: 'assistant', content: 'earlier' },
      { role: 'user', content: 'now ask me' },
    ]);
  });

  it('does NOT mutate the input messages array', async () => {
    const client = makeMockClient(() => ({ model: 'x' as ModelId, content: 'ok' }));
    const history: ChatMessage[] = [{ role: 'user', content: 'old' }];
    const snapshot = JSON.stringify(history);
    await runOneTurn(client, 'new', history);
    expect(JSON.stringify(history)).toBe(snapshot);
  });

  it('does NOT add the user message to the input history on success', async () => {
    const client = makeMockClient(() => ({ model: 'x' as ModelId, content: 'ok' }));
    const history: ChatMessage[] = [];
    await runOneTurn(client, 'hi', history);
    // history is empty — caller decides whether to keep (REPL in single-turn mode does not)
    expect(history).toEqual([]);
  });

  it('returns { kind: "error" } with i18n for APIKeyMissingError', async () => {
    const client = makeMockClient(() => {
      throw new APIKeyMissingError(t('error.api_key_missing'));
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('error.api_key_missing'));
    }
  });

  it('returns i18n for LLMAuthError with status code', async () => {
    const client = makeMockClient(() => {
      throw new LLMAuthError(401, 'unauthorized');
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.auth', '401'));
    }
  });

  it('returns i18n for LLMRateLimitError', async () => {
    const client = makeMockClient(() => {
      throw new LLMRateLimitError('429');
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.rate_limit'));
    }
  });

  it('returns i18n for LLMNetworkError with cause message', async () => {
    const client = makeMockClient(() => {
      throw new LLMNetworkError('Network error: ECONNREFUSED', {
        cause: new Error('ECONNREFUSED'),
      });
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.network', 'ECONNREFUSED'));
    }
  });

  it('returns i18n for LLMUnknownError with status', async () => {
    const client = makeMockClient(() => {
      throw new LLMUnknownError('oops', { status: 500 });
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.unknown', 'HTTP 500'));
    }
  });

  it('returns i18n for non-LLM Error (generic catch)', async () => {
    const client = makeMockClient(() => {
      throw new TypeError('something broke');
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.unknown', 'something broke'));
    }
  });

  it('returns i18n for non-Error throw (string)', async () => {
    const client = makeMockClient(() => {
      throw 'plain string';
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.unknown', 'plain string'));
    }
  });

  it('passes AbortSignal to client.chat', async () => {
    const client = makeMockClient(() => ({ model: 'x' as ModelId, content: 'ok' }));
    const ac = new AbortController();
    await runOneTurn(client, 'hi', [], { signal: ac.signal });
    // Sprint 1a: chat() 签名改为 (msgs, { signal, tools, tool_choice })
    expect(client.chat).toHaveBeenCalledWith(expect.any(Array), { signal: ac.signal });
  });

  it('Chinese locale: error message is in zh-CN', async () => {
    setLocale('zh-CN');
    const client = makeMockClient(() => {
      throw new LLMAuthError(401, 'unauthorized');
    });
    const result = await runOneTurn(client, 'hi', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBe(t('cli.error.auth', '401'));
      expect(result.error).toContain('认证失败');
    }
  });
});

/**
 * Sprint 1b: formatUsageStatus — 把 usage 翻译成人类可读一行
 * 给 REPL 状态栏 / print 退出 summary / RPC 顶层字段共用。
 *
 * 覆盖:
 * - undefined → null (不污染 stderr)
 * - 无 cached_tokens → 简版 (避免假数据)
 * - 满 usage → 完整 4 字段
 * - prompt=0 边界
 * - tokens_uncached 收敛时去冗余 (Hermes footer 教训)
 */
describe('formatUsageStatus (Sprint 1b)', () => {
  it('usage undefined → null (不污染 stderr)', () => {
    expect(formatUsageStatus(undefined)).toBeNull();
  });

  it('无 cached_tokens → 简版 "usage: 1.2k prompt / 200 completion"', () => {
    const line = formatUsageStatus({
      prompt_tokens: 1200,
      completion_tokens: 200,
      total_tokens: 1400,
    });
    expect(line).not.toBeNull();
    expect(line).toContain('usage:');
    expect(line).toContain('1.2k');
    expect(line).toContain('200');
    // 没 cache_hit_rate 时不显示 cache: 和 ¥
    expect(line).not.toContain('cache:');
    expect(line).not.toContain('¥');
  });

  it('满 usage → 完整 4 字段 "cache: 90% | ¥X.XXXX/turn | prompt Xk (Y new)"', () => {
    // P1 fix (2026-06-03): cost 公式从 ¥/token 改成 ¥/M, formatUsageStatus 走 < 0.01
    // 的 4 位小数分支. 输入 cost_turn = 0.0002 (能被 toFixed(4) 精确表达,
    // 不会被 IEEE 754 浮点舍入). 真实场景下 0.00018 / 0.00024 / 0.00008 这类都属此分支。
    const line = formatUsageStatus({
      prompt_tokens: 1000,
      completion_tokens: 100,
      total_tokens: 1100,
      cached_tokens: 900,
      cache_hit_rate: 0.9,
      cost_turn: 0.0002,
      tokens_uncached: 100,
    });
    expect(line).not.toBeNull();
    expect(line).toMatch(/cache: 90%/);
    expect(line).toMatch(/¥0\.0002/);
    expect(line).toMatch(/turn/);
    expect(line).toMatch(/prompt 1\.0k/);
    expect(line).toMatch(/100 new/);
  });

  it('tokens_uncached == prompt (全 miss, cache_hit_rate=0) 仍正常显示', () => {
    // 边界: cached=0, 但 cached_tokens 字段存在 (LLM 显式说 0)
    // P1 fix (2026-06-03): cost 缩小 1000×, 输入 0.0004 (4 位小数稳定展示)。
    const line = formatUsageStatus({
      prompt_tokens: 500,
      completion_tokens: 50,
      total_tokens: 550,
      cached_tokens: 0,
      cache_hit_rate: 0,
      cost_turn: 0.0004,
      tokens_uncached: 500,
    });
    expect(line).not.toBeNull();
    expect(line).toMatch(/cache: 0%/);
    // tokens_uncached == prompt, 显示 "500 new"
    expect(line).toMatch(/500 new/);
  });

  it('prompt < 1000 (单数字) 不带 k 后缀', () => {
    const line = formatUsageStatus({
      prompt_tokens: 50,
      completion_tokens: 20,
      total_tokens: 70,
    });
    expect(line).toMatch(/50 prompt/);
    expect(line).not.toMatch(/50\.0k/);
  });
});
