/**
 * REPL shared-stdin 集成测 — Sprint 1c-revive-3-D-19 (2026-06-05).
 *
 * 覆盖 (D-19 §P2-test 修法, 补 D-15 测缺):
 *   - 1 个 PassThrough 当 input, 喂 startRepl 主 readline (不再独立给 confirm).
 *   - 验证 'y' 不被主 readline 当新 chat turn (P1 修法端到端).
 *   - 验证 'n' 拒绝 + 工具不执行 + 落 user_denied.
 *   - 验证 SIGINT/turn AbortController dismiss in-flight confirm (P2-Ctrl+C 端到端).
 *
 * 拍板 (D-19): 这条测在 D-15 不存在, 因为 D-15 测用独立 PassThrough 只喂 confirm,
 * 测不到主 rl.on('line') 抢行. D-19 commit 1 改完 controller 后, 这里验证主 rl
 * + confirm controller 串行化契约.
 *
 * 拍板 (D-19): 不验真 readline / 不写 process 信号. mock 一切. Ctrl+C 行为通过
 * turnAbortController.abort() 直接模拟 (repl.ts 把这个 controller 闭包暴露在
 * 测试环境走 SIGINT 路径 — 不暴露, 我们改测 tool-loop-policy 验 signal 链路).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import type { LLMClient, ChatResult, ChatChunk, ModelId } from '@deepwhale/llm';
import { startRepl } from '../../src/repl.js';
import { readSessionEvents } from '@deepwhale/core';

/** mock LLM client: 第 1 轮返 tool call, 第 2 轮返 'done'. 跟 D-15 mock 同形. */
function makeToolCallingClient(toolCall: {
  id: string;
  name: string;
  args: Record<string, unknown>;
}): LLMClient {
  let turn = 0;
  return {
    model: 'mock-d19' as ModelId,
    async chat(): Promise<ChatResult> {
      throw new Error('not used');
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
          model: 'mock-d19' as ModelId,
          content: '',
          tool_calls: [
            { id: toolCall.id, name: toolCall.name as never, args: toolCall.args },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      }
      opts.onChunk?.({ delta: { content: 'done' }, finish_reason: 'stop' } as unknown as ChatChunk);
      return {
        model: 'mock-d19' as ModelId,
        content: 'done',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    },
  };
}

interface ReplHarness {
  start: () => Promise<number>;
  write: (line: string) => void;
  exit: () => void;
  outChunks: string;
  sessionPath: string;
}

function buildReplHarness(toolCall: {
  id: string;
  name: string;
  args: Record<string, unknown>;
}): ReplHarness {
  const dir = mkdtempSync(join(tmpdir(), 'dw-repl-shared-'));
  const sessionPath = join(dir, 'session.jsonl');
  const input = new PassThrough();
  const outChunks: Buffer[] = [];
  const output = new Writable({
    write(chunk: Buffer, _enc, cb) {
      outChunks.push(chunk);
      cb();
    },
  });
  // 拍板 (D-19): startRepl 默认不依赖真 stdin, 但默认用 process.stdin / stdout
  // 跑 greeting. 注入 input/output 后仍然跑 greeting (写 out). 单测只关心
  // session 落盘 + prompt + confirm 行为.
  const client = makeToolCallingClient(toolCall);
  let exitCode = 0;

  const start = async (): Promise<number> => {
    // 拍板 (D-19): startRepl 是 async 永不 resolve, 我们靠 /exit + process.exit
    // 拿到退出码. 但 startRepl 内部调 process.exit 默认, 单测要传 exit: (c) => { exitCode = c; finished = true; }
    await startRepl({
      client,
      input,
      output,
      sessionPath,
      // startRepl 内部 await writer.open() 才能写 session; 注入一个已经 open 的 writer
      // 走现有契约: sessionPath 字段走 startRepl 内部 open, 我们不开第二个. 等等 —
      // 实际 startRepl 内部 if (writer && reader) 走 loadSession, 跟注入 writer 无关.
      // 验证: sessionPath → startRepl 自开 writer, 我们从 sessionPath 读 events.
      // 拍板 (D-19): startRepl 内部 await writer.close() 还在跑, 不能 throw.
      // 用 throw + 捕 (startRepl exit 被传成 caller, 真 exit 不被调, 闭包靠 promise resolve 退出).
      // 简化: 只存 exitCode, finished 状态由 caller 通过检查 exitCode != 0 推断.
      exit: (code: number = 0) => {
        exitCode = code;
        return undefined as never;
      },
    });
    return exitCode;
  };

  return {
    start,
    write: (line: string) => {
      input.write(`${line}\n`);
    },
    exit: () => {
      input.write('/exit\n');
    },
    get outChunks() {
      return Buffer.concat(outChunks).toString();
    },
    sessionPath,
  };
}

describe('REPL shared-stdin (D-19)', () => {
  it('y 不入 chat, 工具真执行, session 落 user_approved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-shared-y-'));
    const target = join(dir, 'target.txt');
    const harness = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'shared-stdin-yes' },
    });

    try {
      // 启动 REPL (永不 resolve, 我们手动 exit)
      const p = harness.start();
      // 排空 greeting 之类的初始 out
      await new Promise((r) => setImmediate(r));
      // 用户先发 chat 触发 mock client 走 tool call
      harness.write('please write to file');
      // 等 tool loop 走到 confirm prompt (mock 同步返, 但 prompt 写 out 在 confirm 内部)
      // 给一些微任务 + macrotask 时间让 confirm 进入 pending
      await new Promise((r) => setTimeout(r, 100));
      // 用户敲 y → 走 D-19 confirmController 串行化, 工具真执行
      harness.write('y');
      // 工具执行完 + prompt 回来, 用户 /exit
      await new Promise((r) => setTimeout(r, 100));
      harness.exit();
      // 给 startRepl 时间 close
      await new Promise((r) => setTimeout(r, 100));

      // 验证 1: 工具真落盘
      expect(existsSync(target)).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('shared-stdin-yes');

      // 验证 2: session 落 user_approved (跟 D-15 测契约一致)
      // 注意: harness.start() 永远在 await, 我们用 p.catch 防 unhandled
      p.catch(() => {});
      const events = await readSessionEvents(harness.sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents.length).toBeGreaterThanOrEqual(1);
      const ev = policyEvents.find((e) => e.kind === 'policy_decision' && e.decision === 'user_approved');
      expect(ev, '应该落 user_approved event').toBeDefined();

      // 验证 3: P1 修法 — y 不入 workingMessages 当新 chat turn
      const userEvents = events.filter((e) => e.kind === 'user');
      // 期望: 1 个 user event = 'please write to file' (mock 第 1 轮 user input)
      // 关键: 'y' 不应该作为独立 user event 落 (D-15 P1 会出现 2 个 user event)
      const userContents = userEvents.map((e) => (e.kind === 'user' ? e.content : ''));
      expect(userContents).toContain('please write to file');
      expect(userContents).not.toContain('y');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('n 拒绝, 工具不执行, session 落 user_denied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-shared-n-'));
    const target = join(dir, 'target.txt');
    const harness = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'should-not-write' },
    });

    try {
      const p = harness.start();
      await new Promise((r) => setImmediate(r));
      harness.write('please write to file');
      await new Promise((r) => setTimeout(r, 100));
      harness.write('n');
      await new Promise((r) => setTimeout(r, 100));
      harness.exit();
      await new Promise((r) => setTimeout(r, 100));

      // 验证 1: 工具不执行
      expect(existsSync(target)).toBe(false);

      // 验证 2: session 落 user_denied
      p.catch(() => {});
      const events = await readSessionEvents(harness.sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      const ev = policyEvents.find((e) => e.kind === 'policy_decision' && e.decision === 'user_denied');
      expect(ev, '应该落 user_denied event').toBeDefined();

      // 验证 3: n 不入 workingMessages
      const userEvents = events.filter((e) => e.kind === 'user');
      const userContents = userEvents.map((e) => (e.kind === 'user' ? e.content : ''));
      expect(userContents).toContain('please write to file');
      expect(userContents).not.toContain('n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
