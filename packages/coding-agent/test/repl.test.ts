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
import { runOneTurn } from '../src/repl.js';

// ---- 工具：mock LLMClient ----

function makeMockClient(responder: (messages: ChatMessage[]) => Promise<ChatResult> | ChatResult): LLMClient {
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
    expect(client.chat).toHaveBeenCalledWith(expect.any(Array), ac.signal);
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
