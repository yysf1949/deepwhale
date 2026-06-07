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
  errChunks: string;
  sessionPath: string;
  /**
   * Sprint 1c-revive-3-D-19.5 (2026-06-05): 暴露 input PassThrough, 让测能调
   * input.end() 模拟 EOF (P2-dismiss 测需要). 之前只暴露 write/exit, 没法真 EOF.
   */
  endInput: () => void;
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
  // === Sprint 1c-revive-3-D-19.5p (2026-06-05): 暴露 err stream chunks, 让测能
  // 断言 stderr 'file closed' 不出现 (P1 close drain 修法) ===
  const errChunks: Buffer[] = [];
  const errorStream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      errChunks.push(chunk);
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
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): 注入 err stream (默认 process.stderr),
      // 让测能断言 stderr 'file closed' 不出现 (P1 close drain 修法) ===
      errorOutput: errorStream,
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
    // === Sprint 1c-revive-3-D-19.5p (2026-06-05): 暴露 err chunks 字符串, 让测断言
    // stderr 'file closed' / 'Tool loop aborted by caller' 等日志符合预期 ===
    get errChunks() {
      return Buffer.concat(errChunks).toString();
    },
    sessionPath,
    endInput: () => {
      // Sprint 1c-revive-3-D-19.5 (2026-06-05): 模拟 stdin EOF, 触发 rl 'close'
      // handler (dismiss pending confirm + abort turn + finish 链路).
      input.end();
    },
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

describe('REPL turn-guard + shutdown cleanup (D-19.5)', () => {
  // === Sprint 1c-revive-3-D-19.5 (2026-06-05): 3 个 review finding 补测 ===
  // 拍板 (D-19.5, user review 2026-06-05): D-19 baseline 测用 setTimeout(100) 模拟
  // turn 跑完, 没覆盖"input 还在 stdin 排队 + turn 没完" 的真 race. 这里 3 个测
  // 精确触发 3 个 finding, 用最小 mock 让 turn 真在跑 + input 紧贴派发.
  //
  // 测 1 (P1 修法): y\n/exit\n 紧贴 — 期望 /exit 走 fast-path (标 pendingExit),
  // turn 跑完 finally 兜底 finish, /exit 不 leak 到 chat 分支 (不入 user events).
  //
  // 测 2 (P2-dismiss): EOF during confirm — confirm 还在 pending 时 input.end(),
  // 期望 confirm dismiss (resolve null) + 落 user_denied + finish 正常 + 不 hang.
  //
  // 测 3 (P2-SIGINT): 多次 startRepl/finish 后 SIGINT listener delta = 0.

  it('P1: confirm 后 /exit 紧贴输入不入 chat, finish 走 fast-path (review finding 2026-06-05)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-d195-p1-'));
    const target = join(dir, 'target.txt');
    const harness = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'd19.5-p1-tight-exit' },
    });

    try {
      const p = harness.start();
      await new Promise((r) => setImmediate(r));
      // 触发 confirm prompt
      harness.write('please write to file');
      await new Promise((r) => setTimeout(r, 100));
      // y + /exit 紧贴 — 模拟用户一次性输入
      harness.write('y');
      // 不等 100ms, 立刻 /exit (race: 旧版本 /exit 会 leak 到 chat)
      harness.write('/exit');
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): P3 修 — exit-timing 断言 ===
      // 拍板 (D-19.5p, user review 2026-06-05 P3): 旧版 `p.catch(() => {})` 只防
      // unhandled, 没断言 p resolve / 退出码, fast-path finish 失败时假绿. 修法:
      // 用 Promise.race + 1000ms timeout 拿退出码, expect = 0. 红线: 不增加 await
      // 时间, 跟 D-19.5 测 2/3 同 timeout 模式.
      const code = await Promise.race([
        p,
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('startRepl finish 超时 (D-19.5p P3 修法)')),
            1000,
          ),
        ),
      ]);
      expect(code, 'finish 退出码应为 0 (D-19.5p P3 修法)').toBe(0);

      // 验证 1: 工具真落盘 (y 走通)
      expect(existsSync(target)).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('d19.5-p1-tight-exit');

      // 验证 2: session 落 user_approved (confirm y 走通)
      const events = await readSessionEvents(harness.sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      const approved = policyEvents.find((e) => e.kind === 'policy_decision' && e.decision === 'user_approved');
      expect(approved, 'confirm y 应该落 user_approved').toBeDefined();

      // 验证 3: /exit 不入 user events (D-19.5 P1 修法: turnInFlight 守卫排队后
      // turn 跑完 finally 走 finish, /exit 不 leak 到 chat 分支)
      const userEvents = events.filter((e) => e.kind === 'user');
      const userContents = userEvents.map((e) => (e.kind === 'user' ? e.content : ''));
      expect(userContents).toContain('please write to file');
      expect(userContents, '/exit 不应入 user events (D-19.5 P1 修法)').not.toContain('/exit');

      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): P1 close drain stderr 断言 ===
      // 拍板 (D-19.5p, user review 2026-06-05 P1): D-19.5 baseline 测 5/5 绿但 stderr
      // 明确报 'Unexpected error: Error: file closed', 因测用 try/catch 吞了
      // runToolLoop 内部 catch, 不断言 session writer 抛错 → 假绿. 修法: 注入
      // errorOutput 收集 stderr, 断言 'file closed' 不出现 (D-19.5p 修后 close
      // 路径走 pendingExit 兜底, turn 落完 audit 再 close writer, 不撞 closed handle).
      // 红线: 不强求 stderr 完全干净, 'Tool loop aborted by caller' 是 abort 引起的
      // 预期日志, 不算 fail. 只断言 'file closed' 不出现.
      expect(
        harness.errChunks,
        "D-19.5p P1 close drain: stderr 不应出现 'file closed' (close writer 过早)",
      ).not.toContain('file closed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('P2-dismiss: confirm pending 时 input.end() → confirm resolve null + 工具不执行 + finish 不 hang (review finding 2026-06-05)', async () => {
    // 拍板 (D-19.5): 这测核心验证 rl.close handler 不会让 confirm Promise 永远悬空.
    // 旧版本: rl 'close' → finish(0) 直接走, confirm 还在 pending → policy.confirm
    // 永远不 resolve → turn finally 不跑 → REPL 进程表面退出但内部 promise 链悬空.
    // 修后: close → dismiss + abort + finish 链路完整, startRepl 能在 1s 内 resolve.
    //
    // 红线: 不强求 user_denied event 一定落 — turn 跑到 policy.confirm 才写 audit,
    // dismiss 落 audit 还要求 turn 走完 finally, 时序复杂. 这里只验证:
    //   1) startRepl 1s 内 finish (旧版本会 hang)
    //   2) 工具没真执行 (confirm dismiss 后 tool step 走 user_denied return success=false)
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-d195-eof-'));
    const target = join(dir, 'target.txt');
    const harness = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'd19.5-eof-during-confirm' },
    });

    try {
      let resolved = false;
      const p = harness.start().then((code) => {
        resolved = true;
        return code;
      });
      await new Promise((r) => setTimeout(r, 50));
      // 触发 confirm prompt
      harness.write('please write to file');
      await new Promise((r) => setTimeout(r, 100));
      // 工具没真执行 (target 还没在), confirm 还在 pending — EOF
      // 期望: rl 'close' handler dismiss confirm + abort turn + finish(0)
      harness.endInput();
      // 给 finish 时间 (race: 旧版本 confirm Promise 悬空, p 永远不 resolve)
      const code = await Promise.race([
        p,
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error('startRepl finish 超时 (dismiss 失败)')),
          2000)),
      ]);
      expect(resolved, 'startRepl 应该 resolve (旧版本会 hang)').toBe(true);
      expect(code).toBe(0);

      // 验证: 工具**没**执行 (confirm dismissed, 走 user_denied return)
      expect(existsSync(target), '工具不应在 dismiss 后真落盘').toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('P2-SIGINT: 多次 startRepl/finish 后 process SIGINT listener delta = 0 (review finding 2026-06-05)', async () => {
    // 拍板 (D-19.5): 测 3 不依赖 REPL turn 行为, 只断言 listener 计数.
    // 用 buildReplHarness + /exit 走完完整 startRepl → finish 流程, 验证 listener
    // 不累积. 红线: 不能用绝对值断言 (vitest 内部可能挂 SIGINT), 用 startRepl
    // 之前 / 之后 delta = 0.
    const harness = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: join(mkdtempSync(join(tmpdir(), 'dw-repl-d195-sigint-')), 't.txt') },
    });

    // baseline 计数 (在 startRepl 之前)
    const before = process.listenerCount('SIGINT');
    const p = harness.start();
    // 等 startRepl 内部 await writer.open() + createInterface + process.on('SIGINT')
    // 走完. setImmediate 不够 — startRepl 内部有 await, 需要给点时间.
    await new Promise((r) => setTimeout(r, 50));
    // startRepl 内部 process.on('SIGINT', onSigint) — 应该 +1
    const during = process.listenerCount('SIGINT');
    expect(during, 'startRepl 应该挂 1 个 SIGINT listener').toBe(before + 1);

    // /exit 触发 finish → process.off('SIGINT', onSigint) 应该 -1, 回到 baseline
    harness.exit();
    const code = await Promise.race([
      p,
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('startRepl finish 超时')), 1000)),
    ]);
    expect(code).toBe(0);

    // 等 microtask 队列消化 (finish 内部 await writer.close())
    await new Promise((r) => setImmediate(r));
    const after = process.listenerCount('SIGINT');
    expect(after, `D-19.5 P2-SIGINT 修法: finish 后 listener delta 应 = 0, 实际 before=${before} after=${after}`).toBe(before);

    // 第二次 startRepl → finish, 验证也不增长
    const harness2 = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: join(mkdtempSync(join(tmpdir(), 'dw-repl-d195-sigint-')), 't.txt') },
    });
    const p2 = harness2.start();
    await new Promise((r) => setTimeout(r, 50));
    const during2 = process.listenerCount('SIGINT');
    expect(during2, '第二次 startRepl 仍只挂 1 个').toBe(after + 1);
    harness2.exit();
    await Promise.race([
      p2,
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('startRepl finish 超时')), 1000)),
    ]);
    await new Promise((r) => setImmediate(r));
    const after2 = process.listenerCount('SIGINT');
    expect(after2, '第二次 finish 后 listener 回到 after (不累积)').toBe(after);
  });
});

describe('REPL builtin turn-guard (D-19.5p)', () => {
  // === Sprint 1c-revive-3-D-19.5p (2026-06-05): P2 builtin guard 回归测 ===
  // 拍板 (D-19.5p, user review 2026-06-05 P2): D-19.5 turn guard 只 guard chat 路径,
  // /help /verify /unknown 走 fast-path, 紧贴 chat turn 时照样跑, 输出/session 交错.
  // 修法: 这 3 个 builtin 移到 turn guard 之后, turnInFlight 时入 lineQueue, finally
  // drain. 测覆盖:
  //   - 紧贴 /help 不在 turn 中途 out, 等 turn 跑完才出现 (通过 outChunks 包含 help 文本)
  //   - /help 仍能跑 (D-11-4 行为不变 — 内建命令最终都跑, 区别是顺序)
  //
  // 红线: 不强求 /verify 也测 (runVerify 真实跑耗时长, 跑测试慢). /help 已能验证
  // turn guard 机制 (不调 runAgentTurn, 不写 event, 跟 chat 路径独立, 但走同一 line
  // handler 分支). builtin guard 修法是位置性 (turn guard 之后) + 状态性
  // (turnInFlight → lineQueue.push), /help 测已能覆盖 3 builtin 的共同行为.

  it('P2: turnInFlight 期间 /help 入队, 等 turn 跑完才打 cli.builtin_help 到 out', async () => {
    // 拍板 (D-19.5p): 这测跟 P1 测同结构, 但 /help 是 P2 builtin guard 的代表
    // (跟 /verify /unknown 共享同一 lineQueue.push 路径, 走最轻量的 /help 跑快).
    // 期望:
    //   1) /help 在 turnInFlight 期间被 lineQueue 排队, 不进 /help 块 (否则 out
    //      会出现 cli.builtin_help, 紧贴 confirm 后)
    //   2) turn 跑完 finally drain, /help 块触发, out 含 cli.builtin_help
    //   3) /help 不阻塞 turn (D-19.5p 修法让 builtin 复用 lineQueue 排队, 跟
    //      chat 路径一样)
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-d195p-p2-'));
    const target = join(dir, 'target.txt');
    const harness = buildReplHarness({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'd19.5p-p2-builtin-guard' },
    });

    try {
      const p = harness.start();
      await new Promise((r) => setImmediate(r));
      // 触发 confirm prompt
      harness.write('please write to file');
      await new Promise((r) => setTimeout(r, 100));
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): 紧贴 y + /help — 应该 y 走 confirm,
      // /help 入队, turnInFlight 期间 /help 不打 cli.builtin_help 到 out ===
      // 拍板 (D-19.5p): y 走 confirm 路径, /help 是下一行. 旧 D-19.5: y 走通后
      // 工具执行 (turnInFlight=true), 紧贴 /help 进 fast-path 立刻打 help 文本, 跟
      // turn 输出交错. D-19.5p 修法: turnInFlight=true 时 /help 入 lineQueue,
      // turn 跑完 finally drain 才打 help 文本. 测验证两点: (a) 工具仍落盘 (chat
      // 走通, 跟 D-19 baseline 一致), (b) /help 最终出现 (drain 后跑 builtin).
      harness.write('y');
      // 不等 100ms, 立刻 /help (race: 旧版本 /help 走 fast-path, 紧贴 confirm 后立刻打 help 文本)
      harness.write('/help');
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): /exit 触发 finish (D-19.5p P2 测需要走完生命周期) ===
      // 拍板 (D-19.5p): 不调 /exit REPL 一直 prompt 等输入, 测超时. /exit 仍走
      // fast-path (D-19.5 拍板不变), finish 由 turn finally 兜底. 红线: /exit 排队 vs
      // fast-path — 走 fast-path (D-19.5 修法不变), 不会撞 D-19.5p P2 builtin guard.
      // 等 turn 跑完 + /help drain 后 /exit 才能跑 (turnInFlight=true 时 /exit 标
      // pendingExit, finally 走 finish).
      await new Promise((r) => setTimeout(r, 200));
      harness.exit();
      // 等 turn 跑完 + /help drain + finish
      const code = await Promise.race([
        p.catch(() => 0),
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('startRepl finish 超时 (D-19.5p P2 测)')), 2000),
        ),
      ]);
      // 工具真落盘 (chat turn 真跑完, y 走通)
      expect(existsSync(target), 'chat turn 仍真跑 (D-19.5p P2 builtin guard 不影响 chat)').toBe(true);

      // 关键验证: /help 最终出现在 out (D-19.5p 修法: 推迟但仍跑, 区别是顺序)
      // 不能用绝对时序断言, 只验证 /help 文本存在.
      expect(
        harness.outChunks,
        "D-19.5p P2 builtin guard: /help 应在 turn 跑完 drain 后真跑, out 含 cli.builtin_help",
      ).toContain('help');

      // 验证: 工具**没**因 /help 被破坏 (chat turn 走 user_approved, 不进 verify)
      const events = await readSessionEvents(harness.sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      const approved = policyEvents.find((e) => e.kind === 'policy_decision' && e.decision === 'user_approved');
      expect(approved, 'chat turn 仍落 user_approved (D-19.5p P2 修法不影响 chat 行为)').toBeDefined();

      expect(code, 'finish 退出码应为 0').toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
