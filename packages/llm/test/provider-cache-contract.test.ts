/**
 * D-33.1.3 — DeepSeek wire-message serialization helper (test only).
 *
 * 拍板: chat() / stream() 内部的 `toWireMessage` 走私有路径, 真实 wire payload
 * 不能 0 测试覆盖 — 一旦以后改 toWireMessage 漏写某个分支, prefix-cache
 * hash 会变, cached_tokens 命中率雪崩.
 *
 * `serializeDeepSeekMessagesForTest(messages)` 是 re-export of the private
 * `toWireMessage` mapper — 跟 buildRequestBody 走同一份代码, 单测覆盖
 * 4 个机制:
 *   1. content: "" 永远序列化 (机制 2)
 *   2. reasoning_content 不打 wire (机制 3)
 *   3. canonical schema (机制 4) — 在 buildRequestBody 走 canonicalizeSchema
 *   4. tool_calls 必带 type:'function' 包装
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/types.js';
import { serializeDeepSeekMessagesForTest } from '../src/deepseek-client.js';

describe('deepseek provider cache contract helper (D-33.1.3)', () => {
  it('serializes empty content as an empty string (mechanism 2)', () => {
    const payload = serializeDeepSeekMessagesForTest([
      { role: 'assistant', content: '' },
    ]);
    expect(payload.messages[0]).toMatchObject({ content: '' });
    expect(JSON.stringify(payload)).toContain('"content":""');
  });

  it('serializes reasoning_content for assistant messages (Sprint 1c-revive-2-D-21.1 multi-turn V4 thinking fix)', () => {
    // 拍板: 2026-06-06 Sprint 1c-revive-2-D-21.1 修 DeepSeek V4 thinking 400 bug.
    // 旧 Sprint 1a "机制 3 简化" 把 reasoning_content 一律丢 wire, V4 默认开
    // thinking, 多轮必须回传上轮 reasoning, 否则 400 "reasoning_content must
    // be passed back to the API". 现行为: assistant 消息的 reasoning_content
    // **必** 透传 wire (Sprint 1c-revive-2 拍板). 非 assistant 消息不携带.
    //
    // 这条测试是**当前**契约 pin — 防 toWireMessage 退化回 1a 行为.
    const payload = serializeDeepSeekMessagesForTest([
      {
        role: 'assistant',
        content: 'answer',
        reasoning_content: 'private chain',
      } as unknown as ChatMessage,
    ]);
    const json = JSON.stringify(payload);
    expect(json).toContain('reasoning_content');
    expect(json).toContain('private chain');
  });

  it('does NOT leak reasoning_content to non-assistant messages', () => {
    // 反向断言: user / tool 消息**不**带 reasoning_content 字段, 哪怕上游注入.
    // (Sprint 1c-revive-2 拍板: 非 assistant 消息不携带 reasoning_content)
    const userPayload = serializeDeepSeekMessagesForTest([
      {
        role: 'user',
        content: 'hi',
        reasoning_content: 'leaked',
      } as unknown as ChatMessage,
    ]);
    expect(JSON.stringify(userPayload)).not.toContain('reasoning_content');
    expect(JSON.stringify(userPayload)).not.toContain('leaked');

    const toolPayload = serializeDeepSeekMessagesForTest([
      {
        role: 'tool',
        content: 'out',
        tool_call_id: 'c1',
        reasoning_content: 'leaked',
      } as unknown as ChatMessage,
    ]);
    expect(JSON.stringify(toolPayload)).not.toContain('reasoning_content');
  });

  it('serializes tool messages with tool_call_id', () => {
    const payload = serializeDeepSeekMessagesForTest([
      { role: 'tool', content: 'tool output', tool_call_id: 'call-1' },
    ]);
    expect(payload.messages[0]).toMatchObject({
      role: 'tool',
      content: 'tool output',
      tool_call_id: 'call-1',
    });
  });

  it('serializes user messages with content', () => {
    const payload = serializeDeepSeekMessagesForTest([
      { role: 'user', content: 'hi' },
    ]);
    expect(payload.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
  });
});
