/**
 * tool-loop policy 集成测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 *
 * 覆盖 (D-13 验收红线):
 *   - 默认情况下 agent 不能无确认执行 destructive write/bash
 *   - 非交互模式不能假装确认 (print/rpc)
 *   - --yes 明确可追踪 (bypass require_confirmation, 不 bypass deny)
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LLMClient, ChatResult, ChatChunk, ModelId } from '@deepwhale/llm';
import { runToolLoop } from '../../src/agent/index.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { staticToolPolicy } from '../../src/policy/static-rules.js';
import type { ToolPolicy, PolicyDecision } from '../../src/policy/types.js';
import { SessionWriter, readSessionEvents } from '@deepwhale/core';

/** mock LLMClient: 第 1 turn 返 tool_call, 第 2 turn 返 content. */
function makeMockClient(toolCall: {
  id: string;
  name: string;
  args: Record<string, unknown>;
}): LLMClient {
  let turn = 0;
  return {
    model: 'mock-d13' as ModelId,
    async chat(): Promise<ChatResult> {
      throw new Error('not used (we use stream)');
    },
    async stream(
      _messages: ReadonlyArray<unknown>,
      opts: { onChunk?: (chunk: ChatChunk) => void },
    ): Promise<ChatResult> {
      turn += 1;
      if (turn === 1) {
        opts.onChunk?.({
          delta: {
            content: '',
            tool_calls: [
              { id: toolCall.id, name: toolCall.name, args: JSON.stringify(toolCall.args) },
            ],
          },
          finish_reason: 'tool_calls',
        } as unknown as ChatChunk);
        return {
          model: 'mock-d13' as ModelId,
          content: '',
          tool_calls: [
            {
              id: toolCall.id,
              name: toolCall.name as never,
              args: toolCall.args,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      }
      opts.onChunk?.({ delta: { content: 'done' }, finish_reason: 'stop' } as unknown as ChatChunk);
      return {
        model: 'mock-d13' as ModelId,
        content: 'done',
        tool_calls: [],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      };
    },
  };
}

type StepResult = { success: boolean; error?: string };

function getToolStepResult(result: { steps: ReadonlyArray<unknown> }): StepResult | null {
  for (const s of result.steps) {
    if (s && typeof s === 'object' && 'kind' in s && (s as { kind: string }).kind === 'tool') {
      const t = s as { result: StepResult };
      return t.result;
    }
  }
  return null;
}

describe('tool-loop policy integration (D-13)', () => {
  it('write_file + isInteractive=false + yes=false → policy_blocked (no interactive confirmation), 文件未被覆盖', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'old content');

      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'new content' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: false,
        yes: false,
        onChunk: () => {},
      });

      const toolResult = getToolStepResult(result);
      expect(toolResult).not.toBeNull();
      expect(toolResult!.success).toBe(false);
      expect(toolResult!.error).toMatch(/policy_blocked/);

      // 拍板红线: 文件**没**被覆盖
      expect(readFileSync(target, 'utf8')).toBe('old content');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('write_file + isInteractive=true + yes=true → 真写文件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'target.txt');
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'new' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: true,
        yes: true,
        onChunk: () => {},
      });

      const toolResult = getToolStepResult(result);
      expect(toolResult!.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('new');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deny 永远不 bypass (yes=true + deny → 仍 deny)', async () => {
    const denyAll: ToolPolicy = {
      evaluate: (): PolicyDecision => ({ decision: 'deny', reason: 'mock-deny' }),
    };
    const client = makeMockClient({
      id: 'c1',
      name: 'bash',
      args: { command: 'rm', args: ['-rf', '/'] },
    });
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: denyAll,
      isInteractive: true,
      yes: true, // yes 不 bypass deny
      onChunk: () => {},
    });
    const toolResult = getToolStepResult(result);
    expect(toolResult!.success).toBe(false);
    expect(toolResult!.error).toMatch(/policy_blocked: mock-deny/);
  });

  it('bash rm -rf / + isInteractive=false → BashTool 自身 allowlist/pattern block 拦下, 走 permission-denied (双层防御)', async () => {
    // 拍板 (D-13): BashTool 在 v1.0 就有 allowlist + dangerous pattern 双重防御,
    // tool-loop policy 这层是**第二道防线** (BashTool 已拦的 cmd 走不到 policy layer).
    // 这条测试覆盖 BashTool 自己的 deny 行为, 确保 defense-in-depth 仍有效.
    const client = makeMockClient({
      id: 'c1',
      name: 'bash',
      args: { command: 'rm', args: ['-rf', '/'] },
    });
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: staticToolPolicy,
      isInteractive: false,
      yes: false,
      onChunk: () => {},
    });
    const toolResult = getToolStepResult(result);
    expect(toolResult!.success).toBe(false);
    // BashTool 自身拦: permission-denied: ... (走 'rm' 不在 allowlist 路径)
    expect(toolResult!.error).toMatch(/permission-denied/);
  });

  it('bash rm -rf / + isInteractive=true + yes=true → require_confirmation bypassed → 工具真执行', async () => {
    // yes=true bypass require_confirmation. 即便 bash 工具自身拍 require_confirmation,
    // tool-loop 的 policy 决策是 allow, tool 真执行.
    const client = makeMockClient({
      id: 'c1',
      name: 'bash',
      args: { command: 'rm', args: ['-rf', '/'] },
    });
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: staticToolPolicy,
      isInteractive: true,
      yes: true,
      onChunk: () => {},
    });
    const toolResult = getToolStepResult(result);
    // 工具**真的执行了** (没被 policy_blocked). 即便 exit code != 0
    expect(toolResult!.error ?? '').not.toMatch(/policy_blocked/);
  });

  it('read_file: policy allow → 工具真跑, 不写 session (allow 不刷爆 JSONL)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'r.txt');
      writeFileSync(target, 'hi');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();

      const client = makeMockClient({
        id: 'c1',
        name: 'read_file',
        args: { path: target },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: true,
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      expect(toolResult!.success).toBe(true);
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      // 0 policy_decision events (allow 不写)
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('write_file deny → session 落 policy_decision event (deny + argsDigest + reason), 字段完整', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'target.txt');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();

      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'new' },
      });
      await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: false,
        yes: false,
        writer,
        onChunk: () => {},
      });
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('deny');
        expect(ev.tool_call_id).toBe('c1');
        expect(ev.name).toBe('write_file');
        expect(ev.argsDigest).toMatch(/^sha256:[a-f0-9]{12}$/);
        expect(ev.reason).toMatch(/non-interactive/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('policy: null → 完全跳过 policy check (向后兼容, 旧测试用)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'r.txt');
      writeFileSync(target, 'hi');
      const client = makeMockClient({
        id: 'c1',
        name: 'read_file',
        args: { path: target },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: null, // 显式 null 跳过
        isInteractive: false,
        yes: false,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      expect(toolResult!.success).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
