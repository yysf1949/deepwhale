/**
 * D-33.1.3 — Anthropic wire-message serialization helper (test only).
 *
 * 跟 DeepSeekProvider 对称: `serializeAnthropicMessagesForTest` 暴露
 * `toAnthropicMessages` 内部转换给单测覆盖. Anthropic 协议 4 个关键转换:
 *   1. system 消息抽到顶层 `system` 字段
 *   2. OAI tool 消息 (N 条) → Anthropic 1 条 user + N 个 tool_result blocks
 *   3. OAI assistant tool_calls → Anthropic content blocks (text + tool_use)
 *   4. OAI tool schema {parameters} → Anthropic {input_schema}
 */
import { describe, expect, it } from 'vitest';
import { serializeAnthropicMessagesForTest } from '../src/anthropic-client.js';

describe('anthropic provider cache contract helper (D-33.1.3)', () => {
  it('extracts system messages to top-level system field', () => {
    const payload = serializeAnthropicMessagesForTest([
      { role: 'system', content: 'be concise' },
      { role: 'user', content: 'hi' },
    ]);
    expect(payload.system).toBe('be concise');
    // system 不进 messages 列表
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.role).toBe('user');
  });

  it('merges consecutive tool messages into one user message with tool_result blocks', () => {
    const payload = serializeAnthropicMessagesForTest([
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', name: 'x', args: {} }] },
      { role: 'tool', content: 'out1', tool_call_id: 'c1' },
      { role: 'tool', content: 'out2', tool_call_id: 'c2' },
    ]);
    // 1 assistant (tool_use) + 1 user (merged tool_results) = 2 messages
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[1]?.role).toBe('user');
    const blocks = payload.messages[1]?.content as Array<{ type: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe('tool_result');
    expect(blocks[1]?.type).toBe('tool_result');
  });

  it('translates OAI tool_calls to Anthropic tool_use blocks', () => {
    const payload = serializeAnthropicMessagesForTest([
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'c1', name: 'read_file', args: { path: '/x' } }],
      },
    ]);
    expect(payload.messages).toHaveLength(1);
    const blocks = payload.messages[0]?.content as Array<{ type: string; name?: string }>;
    expect(blocks[0]?.type).toBe('tool_use');
    expect(blocks[0]?.name).toBe('read_file');
  });

  it('remaps OAI tool schema parameters → input_schema', () => {
    const payload = serializeAnthropicMessagesForTest(
      [{ role: 'user', content: 'hi' }],
      [
        {
          name: 'read',
          description: 'read',
          parameters: { type: 'object', properties: { path: { type: 'string', description: 'p' } } },
        },
      ],
    );
    expect(payload.tools).toHaveLength(1);
    const tool = payload.tools?.[0];
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('read');
    expect(tool?.input_schema).toBeDefined();
  });
});
