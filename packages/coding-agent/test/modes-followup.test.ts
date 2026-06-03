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
});
