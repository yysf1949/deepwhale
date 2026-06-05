/**
 * REPL + 真 policy.confirm 端到端 — Sprint 1c-revive-3-D-15 (2026-06-05).
 *
 * 覆盖 (D-15 验收):
 *   - REPL turn + 真 policy.confirm 注入 + 用户输 y → 工具真落盘 + 落 user_approved
 *   - REPL turn + 真 policy.confirm 注入 + 用户输 n → 工具不执行 + 落 user_denied
 *   - REPL turn + 真 policy.confirm 注入 + 用户空输入 → 工具不执行 + 落 user_denied
 *
 * 拍板 (D-15 plan §Risk R-4): 不用真 stdin (REPL 端 replConfirm 走真 readline,
 * 端到端真 stdin 留给 manual 测). 这里**用真** `createReplConfirm({ input: PassThrough, output: PassThrough })`
 * 工厂 + mock PassThrough input push "y"/"n"/empty, 验证**整链路契约**:
 *   createReplConfirm → ToolPolicy.confirm → runToolLoop.confirm 调 → 落 user_approved/denied → 工具真/不执行
 *
 * 跟 Task 1 unit 测的差异: Task 1 只测 createReplConfirm 工厂本身 (prompt 格式 + 输入识别);
 * 这里测 createReplConfirm + runToolLoop 的**集成契约** (跟 D-13.5 重排红线和 user_approved
 * 审计兼容).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { LLMClient, ChatResult, ChatChunk, ModelId } from '@deepwhale/llm';
import { runToolLoop } from '../../src/agent/index.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { staticToolPolicy } from '../../src/policy/static-rules.js';
import type { ToolPolicy } from '../../src/policy/types.js';
import { SessionWriter, readSessionEvents } from '@deepwhale/core';
import { createReplConfirm } from '../../src/repl/repl-confirm.js';

function makeMockClient(toolCall: {
  id: string;
  name: string;
  args: Record<string, unknown>;
}): LLMClient {
  let turn = 0;
  return {
    model: 'mock-d15' as ModelId,
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
          model: 'mock-d15' as ModelId,
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
        model: 'mock-d15' as ModelId,
        content: 'done',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    },
  };
}

function getToolStepResult(
  result: Awaited<ReturnType<typeof runToolLoop>>,
): { success: boolean; error?: string } | null {
  const toolStep = result.steps.find((s) => s.kind === 'tool');
  return toolStep && toolStep.kind === 'tool' ? toolStep.result : null;
}

function buildPolicyWithInput(): {
  policy: ToolPolicy;
  pushAnswer: (line: string) => void;
  endInput: () => void;
} {
  // Sprint 1c-revive-3-D-19 (2026-06-05): createReplConfirm 现在返 controller, 不再读 input.
  // test 用 controller.offerLine 喂答案 (跟 REPL 主 rl.on('line') 行为一致). 保留 input
  // PassThrough 给 pushAnswer / endInput (向后兼容 caller 写法) — 实际 D-19 controller
  // 不读 input, 写进去也不消费.
  const input = new PassThrough();
  const output = new PassThrough(); // 吃掉 prompt 字符串避免污染 test output
  output.on('data', () => {});
  const controller = createReplConfirm({ output });
  const policy: ToolPolicy = { ...staticToolPolicy, confirm: controller.confirm };
  return {
    policy,
    pushAnswer: (line: string) => {
      // 拍板 (D-19): 跟 REPL 主 rl 行为一致, offerLine 喂给 controller.
      // 红线: 必须在 confirm 之后调 offerLine (异步时序), 见 setImmediate 包装.
      setImmediate(() => controller.offerLine(line));
    },
    endInput: () => {
      // 拍板 (D-19): 端到端不再依赖 EOF, dismiss 强制 resolve null (D-15 测了 EOF 分支,
      // D-19 controller 没 readline, input.end() 不触发 dismiss — 改用 controller.dismiss).
      controller.dismiss();
      input.end();
    },
  };
}

describe('REPL + 真 policy.confirm 端到端 (D-15)', () => {
  it('用户输 y → write_file 真落盘 + session 落 user_approved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-d15-'));
    try {
      const target = join(dir, 'target.txt');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      const { policy, pushAnswer } = buildPolicyWithInput();
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'y-yes' },
      });
      setImmediate(() => pushAnswer('y'));
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy,
        isInteractive: true, // REPL
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具真执行
      expect(toolResult!.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('y-yes');
      // (2) session 落 user_approved (D-15 contract)
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.reason).toBe('user approved');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('用户输 n → 工具不执行 + session 落 user_denied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-d15-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'original');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      const { policy, pushAnswer } = buildPolicyWithInput();
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'n-no' },
      });
      setImmediate(() => pushAnswer('n'));
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy,
        isInteractive: true, // REPL
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具不执行
      expect(toolResult!.success).toBe(false);
      expect(toolResult!.error).toMatch(/policy_blocked: user denied confirmation/);
      expect(readFileSync(target, 'utf8')).toBe('original');
      // (2) session 落 user_denied (D-15 contract)
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_denied');
        expect(ev.reason).toBe('user denied');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('用户空输入 (默认 N) → 工具不执行 + session 落 user_denied (dismissed)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-d15-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'original');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      const { policy, endInput } = buildPolicyWithInput();
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'empty' },
      });
      // 模拟用户 Ctrl+D / EOF → createReplConfirm 返 null (dismissed)
      setImmediate(() => endInput());
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy,
        isInteractive: true, // REPL
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具不执行
      expect(toolResult!.success).toBe(false);
      expect(toolResult!.error).toMatch(/policy_blocked: user dismissed confirmation/);
      expect(readFileSync(target, 'utf8')).toBe('original');
      // (2) session 落 user_denied (dismissed, D-15 contract)
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_denied');
        expect(ev.reason).toBe('user dismissed');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
