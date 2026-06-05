/**
 * REPL turn-guard builtin deny (D-19.6 P2)
 *
 * 还原 review finding 2026-06-05 P2: turnInFlight (chat turn 正在跑) 时,
 * 老逻辑 L373 注释"内建命令全部 fast-path, 不走 turnInFlight" 仍然跑 builtin
 * (e.g. /verify 调 runVerify + 写 verification event, /help 写 out + prompt,
 * /unknown 写 out + prompt), 跟 in-flight chat turn 输出/session 交错, 违背
 * "turn running 时下一行不进入 builtin/chat" 的 review 语义.
 *
 * 验收 (D-19.6 P2 修法):
 *   1. turnInFlight 时发 /verify, stdout 出现 deny 提示 (i18n cli.turn_in_flight_deny)
 *   2. session JSONL 无 verification event (D-19.5 /verify 路径不跑)
 *
 * 实现说明 (D-19.6): 用 inline 自建 mock, 不用 buildReplHarness. mock LLM client
 * 在 stream() 内 await 永不 resolve, 保持 turnInFlight=true. P2 守卫触发时
 * 不应调 runVerify (P2 期望 user_denied 0 出现).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, Writable } from 'node:stream';
import { startRepl } from '../../src/repl.js';
import { readSessionEvents } from '@deepwhale/core';
import type { LLMClient, ChatResult, ChatChunk, ModelId } from '@deepwhale/llm';
import { describe, it, expect } from 'vitest';

// mock client: stream() 永不 resolve, turnInFlight 一直 true.
function makeHangingClient(): LLMClient {
  return {
    model: 'mock-d196-p2-hang' as ModelId,
    async chat(): Promise<ChatResult> {
      throw new Error('not used');
    },
    async stream(
      _messages: ReadonlyArray<unknown>,
      _opts: { onChunk?: (chunk: ChatChunk) => void },
    ): Promise<ChatResult> {
      // 永远不 resolve -- turnInFlight 一直为 true
      await new Promise<never>(() => {});
      // unreachable, 但 TS 要 return
      return {
        model: 'mock-d196-p2-hang' as ModelId,
        content: '',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    },
  };
}

describe('REPL turn-guard builtin deny (D-19.6 P2)', () => {
  it('P2: turnInFlight 时 /verify 走 deny, stdout 含 i18n 提示, session 无 verification event', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-d196-p2-'));
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

    const client = makeHangingClient();

    let exitCode = 0;
    // 注 (D-19.6): exitCode 占位给 startRepl 退出码用, 避免默认 process.exit 杀测试进程.
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
      // 触发一个长跑 turn (mock 永不 resolve, turnInFlight 保持 true)
      input.write('please do the long thing\n');
      // 等 turn 真进入 in-flight 状态 (readline 派发 + stream() 进入 await)
      await new Promise((r) => setTimeout(r, 100));
      // turn 正在跑时, 立刻 /verify -- 期望 deny
      input.write('/verify\n');
      // 等 P2 守卫处理 /verify
      await new Promise((r) => setTimeout(r, 200));

      // 验收 1: stdout 出现 deny 提示 (i18n cli.turn_in_flight_deny: "turn running, wait for finish")
      const outStr = Buffer.concat(outChunks).toString();
      const denied =
        outStr.includes('turn running') || outStr.includes('wait for finish');
      expect(
        denied,
        `stdout 应含 deny 提示 (cli.turn_in_flight_deny), 实际: ${outStr.slice(0, 400)}`,
      ).toBe(true);

      // 验收 2: session 无 verification event (P2 守卫不调 runVerify, 不写 event)
      const events = await readSessionEvents(sessionPath);
      const verifyEvents = events.filter((e) => e.kind === 'verification');
      expect(
        verifyEvents,
        `turnInFlight 时 /verify 不应写 verification event, 实际 events: ${JSON.stringify(events.map((e) => e.kind))}`,
      ).toHaveLength(0);

      // 清理: 强制 end 让 REPL 退出. p 会因 hanging client 永远不 resolve,
      // 给个 timeout 避免测试 hang.
      input.end();
      await Promise.race([p, new Promise<void>((r) => setTimeout(r, 500))]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
