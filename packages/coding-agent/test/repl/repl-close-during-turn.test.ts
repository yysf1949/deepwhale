/**
 * REPL close-during-turn race (D-19.6 P1)
 *
 * 还原 review finding 2026-06-05 P1: rl.close (Ctrl-D / EOF) 触发时, 如果
 * in-flight turn 还在跑工具调用, 老 finish() 立即关 writer, 后续 turn 内部
 * writer.append (user_denied 审计) 撞 'file closed', stderr 出现
 * "Unexpected error: Error: file closed".
 *
 * 验收 (D-19.6 P1 修法):
 *   1. close 触发后, stderr 无 'file closed'
 *   2. dismiss 路径必须落 user_denied 审计 (dismiss 先于 abort, D-19.5 红线)
 *
 * 实现说明 (D-19.6): 本测不依赖 buildReplHarness (它不接 err 通道), 改用
 * inline 自建, 跟 D-19.5 repl-shared-stdin.test.ts 现有 mock 模式对齐.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, Writable } from 'node:stream';
import { startRepl } from '../../src/repl.js';
import { readSessionEvents } from '@deepwhale/core';
import type { LLMClient, ChatResult, ChatChunk, ModelId } from '@deepwhale/llm';
import { describe, it, expect } from 'vitest';

// mock client: 跟 D-19 / D-19.5 同形, 第 1 轮返 tool call, 第 2 轮 stop.
// 写 write_file tool call 触 confirm prompt, 让 dismiss 路径可达.
function makeMockClient(toolCall: { id: string; name: string; args: Record<string, unknown> }): LLMClient {
  let turn = 0;
  return {
    model: 'mock-d196-p1' as ModelId,
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
          model: 'mock-d196-p1' as ModelId,
          content: '',
          tool_calls: [
            { id: toolCall.id, name: toolCall.name as never, args: toolCall.args },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      }
      opts.onChunk?.({ delta: { content: 'done' }, finish_reason: 'stop' } as unknown as ChatChunk);
      return {
        model: 'mock-d196-p1' as ModelId,
        content: 'done',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    },
  };
}

describe('REPL close-during-turn race (D-19.6 P1)', () => {
  it('P1: close 触发 in-flight turn 时, stderr 无 file closed, session 落 user_denied 审计', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-d196-p1-'));
    const target = join(dir, 'target.txt');
    const sessionPath = join(dir, 'session.jsonl');
    const input = new PassThrough();
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const output = new Writable({
      write(chunk: Buffer, _enc, cb): void {
        outChunks.push(chunk);
        cb();
      },
    });
    const err = new Writable({
      write(chunk: Buffer, _enc, cb): void {
        errChunks.push(chunk);
        cb();
      },
    });

    const client = makeMockClient({
      id: 'p1-close',
      name: 'write_file',
      args: { path: target, content: 'd19.6-p1' },
    });

    let exitCode = 0;
    // 注 (D-19.6): exitCode 占位给 harness startRepl 退出码用. startRepl 内部在
    // /exit 路径调 exit(code) (D-19.5 P1). 本测不直接断言 exitCode, 但需要 callback
    // 存在以避免 startRepl 走默认 process.exit (会杀测试进程).
    void exitCode;
    try {
      const p = startRepl({
        client,
        input,
        output,
        errorOutput: err,
        sessionPath,
        exit: (code: number = 0) => {
          exitCode = code;
          return undefined as never;
        },
      });
      await new Promise((r) => setImmediate(r));
      // 触发 confirm prompt
      input.write('please write to file\n');
      // 等 confirm 进入 pending (mock 同步返, confirm 内部 await)
      await new Promise((r) => setTimeout(r, 100));
      // 立刻关 stdin (模拟 Ctrl-D / EOF) -- race 老版本会撞 'file closed'
      input.end();
      // 给 turn 充分时间 drain (dismiss + abort + finally 收束)
      await new Promise((r) => setTimeout(r, 500));

      // 验收 1: stderr 无 'file closed' 错误
      const errStr = Buffer.concat(errChunks).toString();
      const fileClosedErrors = (errStr.match(/file closed/g) || []).length;
      expect(
        fileClosedErrors,
        `stderr 含 'file closed' x ${fileClosedErrors}: ${errStr.slice(0, 300)}`,
      ).toBe(0);

      // 验收 2: user_denied 仍被 audit 写入 session (dismiss 先于 abort, 走 user_denied)
      const events = await readSessionEvents(sessionPath);
      const userDenied = events.filter(
        (e) => e.kind === 'policy_decision' && e.decision === 'user_denied',
      );
      expect(
        userDenied.length,
        `dismiss 路径必须落 user_denied 审计, 实际 events: ${JSON.stringify(events.map((e) => e.kind))}`,
      ).toBeGreaterThanOrEqual(1);

      // 让 p 收束 (finally 走完后 startRepl 的 promise resolve).
      // === Sprint 1c-revive-3-D-19.6.1 (2026-06-05): Q4 修法 — timeout reject + 断言 p resolve ===
      // 拍板 (D-19.6.1, user review 2026-06-05 P2.2): D-19.6 P1 close 测试用
      // `Promise.race([p, new Promise(r => setTimeout(r, 1000))])`, timeout 也让
      // 测试继续通过, 不断言 p 真 resolve, fast-path finish 失败时假绿. 修法:
      // 跟 D-19.6 P3 (repl-shared-stdin.test.ts L278) 一样 — timeout reject
      // 显式失败, 然后断言 exitCode === 0 证明 p 真 resolve. 1s margin 推导:
      // P1 测试 main flow 500ms drain + finally 收束, 1s = 2x 安全边际.
      await Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('startRepl did not exit within 1s (D-19.6.1 Q4 修法)')),
            1000,
          ),
        ),
      ]);
      // 强断言: p 真 resolve 且 exit code = 0 (P3 同风格, 拒假绿).
      expect(exitCode, 'startRepl 必须 resolve 且 exit code = 0 (D-19.6.1 Q4)').toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
