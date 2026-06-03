/**
 * Sprint 1a follow-up 回归测试 — 覆盖 P1 (user input 不进 loop) + P2-A (流式重复打印)。
 *
 * 覆盖矩阵:
 * - runAgentTurn (repl) : user 进 LLM + 流式只打印一次 + workingMessages 回写
 * - runPrintMode         : user 进 LLM + 流式只打印一次 + 退出码 0
 * - runRpcMode           : 跨 request 时第 2 个 chat 看到第 1 个的 messages
 *
 * 不依赖真实 LLM,全 mock client。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatChunk, ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';
import { runAgentTurn } from '../src/repl.js';
import { runPrintMode } from '../src/modes/print.js';
import { runRpcMode } from '../src/modes/rpc.js';

// ---- mock LLMClient:对每次 chat()/stream() 调用,可看到 messages,返回受控结果 ----

interface MockConfig {
  /** 对应每次调用的 ChatResult 队列(可空 = 默认 'done') */
  streamResults?: ReadonlyArray<{
    content: string;
    toolCalls?: ReadonlyArray<{ id: string; name: string; args: Record<string, unknown> }>;
  }>;
}

function makeStreamMockClient(cfg: MockConfig = {}): {
  client: LLMClient;
  seen: { messages: ChatMessage[][] };
} {
  const seen: { messages: ChatMessage[][] } = { messages: [] };
  const results = cfg.streamResults ?? [{ content: 'mock answer' }];
  let idx = 0;
  // 通用:对每次 chat/stream 调用都 push 到 seen,模拟 LLM 接收到的 messages
  const client: LLMClient = {
    model: 'mock' as ModelId,
    chat: vi.fn(async (msgs: ChatMessage[]): Promise<ChatResult> => {
      seen.messages.push([...msgs]);
      const r = results[idx] ?? results[results.length - 1];
      if (!r) throw new Error('mock: no result configured');
      idx += 1;
      if (r.content) {
        return okResult(r.content);
      }
      const toolCalls = r.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }));
      if (toolCalls && toolCalls.length > 0) {
        return okResult('', toolCalls as ChatResult['tool_calls']);
      }
      return okResult('');
    }),
    stream: vi.fn(
      async (
        msgs: ChatMessage[],
        options: { onChunk: (chunk: ChatChunk) => void },
      ): Promise<ChatResult> => {
        seen.messages.push([...msgs]);
        const r = results[idx] ?? results[results.length - 1];
        if (!r) {
          throw new Error('mock: no result configured');
        }
        idx += 1;
        if (r.content) {
          options.onChunk({ delta: { content: r.content } });
        }
        const toolCalls = r.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }));
        if (toolCalls && toolCalls.length > 0) {
          const tcCast = toolCalls as unknown as ChatResult['tool_calls'];
          options.onChunk({ delta: { content: '', tool_calls: tcCast } });
          return okResult('', tcCast);
        }
        return okResult(r.content);
      },
    ),
  };
  return { client, seen };
}

function okResult(content: string, toolCalls: ReadonlyArray<{ id: string; name: string; args: Record<string, unknown> }> = []): ChatResult {
  const r: ChatResult = {
    model: 'mock' as ModelId,
    content,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
  };
  if (toolCalls.length > 0) {
    r.tool_calls = toolCalls as ChatResult['tool_calls'];
  }
  return r;
}

// ---- Writable 收集器 ----

class StringWritable extends Writable {
  data = '';
  override _write(chunk: Buffer | string, _enc: string, cb: () => void): void {
    this.data += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    cb();
  }
}

// =====================================================================
// runAgentTurn (REPL 内部,本测试通过 export 暴露)
// =====================================================================

describe('runAgentTurn (repl) — Sprint 1a follow-up', () => {
  it('P1: 把 userInput 喂给 LLM,LLM 看到的 messages 末尾是 user', async () => {
    const { client, seen } = makeStreamMockClient();
    const out = new StringWritable();
    const err = new StringWritable();
    const ac = new AbortController();
    await runAgentTurn(client, '列出文件', [], null, out, err, ac.signal);
    expect(seen.messages).toHaveLength(1);
    expect(seen.messages[0]?.at(-1)).toEqual({ role: 'user', content: '列出文件' });
  });

  it('P2-A: 流式模式 final content 只出现一次(不重复打印)', async () => {
    const { client } = makeStreamMockClient({ streamResults: [{ content: '你好' }] });
    const out = new StringWritable();
    const err = new StringWritable();
    const ac = new AbortController();
    await runAgentTurn(client, 'hi', [], null, out, err, ac.signal);
    // 流式 onChunk 写入 + Sprint 1a 修 P2-A 删除 final.content 重复打印 → 只出现一次
    const matches = out.data.match(/你好/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('workingMessages 在 turn 跑完后被原地覆盖,下次 turn 看到 history 累积', async () => {
    const { client, seen } = makeStreamMockClient({
      streamResults: [{ content: 'A答' }, { content: 'B答' }],
    });
    const out = new StringWritable();
    const err = new StringWritable();
    const working: ChatMessage[] = [];
    const ac = new AbortController();
    await runAgentTurn(client, 'Q1', working, null, out, err, ac.signal);
    await runAgentTurn(client, 'Q2', working, null, out, err, ac.signal);
    expect(seen.messages).toHaveLength(2);
    // turn 2 看到的 messages 包含 turn 1 的 user + assistant
    expect(seen.messages[1]?.at(-3)).toEqual({ role: 'user', content: 'Q1' });
    expect(seen.messages[1]?.at(-1)).toEqual({ role: 'user', content: 'Q2' });
    // working 累积(turn 1 写入 2 条,turn 2 再写 2 条)
    expect(working.length).toBeGreaterThanOrEqual(2);
  });
});

// =====================================================================
// runPrintMode
// =====================================================================

describe('runPrintMode — Sprint 1a follow-up', () => {
  it('P1: -p 模式 user 进 LLM,LLM 看到 messages 末尾是 user', async () => {
    const { client, seen } = makeStreamMockClient();
    // 重定向 process.stdout/stderr 到 sink,避免污染测试输出
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
      stderrChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    try {
      const code = await runPrintMode({ prompt: '列出文件', client, enableToolLoop: true });
      expect(code).toBe(0);
      expect(seen.messages).toHaveLength(1);
      expect(seen.messages[0]?.at(-1)).toEqual({ role: 'user', content: '列出文件' });
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('P2-A: 流式 final content 只打印一次', async () => {
    const { client } = makeStreamMockClient({ streamResults: [{ content: 'PHI' }] });
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    try {
      await runPrintMode({ prompt: 'hi', client, enableToolLoop: true });
      const all = stdoutChunks.join('');
      const matches = all.match(/PHI/g) ?? [];
      expect(matches).toHaveLength(1);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('P3 follow-up: --no-tool-loop (enableToolLoop=false) 不创 registry, 不走 runToolLoop, 也不让 LLM 看到 tools schema', async () => {
    // 之前 bug: enableToolLoop=false 只把 maxSteps=1, 仍跑 runToolLoop + createDefaultRegistry。
    // 这意味着:
    //   - LLM 服务端收到请求 body.tools 字段不为空(registry 里所有 tool schema 都进去了)
    //   - LLM 完全可以发 tool_calls, 1 step 撞 limit 然后抛错
    // 修后: --no-tool-loop 真关闭, 走 client.stream 直发, options.tools=undefined
    //   (DeepSeekClient.buildRequestBody 看到 undefined 就不会发 tools 字段)。
    const { client, seen } = makeStreamMockClient({ streamResults: [{ content: 'pure' }] });
    let toolsSeenInStreamCall: unknown = 'never-called';
    // 包装 stream 拦截 options, 验证 LLM 端没收到 tools
    const realStream = client.stream as unknown as ReturnType<typeof vi.fn>;
    const wrappedStream = vi.fn(
      async (msgs: ChatMessage[], options: { tools?: unknown; onChunk: (chunk: ChatChunk) => void }) => {
        toolsSeenInStreamCall = options.tools;
        return realStream(msgs, options);
      },
    );
    // 替换 mock client 的 stream 为包装版
    (client as { stream: typeof wrappedStream }).stream = wrappedStream;
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    try {
      const code = await runPrintMode({ prompt: 'no tool pls', client, enableToolLoop: false });
      expect(code).toBe(0);
      // 验证 1: client.stream 被调用(说明走了直发路径, 不调 runToolLoop)
      expect(wrappedStream).toHaveBeenCalledTimes(1);
      // 验证 2: client.chat 不应被调用(enableToolLoop=false 不走 chat 路径)
      expect(client.chat).not.toHaveBeenCalled();
      // 验证 3: LLM 端拿到的 options.tools 必须是 undefined, 不会发 tools schema
      expect(toolsSeenInStreamCall).toBeUndefined();
      // 验证 4: 业务结果: 增量打印 'pure' 到 stdout
      expect(stdoutChunks.join('')).toContain('pure');
      // 验证 5: seen.messages 收到 user 消息(单轮, user 进 LLM)
      expect(seen.messages).toHaveLength(1);
      expect(seen.messages[0]?.at(-1)).toEqual({ role: 'user', content: 'no tool pls' });
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// =====================================================================
// runRpcMode
// =====================================================================

describe('runRpcMode — Sprint 1a follow-up', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-rpc-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** 喂 stdin 一行 JSON,启动 rpc mode,等处理后 kill stdin。 */
  async function runRpcWithInput(
    client: LLMClient,
    lines: ReadonlyArray<string>,
    sessionPath?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    // 构造可读流模拟 stdin;通过 options.input 注入(避免 monkey-patch process.stdin)
    // Sprint 1a follow-up:Readable.from 在 vitest + node readline 下合并 chunks 导致 line event 漏发。
    // 改用 PassThrough 手动 push + pause(),逐行推送,确保每行都触发 line event。
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
      stderrChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    try {
      // 启动 rpc mode(它会阻塞等 stdin close)
      const codePromise = runRpcMode({
        ...(sessionPath ? { sessionPath } : {}),
        client,
        input,
      });
      // 喂数据
      for (const l of lines) {
        input.write(`${l}\n`);
      }
      // 关闭流让 readline 退出
      input.end();
      const code = await codePromise;
      expect(code).toBe(0);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
    return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
  }

  it('P1: 连续两个 chat request,第 2 个 LLM 看到第 1 个的 messages', async () => {
    const { client, seen } = makeStreamMockClient({
      streamResults: [{ content: 'first answer' }, { content: 'second answer' }],
    });
    await runRpcWithInput(client, [
      JSON.stringify({ id: '1', method: 'chat', params: { prompt: 'Q1' } }),
      JSON.stringify({ id: '2', method: 'chat', params: { prompt: 'Q2' } }),
    ]);
    expect(seen.messages).toHaveLength(2);
    // turn 1 看到的 user 是唯一一条(Q1)
    expect(seen.messages[0]).toHaveLength(1);
    expect(seen.messages[0]?.[0]).toEqual({ role: 'user', content: 'Q1' });
    // turn 2 看到的 messages 至少包含 Q1 + assistant(Q1 答) + Q2
    const turn2 = seen.messages[1] ?? [];
    expect(turn2).toContainEqual({ role: 'user', content: 'Q1' });
    // 末尾一定是本轮 user Q2
    expect(turn2.at(-1)).toEqual({ role: 'user', content: 'Q2' });
    // 至少有一条 assistant 来自 turn 1
    expect(turn2.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('P1 follow-up: close 后正在跑的 chat 仍要完整写完 stdout (no premature exit)', async () => {
    // 之前 bug: rl.on('close') 立即 finish, 不会等 chain 排空。慢响应下,
    // runRpcMode 提前 return, sendOk 还没写完 stdout, caller 看到响应被截断 / 丢失。
    // 修后: close 触发后, 排队的 chat 必须等 in-flight chain drain 完才 finish。
    // 验证路径: req.stream=true 触发 RPC 走 client.stream() (runToolLoop + onChunk),
    // mock client 故意延迟 100ms 才 onChunk, input 立刻 end() 触发 close。
    // 修复后: stdout 必含 SLOW_OK + id=1 response, runRpcMode 不会提前 return。
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    // mock client: 故意 stream() 延迟 100ms 才 onChunk,模拟"慢响应"
    const slowClient: LLMClient = {
      model: 'mock' as ModelId,
      chat: vi.fn(async (): Promise<ChatResult> => okResult('unused')),
      stream: vi.fn(
        async (
          _msgs: ChatMessage[],
          options: { onChunk: (chunk: ChatChunk) => void },
        ): Promise<ChatResult> => {
          await new Promise((r) => setTimeout(r, 100));
          options.onChunk({ delta: { content: 'SLOW_OK' } });
          return okResult('SLOW_OK');
        },
      ),
    };
    try {
      const codePromise = runRpcMode({ client: slowClient, input });
      // stream=true 触发 RPC 走 client.stream() 路径,验证慢响应 + close 同步发生
      input.write(
        `${JSON.stringify({ id: '1', method: 'chat', params: { prompt: 'Q', stream: true } })}\n`,
      );
      input.end();
      const code = await codePromise;
      expect(code).toBe(0);
      // 关键: 慢响应内容必须已写完 stdout, response 必须包含 id=1
      // SLOW_OK 既来自 chat.delta notification 也来自 final result.content,
      // 协议上 result.content 是 LLM 输出, 必含; 修复前可能因 close 提前 finish 而缺失。
      const all = stdoutChunks.join('');
      expect(all).toContain('SLOW_OK');
      expect(all).toMatch(/"id"\s*:\s*"1"/);
      // 客户端必须真调到 stream 路径(不能 fallback 到 chat 路径)
      expect(slowClient.stream).toHaveBeenCalledTimes(1);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('P1 follow-up #3: SIGINT 在 stdin 还开着时也能让 runRpcMode 在 250ms 内返回 (no hang)', async () => {
    // 之前 bug: signal handler 只 requestShutdown(0) 但不 rl.close(),
    // 若 stdin 没数据 (用户不喂 input), 进程永远等 close 事件 → 挂住。
    // 复现: process.emit('SIGINT') 后 250ms 内不 resolve。
    // 修后: signal handler 主动 rl.close(), 走和 stdin close 一样的 drain 路径,
    // 必须等 in-flight chat 完成后才 return。
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    // slow client: 50ms 后返回 SLOW_OK
    const slowClient: LLMClient = {
      model: 'mock' as ModelId,
      chat: vi.fn(async (): Promise<ChatResult> => okResult('unused')),
      stream: vi.fn(
        async (
          _msgs: ChatMessage[],
          options: { onChunk: (chunk: ChatChunk) => void },
        ): Promise<ChatResult> => {
          await new Promise((r) => setTimeout(r, 50));
          options.onChunk({ delta: { content: 'SLOW_OK' } });
          return okResult('SLOW_OK');
        },
      ),
    };
    try {
      // watchSignals: 走真实 SIGINT handler (但 emit 是 process 内部, 不影响 vitest)
      const codePromise = runRpcMode({ client: slowClient, input, watchSignals: ['SIGINT'] });
      // 喂一个会慢响应的 request
      input.write(
        `${JSON.stringify({ id: '1', method: 'chat', params: { prompt: 'Q', stream: true } })}\n`,
      );
      // 给 mock stream 一点启动时间
      await new Promise((r) => setTimeout(r, 5));
      // 关键: 触发 SIGINT 但 stdin 没 end。修复前: hang 250ms+。修复后: 在 ~50ms 内 resolve。
      process.emit('SIGINT');
      const start = Date.now();
      const code = await codePromise;
      const elapsed = Date.now() - start;
      // 退出码 130 (128 + 2 = SIGINT) 反映是被 signal 干掉
      expect(code).toBe(130);
      // 250ms 内必须 resolve (slow stream 50ms + drain 缓冲; 修复前会 hang 到 vitest timeout)
      expect(elapsed).toBeLessThan(250);
      // 慢响应内容必须写完 (drain 路径生效)
      expect(stdoutChunks.join('')).toContain('SLOW_OK');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  // ======================================================================
  // Sprint 1b: usage 可观测性 wired 到 RPC + print
  // ======================================================================

  it('Sprint 1b #1: RPC chat response 顶层暴露 cache_hit_rate / cost_turn (caller 不必 deep dive usage)', async () => {
    // 模拟 LLM 返 usage (含 cached_tokens), RPC mode 必须把 cache_hit_rate 提到顶层方便 caller 1 层访问
    // 之前: caller 只能读 result.usage.cache_hit_rate, 多层访问
    // Sprint 1b: 顶层 result.cache_hit_rate + result.cost_turn (跟 usage 字段并存, 0 字段冲突)
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    // stream mock: 返回 usage (含 cached_tokens) → 走 stream 路径, fill streamResult
    const usageClient: LLMClient = {
      model: 'mock' as ModelId,
      chat: vi.fn(async (): Promise<ChatResult> => okResult('unused')),
      stream: vi.fn(
        async (
          _msgs: ChatMessage[],
          options: { onChunk: (chunk: ChatChunk) => void },
        ): Promise<ChatResult> => {
          options.onChunk({ delta: { content: 'cached hit' } });
          // 构造带 usage 的 ChatResult, 模拟 DeepSeek V4 返 usage
          const result: ChatResult = {
            model: 'mock' as ModelId,
            content: 'cached hit',
            finish_reason: 'stop',
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 50,
              total_tokens: 1050,
              cached_tokens: 900,
              cache_hit_rate: 0.9,
              cost_turn: 0.00009,
              cost_currency: 'CNY', // Sprint 1b.5: 锁住新字段
              tokens_uncached: 100,
            },
          };
          return result;
        },
      ),
    };
    try {
      const codePromise = runRpcMode({ client: usageClient, input });
      input.write(
        `${JSON.stringify({ id: '1', method: 'chat', params: { prompt: 'Q', stream: true } })}\n`,
      );
      input.end();
      await codePromise;
      const all = stdoutChunks.join('');
      // 顶层 cache_hit_rate 必须出现 (caller 1 层访问)
      expect(all).toMatch(/"cache_hit_rate"\s*:\s*0\.9/);
      // 顶层 cost_turn 必须出现 (P1 fix: 0.09 → 0.00009, 公式大 1000× → 缩小 1000×)
      expect(all).toMatch(/"cost_turn"\s*:\s*0\.00009/);
      // usage 字段也必须保留 (caller 想要全量数据仍可访问)
      expect(all).toMatch(/"usage"/);
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// =====================================================================
// Sprint 1b.5 Step 2.5 (F3 拍板): mode 层 anthropic × tool loop 防护
// =====================================================================

describe('runPrintMode — Sprint 1b.5 F3 anthropic × tool loop auto-disable', () => {
  /**
   * F3 拍板: anthropic provider + enableToolLoop 不显式传 → mode 层自动关 tool loop + stderr
   * warning. 设计意图 = 温柔降级, 不阻断 user 第一轮.
   *
   * 关键: 验**没**走 runToolLoop 路径 (即 client.chat 没被调), 走了 client.stream 直发路径.
   * 验 stderr 含特定 warning 文案 (跟 1b 时代 "no API key" stderr 风格一致).
   */
  it('F3-A: anthropic client + enableToolLoop=undefined → stderr warning + 走 client.stream (不跑 tool loop)', async () => {
    // mock client model 必须以 'claude-' 开头, 触发 F3 startsWith 检查
    const { client, seen } = makeStreamMockClient({ streamResults: [{ content: 'anthropic says hi' }] });
    // 直接改 model 字段 (不 spread, 保留 vi.fn 引用)
    (client as { model: ModelId }).model = 'claude-sonnet-4-5' as ModelId;
    const stderrChunks: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
      stderrChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    try {
      // 关键: enableToolLoop 不传, 让 mode 层自己判断
      const code = await runPrintMode({ prompt: 'hi', client });
      expect(code).toBe(0);
      // 验证 1: stderr 必含 F3 warning 文案
      const stderrAll = stderrChunks.join('');
      expect(stderrAll).toMatch(/warning: Anthropic provider in Sprint 1b\.5 does not support tool loop/);
      expect(stderrAll).toMatch(/auto-disabling tools/);
      // 验证 2: 走了 client.stream 路径 (F3 触发 enableToolLoop=false)
      expect(client.stream).toHaveBeenCalledTimes(1);
      // 验证 3: client.chat **没**被调 (走 tool loop 才调 chat)
      expect(client.chat).not.toHaveBeenCalled();
      // 验证 4: LLM 看到了 user prompt
      expect(seen.messages).toHaveLength(1);
      expect(seen.messages[0]?.at(-1)).toEqual({ role: 'user', content: 'hi' });
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('F3-B: deepseek client + enableToolLoop=undefined → stderr 无 F3 warning + 走 client.chat (tool loop 默认开)', async () => {
    // 对照: deepseek model 不以 'claude-' 开头, F3 防护**不**触发, 走默认 tool loop 路径
    const { client, seen } = makeStreamMockClient({ streamResults: [{ content: 'deepseek says hi' }] });
    (client as { model: ModelId }).model = 'deepseek-v4-flash' as ModelId;
    const stderrChunks: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
      stderrChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runPrintMode({ prompt: 'hi', client });
      expect(code).toBe(0);
      // 验证 1: stderr **不**含 F3 warning
      const stderrAll = stderrChunks.join('');
      expect(stderrAll).not.toMatch(/Anthropic provider in Sprint 1b\.5/);
      // 验证 2: 走了 client.stream 路径 (runToolLoop 内部 runStreamStep 调 stream, 因 onChunk 必传)
      expect(client.stream).toHaveBeenCalledTimes(1);
      // 验证 3: client.chat **没**被调 (runToolLoop 不会走 chat 分支, 因 onChunk 必传)
      expect(client.chat).not.toHaveBeenCalled();
      // 验证 4: LLM 看到了 user prompt
      expect(seen.messages[0]?.at(-1)).toEqual({ role: 'user', content: 'hi' });
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe('runPrintMode — Sprint 1b usage summary', () => {
  it('Sprint 1b #2: print 退出后 stderr 必含 cache/cost summary (跟 REPL 状态栏同一格式)', async () => {
    // 满 usage → 完整 summary "cache: 90% | ¥X/turn | prompt Xk (Y new)"
    const { client } = makeStreamMockClient({ streamResults: [{ content: 'hi' }] });
    // 包装 client.stream 让它返带 usage 的 ChatResult
    const realStream = client.stream as unknown as ReturnType<typeof vi.fn>;
    const wrappedStream = vi.fn(
      async (
        msgs: ChatMessage[],
        options: { onChunk: (chunk: ChatChunk) => void; [k: string]: unknown },
      ) => {
        const r = await realStream(msgs, options);
        // 注入 usage (模拟真 LLM 返)
        return {
          ...r,
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 50,
            total_tokens: 1050,
            cached_tokens: 900,
            cache_hit_rate: 0.9,
            cost_turn: 0.00009,
            cost_currency: 'CNY', // Sprint 1b.5: 锁住新字段 (formatUsageStatus 读 cost_currency 决 symbol)
            tokens_uncached: 100,
          },
        } as ChatResult;
      },
    );
    (client as { stream: typeof wrappedStream }).stream = wrappedStream;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
      stderrChunks.push(typeof data === 'string' ? data : data.toString('utf-8'));
      return true;
    });
    try {
      const code = await runPrintMode({ prompt: 'hi', client, enableToolLoop: true });
      expect(code).toBe(0);
      // stdout 必含 chat content (Sprint 1a 已有)
      expect(stdoutChunks.join('')).toContain('hi');
      // stderr 必含 cache status 关键字段
      const stderrAll = stderrChunks.join('');
      expect(stderrAll).toMatch(/cache:\s*90%/);
      expect(stderrAll).toMatch(/¥/);
      expect(stderrAll).toMatch(/turn/);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
