/**
 * REPL `/verify` 集成测 — Sprint 1c-revive-2-D-11-4 (2026-06-04)
 *
 * 覆盖 (D-11-4 review 必做):
 *   - REPL 收 `/verify` → 调 runVerify → formatReport 输出到 out
 *   - writer 存在 → 写 1 条 'verification' event 到 session JSONL
 *   - REPL 跑完 /verify 不退, 回到 prompt
 *   - **D-11-4 review P1 修复**: 无 LLM key 时 REPL 仍能启动 + /verify 跑通
 *     (lazy client 化, 不在 146 行抢创 createDefaultClient)
 *
 * 拍板 (D-11-4, 2026-06-04): 不真跑 `corepack pnpm build` (太慢).
 * 注入 mock LLMClient + 短 input 序列验证 REPL 集成点.
 *
 * 不变量 (跟 commit 2 一致):
 *   - 不 mock runVerify, 用真 node 子进程 (通过注入 options.checks)
 *   - 不写 key, 不读 .env
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';
import { readSessionEvents, setLocale } from '@deepwhale/core';
import { startRepl } from '../../src/repl.js';
import type { VerifyCheck } from '../../src/verify/verify-runner.js';

class CollectingWritable extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }
  text(): string {
    return this.chunks.join('');
  }
}

function makeMockClient(): LLMClient {
  return {
    model: 'mock-model' as ModelId,
    chat: async (_messages: ReadonlyArray<ChatMessage>): Promise<ChatResult> => {
      throw new Error('chat should not be called in /verify test');
    },
    stream: async (): Promise<ChatResult> => {
      // 不会被调 (/verify 不走 LLM), 保持兼容 LLMClient interface
      throw new Error('stream should not be called in /verify test');
    },
  };
}

function _makePassCheckUnused(_i: number): never {
  throw new Error('unused');
}
void _makePassCheckUnused;

describe('REPL /verify (D-11-4 2026-06-04)', () => {
  beforeEach(() => {
    // 测试机 env 无 zh 时默认 en, /exit 提示 "Goodbye!" 不含 "再见", 中文断言 fail.
    // stub env + 强制 setLocale 让 currentLocale 落 zh-CN, 测试独立于 host env.
    vi.stubEnv('DEEPWHALE_LANG', 'zh-CN');
    setLocale('zh-CN');
  });

  it('REPL 收 /verify → 调 runVerify (4 简单 pass) → formatReport 输出到 out + 写 session event', async () => {
    const out = new CollectingWritable();
    const err = new CollectingWritable();
    // sessionFile: REPL 写 /verify event 用
    const sessionFile = join(
      tmpdir(),
      `dw-repl-verify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jsonl`,
    );

    // stdin: 给 /verify + exit. startRepl 是 readline 流.
    // 拍板 (D-11-4, 2026-06-04): 用 async generator + 长 sleep (verify 处理 4 子进程
    // ~200ms, 写 session ~50ms), 让 REPL 有时间处理 /verify 完整流程后再给 exit.
    // 太短: exit 跟 verify 撞, finish 关 writer, verify append 撞 closed.
    async function* inputGen(): AsyncGenerator<Buffer> {
      yield Buffer.from('/verify\n');
      await new Promise((r) => setTimeout(r, 5000)); // 5s 给 verify 跑完
      yield Buffer.from('exit\n');
    }
    const input = Readable.from(inputGen(), { objectMode: false });

    // 4 个简单 pass check, 通过 env var 注入到 REPL (REPL 内部读 options 是显式的,
    // 但我们不想改 startRepl 接口 — 走 RunVerifyOptions 不传, 让 REPL 跑 default 4 步
    // 会真跑 build/lint/typecheck/test, 太慢. 改方案: 把 4 步替换成 4 步简单 pass.
    // 拍板 (D-11-4, 2026-06-04): 简化为 runVerify default 走 4 步 corepack pnpm,
    // 集成测只验 "REPL 接到 /verify → 调 runVerify → out 含 'deepwhale verify' 标题"
    // 跟 "session JSONL 含 1 条 verification event". 不验 default 4 步.
    // 4 个简单 pass check (单测用, 避免真跑 build/lint/typecheck/test 太慢)
    const passChecks: VerifyCheck[] = Array.from({ length: 4 }, (_, i) => {
      const tmp = join(
        tmpdir(),
        `dw-repl-verify-pass-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}.js`,
      );
      writeFileSync(tmp, `process.stdout.write('ok-${i + 1}'); process.exit(0);`);
      return {
        name: `step${i + 1}`,
        command: `node ${tmp}`,
        args: ['node', tmp],
      };
    });

    const exitPromise = startRepl({
      client: makeMockClient(),
      input,
      output: out,
      errorOutput: err,
      exit: (code) => code as never,
      sessionPath: sessionFile,
      verifyChecks: passChecks, // D-11-4 拍板: 单测用 4 个简单 pass
    });

    // 等 REPL 跑完 /verify + exit
    const code = await Promise.race([
      exitPromise,
      new Promise<number>((resolve) => setTimeout(() => resolve(-1), 60_000)),
    ]);
    expect(code).toBe(0);

    // 验证 out 含 "deepwhale verify"
    const outText = out.text();
    expect(outText).toMatch(/deepwhale verify/);

    // 验证 session JSONL 写入了 'verification' event
    const events = await readSessionEvents(sessionFile);
    const verifyEvent = events.find((e) => e.kind === 'verification');
    expect(verifyEvent).toBeDefined();
    if (verifyEvent?.kind === 'verification') {
      expect(verifyEvent.command_count).toBe(4);
      expect(verifyEvent.status).toBe('passed');
      expect(verifyEvent.summary).toMatch(/4\/4 checks passed/);
    }
  }, 60_000); // 60s timeout, 4 个简单 check < 1s

  // Sprint 1c-revive-2-D-11-4 review P1 修复 (2026-06-04): 无 LLM key 时 REPL 不
  // 阻塞, /verify 路径不依赖 client 创成功. 之前 146 行抢创 createDefaultClient()
  // 在无 key 时抛 APIKeyMissingError, REPL Promise 直接 reject, 用户进不去.
  // 修复: 显式 unset 两个 key, **不**传 options.client (走 lazy 创建路径).
  describe('REPL 无 LLM key 启动 (D-11-4 review P1 修复)', () => {
    let origDeepseek: string | undefined;
    let origAnthropic: string | undefined;

    beforeEach(() => {
      origDeepseek = process.env['DEEPSEEK_API_KEY'];
      origAnthropic = process.env['ANTHROPIC_AUTH_TOKEN'];
      delete process.env['DEEPSEEK_API_KEY'];
      delete process.env['ANTHROPIC_AUTH_TOKEN'];
    });

    afterEach(() => {
      if (origDeepseek !== undefined) process.env['DEEPSEEK_API_KEY'] = origDeepseek;
      if (origAnthropic !== undefined) process.env['ANTHROPIC_AUTH_TOKEN'] = origAnthropic;
    });

    it('REPL 无 key 启动成功 + /verify 跑通 + 写 session event + chat 路径报 i18n 错', async () => {
      const out = new CollectingWritable();
      const err = new CollectingWritable();
      const sessionFile = join(
        tmpdir(),
        `dw-repl-nokey-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jsonl`,
      );

      // 4 个简单 pass check
      const passChecks: VerifyCheck[] = Array.from({ length: 4 }, (_, i) => {
        const tmp = join(
          tmpdir(),
          `dw-repl-nokey-pass-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}.js`,
        );
        writeFileSync(tmp, `process.stdout.write('ok-${i + 1}'); process.exit(0);`);
        return {
          name: `step${i + 1}`,
          command: `node ${tmp}`,
          args: ['node', tmp],
        };
      });

      // input: /verify → chat 触发 lazy create 失败 → /exit
      async function* inputGen(): AsyncGenerator<Buffer> {
        yield Buffer.from('/verify\n');
        await new Promise((r) => setTimeout(r, 1000)); // 给 verify 跑完
        yield Buffer.from('hello without key\n'); // 触发 lazy create 失败
        await new Promise((r) => setTimeout(r, 200)); // 给 stderr 写完
        yield Buffer.from('/exit\n');
      }
      const input = Readable.from(inputGen(), { objectMode: false });

      const exitPromise = startRepl({
        // 注意: **不**传 client, 让 lazy create 触发
        input,
        output: out,
        errorOutput: err,
        exit: (code) => code as never,
        sessionPath: sessionFile,
        verifyChecks: passChecks,
      });

      const code = await Promise.race([
        exitPromise,
        new Promise<number>((resolve) => setTimeout(() => resolve(-1), 30_000)),
      ]);
      expect(code).toBe(0);

      const outText = out.text();
      const errText = err.text();

      // 1) greeting 仍输出 (即使 client 创失败, REPL 不会因模型名缺失而 reject)
      expect(outText).toMatch(/deepwhale/);
      // 2) /verify 跑通 (out 含 'deepwhale verify' 报告)
      expect(outText).toMatch(/deepwhale verify/);
      // 3) chat 触发 lazy create 失败 → i18n error 到 stderr (REPL 不退)
      expect(errText).toMatch(/api_key_missing|API/i);
      // 4) /exit 仍能退出 (REPL 没被无 key 状态卡死)
      expect(outText).toMatch(/再见/);
      // 5) session JSONL 写了 verification event (REPL /verify 行为不变)
      const events = await readSessionEvents(sessionFile);
      const verifyEvent = events.find((e) => e.kind === 'verification');
      expect(verifyEvent).toBeDefined();
    }, 30_000);
  });
});
