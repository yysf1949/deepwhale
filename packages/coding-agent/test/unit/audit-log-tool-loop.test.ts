/**
 * AuditLog tool-loop integration unit test — D-88 v5.0 observability + auditability.
 *
 * After D-87 produced the AuditLog seed (in-memory class + 1 test), D-88 wires
 * the log into runToolLoop so real tool-call and tool-result events flow into
 * the audit log. This is the v5.0 observability "first useful" sub-sprint.
 *
 * The test verifies the 3 emit points (tool-call, tool-result, loop-end) and
 * the order/structure of the captured events.
 */

import { describe, expect, it, vi } from 'vitest';
import { runToolLoop } from '../../src/agent/tool-loop.js';
import { AuditLog } from '../../src/observability/audit-log.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { Tool, ToolResult } from '../../src/types.js';
import type { ChatMessage, ChatResult, LLMClient, ModelId, ToolCall } from '@deepwhale/llm';

// ---- minimal LLM mock (echo tool then stop) ----
function mockClient(responses: ReadonlyArray<ChatResult>): LLMClient {
  let idx = 0;
  return {
    model: 'mock' as ModelId,
    chat: vi.fn(async (): Promise<ChatResult> => {
      const r = responses[idx];
      if (!r) throw new Error(`mockClient: no response at index ${idx}`);
      idx += 1;
      return r;
    }),
  } as unknown as LLMClient;
}

function okResult(content: string, toolCalls: ReadonlyArray<ToolCall> = []): ChatResult {
  const r: ChatResult = {
    model: 'mock' as ModelId,
    content,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
  };
  if (toolCalls.length > 0) r.tool_calls = toolCalls;
  return r;
}

function tc(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id, name, args };
}

function echoTool(): Tool {
  return {
    name: 'echo' as Tool['name'],
    description: 'returns args.text',
    risk: 'low',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'text to echo' },
      },
      required: ['text'],
    },
    execute: vi.fn(async (input): Promise<ToolResult> => {
      const text = String(input['text'] ?? '');
      return { success: true, content: `echo: ${text}` };
    }),
  };
}

describe('AuditLog tool-loop integration (D-88 v5.0 observability+auditability)', () => {
  it('captures tool-call, tool-result, and loop-end events from runToolLoop (D-88 v5.0 integration)', async () => {
    // 2-turn script: 1 tool call (echo 'hi') + 1 final text stop.
    const client = mockClient([
      okResult('', [tc('tc-1', 'echo', { text: 'hi' })]),
      okResult('done'),
    ]);
    const reg = new ToolRegistry();
    reg.register(echoTool());
    const auditLog = new AuditLog();
    const messages: ReadonlyArray<ChatMessage> = [
      { role: 'user', content: 'say hi' },
    ];

    await runToolLoop(client, messages, { registry: reg, auditLog });

    // Audit log captured 3 events: tool-call, tool-result, loop-end.
    // Order is significant: tool-call BEFORE tool-result, both BEFORE loop-end.
    const events = auditLog.getEvents();
    expect(events).toHaveLength(3);

    expect(events[0]).toMatchObject({
      kind: 'tool-call',
      payload: { name: 'echo' },
    });
    expect(events[1]).toMatchObject({
      kind: 'tool-result',
      payload: { name: 'echo', ok: true },
    });
    expect(events[2]).toMatchObject({
      kind: 'loop-end',
      payload: { toolCalls: 1 },
    });

    // Timestamps are monotonically non-decreasing.
    expect(events[1]!.timestamp).toBeGreaterThanOrEqual(events[0]!.timestamp);
    expect(events[2]!.timestamp).toBeGreaterThanOrEqual(events[1]!.timestamp);
  });
});
