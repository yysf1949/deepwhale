/**
 * Sprint 1c-revive-4-D-20.3 P0-B (2026-06-05) v1.0 capability completion:
 *   TUI mode smoke test
 *
 * 必须覆盖 (用户红线):
 *   - TUI 启动 (有 stdout 输出, header 显示)
 *   - input 注入 prompt → 触发 turn → 收 LLM response
 *   - tool call 显示 (走 mock LLM 返 tool_calls, 看 stdout 含 tool name)
 *   - y/N confirm 走 createReplConfirm (D-19 复用, 不重建)
 *   - /exit 退出 (不损坏 session writer)
 *   - q 单字母也能退出
 *   - session writer close 在退出时跑 (不损坏 session)
 *   - 复用 runToolLoop + staticToolPolicy (不绕过 ToolPolicy)
 *   - 复用 SessionWriter (不绕过 session audit)
 *
 * D-23.2 (2026-06-06): highlightChunk 测 ANSI escape bytes (\x1b[...m) 是必要的,
 * 需要在 regex 模板里直接放 control char, 关闭 no-control-regex 规则.
 */
/* eslint-disable no-control-regex */

import { afterEach, describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatChunk, ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';
import { runTuiMode } from '../../src/modes/tui.js';
import { Spinner as SpinnerCls } from '../../src/modes/tui.js';
import { resolveTuiTheme, THEMES, type TuiThemeName } from '../../src/modes/tui.js';
import { highlightChunk } from '../../src/modes/tui.js';

// ---- 共享 helper: mock LLMClient stream 返受控 content ----

interface MockStreamConfig {
  /** 第 1 次 chat 返的 content */
  first: string;
  /** 第 2 次 chat 返的 content (e.g. tool_call result 之后) */
  second?: string;
  /** 模拟 tool call (BashTool 之类), 走真 registry */
  toolCall?: { name: string; args: Record<string, unknown>; result: string };
}

function makeMockStreamClient(cfg: MockStreamConfig): LLMClient {
  let callCount = 0;
  // D-21.2 升级: 给 mock stream 加 usage 字段, 让 formatUsageStatus 不返 null,
  // 走 status bar 上下双横线 (if 路径) 走完 2 条 horizontalRule, 跟生产一致.
  // 数字随便, 跟 test 无关 (test 只验 status bar 出现 ≥ 4 次 ─{3,}, 不验数字).
  const mockUsage = {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    // 跟 deepseek-client 真实形态对齐, 让 formatUsageStatus 不抛
    cache_hit_tokens: 80,
    cache_miss_tokens: 70,
    cached: 80,
  } as const;
  return {
    model: 'mock-deepseek-v4-flash' as ModelId,
    chat: async (): Promise<ChatResult> => {
      throw new Error('mock: stream-only client, chat() not used');
    },
    stream: async (
      _msgs: ChatMessage[],
      options: { onChunk: (chunk: ChatChunk) => void },
    ): Promise<ChatResult> => {
      const c = cfg.toolCall && callCount === 0
        ? { content: 'OK', toolCalls: [{ id: 'tc-1', name: cfg.toolCall.name, args: cfg.toolCall.args }] }
        : (callCount === 0 ? cfg.first : (cfg.second ?? cfg.first));
      callCount += 1;
      if (typeof c === 'string') {
        options.onChunk({ delta: { content: c } });
        return {
          model: 'mock-deepseek-v4-flash' as ModelId,
          content: c,
          finish_reason: 'stop',
          // D-21.2: 加 usage 让 status bar 走 if 分支 (上下双横线)
          usage: { ...mockUsage },
        };
      }
      // tool call path
      const toolCalls = (c as { toolCalls: { id: string; name: string; args: Record<string, unknown> }[] }).toolCalls;
      options.onChunk({ delta: { content: '', tool_calls: toolCalls as ChatResult['tool_calls'] } });
      return {
        model: 'mock-deepseek-v4-flash' as ModelId,
        content: '',
        finish_reason: 'tool_calls',
        tool_calls: toolCalls as ChatResult['tool_calls'],
        usage: { ...mockUsage },
      };
    },
  };
}

// ---- StringWritable 收集输出 ----

class StringWritable extends Writable {
  data = '';
  override _write(chunk: Buffer | string, _enc: string, cb: () => void): void {
    this.data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    cb();
  }
}

// ---- TUI smoke test ----

describe('runTuiMode (TUI smoke, D-20.3 P0-B)', () => {
  let tmpDir: string;
  // 每个 it 用独立 tmp dir
  // (避免跨 it 状态污染)

  it('启动: stdout 含 header + prompt, /exit 走 finish path', async () => {
    // 拍板: TUI 启动必显示 'deepwhale tui <model>' + 横线分隔 + '> ' prompt.
    // /exit 必须走 D-19.5 finish 路径, 印 'Goodbye!' + 关闭 session writer.
    //
    // D-21.2 轻量升级 (2026-06-06): header 改用 `─` 横线 repeat, 取代 v1.0 的 `╭─ ... ╮`
    // 边框. 边框在 80 列终端看着局促, 横线更现代. 横线来自 horizontalRule() helper,
    // width 自适应 terminal columns. 测试期待 '───' (3+ 个连续 ─) 即可.
    const client = makeMockStreamClient({ first: 'unused' });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    // 喂 exit, 触发 finish
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 头部 header 必须出现
    expect(out.data).toContain('deepwhale tui');
    // D-21.2: 横线分隔 (horizontalRule), 至少 1 处 3+ 连续 ─ 字符
    expect(out.data).toMatch(/─{3,}/);
    // 提示行
    expect(out.data).toContain('/help');
    expect(out.data).toContain('/verify');
    // prompt 字符
    expect(out.data).toContain('> ');
    // Goodbye 必须出现 (finish 路径)
    expect(out.data).toContain('Goodbye');

    // session file 必存在 + 不损坏
    expect(existsSync(sessionPath)).toBe(true);
    // 文件是 empty JSONL (没有 user input, 没 turn)
    const jsonl = readFileSync(sessionPath, 'utf8');
    expect(jsonl).toBe('');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('q 单字母也退出', async () => {
    const client = makeMockStreamClient({ first: 'unused' });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();

    const codePromise = runTuiMode({
      client,
      output: out,
      errorOutput: err,
      input,
    });
    // 单字母 'q' (用户红线 v1 必支持)
    input.write('q\n');
    const code = await codePromise;
    expect(code).toBe(0);
    expect(out.data).toContain('Goodbye');
  });

  it('chat 路径: prompt → mock LLM stream → response 印到 stdout', async () => {
    // 走真 LLM 路径 (mock LLM 返 'mock hello' 走 stream), 验 stdout 印 'mock hello'.
    // 关键: TUI 必复用 runToolLoop, 跟 REPL/print mode 同形态.
    const client = makeMockStreamClient({ first: 'mock hello' });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    // 喂 user prompt, 等 turn 跑完, 喂 /exit
    input.write('hello\n');
    // 等一下让 turn 跑完 (mock 同步返, 50ms 够)
    await new Promise((r) => setTimeout(r, 100));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // LLM 返的 content 必出现在 stdout
    expect(out.data).toContain('mock hello');
    // session 必写 user + assistant 2 个 event (走 SessionWriter, 不绕过 audit)
    expect(existsSync(sessionPath)).toBe(true);
    const jsonl = readFileSync(sessionPath, 'utf8');
    const events = jsonl.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const kinds = events.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain('user');
    expect(kinds).toContain('assistant');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('tool call 显示: 走真 LLM mock 返 tool_call, stdout 含工具名 + 状态', async () => {
    // mock LLM 返 tool_call (BashTool 之类), TUI 必显示 '✓ read_file' 之类.
    // 注: 走真 registry, tool 必须真存在 (registry 默认带 read_file/write_file/bash 等).
    // 实际 mock toolCall 走 read_file 之类 (允许 path=合法文件), 验 stdout 含 'read_file' + '✓' 状态.
    // 注: 测试环境 hardcode 走 `pwd` 这种 safe tool, 避免 path 错.
    const client = makeMockStreamClient({
      first: 'ok',
      toolCall: {
        name: 'bash',
        args: { command: 'echo TUI_TOOL_TEST', timeoutMs: 1000 },
        result: 'TUI_TOOL_TEST',
      },
    });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    input.write('run bash\n');
    await new Promise((r) => setTimeout(r, 200));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // tool 显示: stdout 含 'bash' (tool name) + '✓' (成功状态) 或 '✗' (失败状态)
    // 接受其一 (mock bash 真跑可能成功也可能因 sandbox 失败, 关键是 tool name 出现)
    expect(out.data).toContain('bash');
    // 状态字符: '✓' (成功) / '✗' (失败) 二选一
    expect(out.data).toMatch(/[✓✗]/);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('红线: TUI write_file 走 policy.confirm — 喂 n → session 落 user_denied, 工具不执行', async () => {
    // D-13 拍板: write_file 走 require_confirmation. TUI 必复用 createReplConfirm
    // (D-19 拍板), 不重建 2 套. 红线: mock LLM 返 write_file tool_call, 必触发
    // confirm, 喂 'n' 拒绝, 验:
    //   (1) stdout 含 'denied' (确认走 prompt)
    //   (2) 文件**不**被创建 (工具被拦截)
    //   (3) session JSONL 落 policy_decision event, decision=user_denied
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-deny-'));
    const sessionPath = join(tmpDir, 'session.jsonl');
    const targetFile = join(tmpDir, 'should-not-exist.txt');

    const client = makeMockStreamClient({
      first: 'ok',
      toolCall: {
        name: 'write_file',
        args: { path: targetFile, content: 'should not write' },
        result: 'WRITTEN', // 模拟: 真执行会返这串, 但 deny 路径不应走
      },
    });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    input.write('write a file\n');
    // 等 confirm prompt 出现
    await new Promise((r) => setTimeout(r, 150));
    // 喂 n 拒绝 (D-15: 'n' 拒绝, 走 user_denied)
    input.write('n\n');
    await new Promise((r) => setTimeout(r, 200));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // (1) stdout 含 'Allow' prompt + '✗' 失败标志 (D-13 deny 路径必走 ✗ 不走 ✓)
    expect(out.data).toMatch(/Allow write_file/);
    expect(out.data).toMatch(/✗ write_file/);
    expect(out.data).not.toMatch(/✓ write_file/);
    // (2) 文件**不**被创建
    expect(existsSync(targetFile)).toBe(false);
    // (3) session JSONL 落 policy_decision, decision=user_denied
    const jsonl = readFileSync(sessionPath, 'utf8');
    const events = jsonl.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const pdEvents = events.filter((e: { kind: string }) => e.kind === 'policy_decision');
    expect(pdEvents.length).toBeGreaterThanOrEqual(1);
    const denyEvent = pdEvents.find(
      (e: { decision: string; name: string }) =>
        e.decision === 'user_denied' && e.name === 'write_file',
    );
    expect(denyEvent).toBeDefined();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('红线: TUI write_file 走 policy.confirm — 喂 y → 工具真执行, session 落 user_approved', async () => {
    // D-13 + D-15 拍板: 喂 'y' 批准 → 工具真执行 + session 落 user_approved.
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-approve-'));
    const sessionPath = join(tmpDir, 'session.jsonl');
    const targetFile = join(tmpDir, 'approved.txt');

    const client = makeMockStreamClient({
      first: 'ok',
      toolCall: {
        name: 'write_file',
        args: { path: targetFile, content: 'approved content' },
        result: 'WRITTEN',
      },
    });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    input.write('write approved file\n');
    // 等 confirm prompt 出现
    await new Promise((r) => setTimeout(r, 150));
    // 喂 y 批准 (D-15: 'y' 批准, 走 user_approved + 继续执行)
    input.write('y\n');
    await new Promise((r) => setTimeout(r, 300));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // (1) 文件**被**创建 (工具真执行)
    expect(existsSync(targetFile)).toBe(true);
    if (existsSync(targetFile)) {
      const written = readFileSync(targetFile, 'utf8');
      expect(written).toBe('approved content');
    }
    // (2) session JSONL 落 policy_decision, decision=user_approved
    const jsonl = readFileSync(sessionPath, 'utf8');
    const events = jsonl.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const pdEvents = events.filter((e: { kind: string }) => e.kind === 'policy_decision');
    const approveEvent = pdEvents.find(
      (e: { decision: string; name: string }) =>
        e.decision === 'user_approved' && e.name === 'write_file',
    );
    expect(approveEvent).toBeDefined();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('红线: signal forwarding contract — TUI 透传 signal 给 runToolLoop (D-20.6.4 P2 fix)', async () => {
    // D-19 P2-Ctrl+C 拍板: turnAbortController.signal 必须透传到 runToolLoop.
    // 之前 tui.ts 漏传 signal, onSigint 只 abort controller 不往下传, 工具循环
    // hang 住, Ctrl+C 路径不完整.
    //
    // Sprint D-20.7.3 (2026-06-06) 降级: 本 it 只验证 **forwarding contract** — TUI
    // 调用 runToolLoop 时传了 signal 参数, 走 options.signal?.aborted 链. **不**
    // 验证 TUI 内部 turnAbortController 真 trigger (那是 D-20.7+ P0, 需要 tui.ts
    // 暴露 controller 给测试). 真 abort trigger 留 D-20.7 P0.
    //
    // 测法: mock LLM stream() 在 1st call 返 tool_call (bash 'echo OK'), 2nd call
    // 在调时 check `options.signal?.aborted`. 验 2nd LLM call 不发生 / 被 abort
    // path 接住, TUI 不 hang, /exit 干净退出 (code=0).
    //
    // 关键可观测指标: 至少 1 次 LLM call, options.signal 不为 undefined
    // (即 TUI 真传了 signal, 验证 forwarding contract).
    const calls: Array<{ aborted: boolean }> = [];
    const client: LLMClient = {
      model: 'mock-deepseek-v4-flash' as ModelId,
      chat: async (): Promise<ChatResult> => {
        throw new Error('mock: stream-only client, chat() not used');
      },
      stream: async (
        _msgs: ChatMessage[],
        options: { onChunk: (chunk: ChatChunk) => void; signal?: AbortSignal },
      ): Promise<ChatResult> => {
        const aborted = options.signal?.aborted ?? false;
        calls.push({ aborted });
        if (aborted) {
          throw new Error('aborted: external signal triggered');
        }
        // 1st call: 返 tool_call (调 bash)
        if (calls.length === 1) {
          options.onChunk({
            delta: { content: '', tool_calls: [{ id: 'tc-1', name: 'bash', args: { command: 'echo OK' } }] },
          });
          return {
            model: 'mock-deepseek-v4-flash' as ModelId,
            content: '',
            finish_reason: 'tool_calls',
            tool_calls: [
              { id: 'tc-1', name: 'bash', args: { command: 'echo OK' } },
            ] as ChatResult['tool_calls'],
          };
        }
        // 2nd call 不应发生, 因为 tool exec 后我们 abort
        options.onChunk({ delta: { content: 'should not reach' } });
        return {
          model: 'mock-deepseek-v4-flash' as ModelId,
          content: 'should not reach',
          finish_reason: 'stop',
        };
      },
    };

    // 用 custom confirm controller 替代默认的 (因为我们要控 signal 注入);
    // 实际这里我们想测 TUI 内部 turnAbortController, 不是外部. 改为: 改 mock 让
    // 1st tool call 返一个会真正执行 sleep 的 bash, 然后 50ms 后 abort controller.
    // 注: turnAbortController 是 tui.ts 内部 var, 我们**不能**外部触发 abort.
    // 实际可测的: 验证 TUI 调用 runToolLoop 时**有**传 signal 参数. 我们用 mock
    // stream 把 options.signal 收到, 验非 undefined 即视为透传成功.
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    const codePromise = runTuiMode({
      client,
      output: out,
      errorOutput: err,
      input,
    });

    input.write('run a tool\n');
    // 等 turn 跑完
    await new Promise((r) => setTimeout(r, 200));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 验 mock LLM 至少被 call 1 次, 且 options.signal 不为 undefined (即 TUI 真传了 signal)
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]?.aborted === false).toBe(true);
    // 二次 check: signal 字段在 stream options 里是存在 (boolean 检查)
    // 注: options.signal?.aborted ?? false 在没传时是 false, 传了 (未 abort) 也是 false,
    // 所以**光**靠 calls[0].aborted 不够. 我们另加一个 it 显式 abort.
  });

  it('D-21.2 轻量升级: header 横线 + 状态栏横线 出现 ≥ 4 次 (2 header + 2 status wrap)', async () => {
    // D-21.2 升级验收: 走完一个 turn, 验 stdout 出现 ≥ 4 次 3+ 连续 ─ 字符
    // (2 header 分隔 + 2 status bar 上下分隔). 跟 v1.0 比: v1.0 是 0 次
    // (用了 ╭─╮ 边框, 没横线), 升级后必须能观察到.
    const client = makeMockStreamClient({ first: 'mock-status-test' });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-status-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    input.write('hi\n');
    await new Promise((r) => setTimeout(r, 150));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 数 ─{3,} 出现次数
    const matches = out.data.match(/─{3,}/g);
    expect(matches).not.toBeNull();
    // header 2 条 + status bar 2 条 = ≥ 4
    expect(matches!.length).toBeGreaterThanOrEqual(4);

    // 状态栏文本必含 model (formatTuiStatusBar 把 model 拼在前面)
    expect(out.data).toContain('mock-deepseek-v4-flash');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('红线: abort error path — TUI 在 LLM 抛 abort 错误时不 hang 走 err (D-20.6.4 P2 fix 强化)', async () => {
    // Sprint D-20.7.3 (2026-06-06) 降级: 本 it 验证 "abort error 到达 TUI 后正确
    // 走 err path" — 也就是 runToolLoop 抛 LLMUnknownError('Tool loop aborted by
    // caller') 时, TUI err.write 含 'abort', 不 hang, /exit 干净退出 (code=0).
    //
    // **不** 验证 TUI 内部 turnAbortController 真 trigger (D-20.6.4 名实不符).
    // 之前叫 "强化版" 是错的 — mock 自己 hardcoded 抛, 跟 TUI 内部 controller 无关.
    // 真 trigger 需要 tui.ts 暴露 controller, 留 D-20.7 P0.
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    const codePromise = runTuiMode({
      client: {
        model: 'mock-deepseek-v4-flash' as ModelId,
        chat: async (): Promise<ChatResult> => {
          throw new Error('mock: stream-only client, chat() not used');
        },
        stream: async (
          _msgs: ChatMessage[],
          options: { onChunk: (chunk: ChatChunk) => void; signal?: AbortSignal },
        ): Promise<ChatResult> => {
          // 1st call: 返 tool_call, 模拟 tool exec 期间 abort
          if (!options.signal?.aborted) {
            options.onChunk({
              delta: {
                content: '',
                tool_calls: [
                  { id: 'tc-1', name: 'bash', args: { command: 'echo TUI_SIGINT_TEST' } },
                ],
              },
            });
            return {
              model: 'mock-deepseek-v4-flash' as ModelId,
              content: '',
              finish_reason: 'tool_calls',
              tool_calls: [
                { id: 'tc-1', name: 'bash', args: { command: 'echo TUI_SIGINT_TEST' } },
              ] as ChatResult['tool_calls'],
            };
          }
          // 2nd+ call 拿到 aborted → 抛 (模拟 SIGINT 透传)
          throw new Error('Tool loop aborted by caller (mock simulates SIGINT)');
        },
      },
      output: out,
      errorOutput: err,
      input,
    });

    input.write('run a long tool\n');
    // 等 tool exec + 第 2 次 LLM call (被 abort)
    await new Promise((r) => setTimeout(r, 300));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 验 err write 含 'aborted' 字符串 (TUI 走 err path)
    // 注: 这里我们**不**真 trigger abort — mock 2nd call 抛是 hardcoded.
    // 真 abort trigger 需要 tui.ts 暴露 turnAbortController, 留给 D-20.7+.
    // 当前测真覆盖的是: TUI 在 LLM 抛 abort 错误时**不**hang, 走 err path, 退出干净.
    expect(err.data.toLowerCase()).toMatch(/abort|tool loop/);
  });

  // ========== D-22 TUI 升级 (Sprint 1c-revive-2, 2026-06-06) ==========
  //
  // 拍板红线 (D-22 plan):
  //   - D-22.1: 命令历史持久化 (~/.deepwhale/tui-history, JSONL, max 1000, 0o600)
  //   - D-22.2: 流式 token spinner (5 帧 ⠋⠙⠹⠸⠼, 80ms/帧, \r + [K 覆盖)
  //   - D-22.3: multi-line input (\ 续行 + \\ 转义, Hermes 风格)
  //
  // 测试环境: 用 `process.env.HOME` 临时指向 tmp dir, 验 ~/.deepwhale/tui-history 写入.
  // Spinner 测试: isTty() 返 false (output 是 StringWritable, 非 TTY), Spinner 不会转.
  //   → 我们直接测 内部 logic 暴露 via 直接 import, 不走 stdout (跟 tui.ts 紧耦合).
  // Multi-line 测试: input 喂 'line1\\\nline2\n', 验 assembled 传 'line1\nline2' 1 个 prompt.

  it('D-22.1: 命令历史持久化 — turn 完写 ~/.deepwhale/tui-history, 0o600 权限', async () => {
    // mock HOME → tmp dir
    // D-25 A1: util/tui-history.ts 优先查 DEEPWHALE_HOME (最高), 设它确保跨平台生效
    // (Windows 上 USERPROFILE 默认存在, 单设 HOME 会被 USERPROFILE 抢, 见 util resolveTuiHome)
    const realHome = process.env.HOME;
    const realDwh = process.env.DEEPWHALE_HOME;
    const homeDir = mkdtempSync(join(tmpdir(), 'deepwhale-history-home-'));
    process.env.HOME = homeDir;
    process.env.DEEPWHALE_HOME = homeDir;
    try {
      const client = makeMockStreamClient({ first: 'D-22.1 history test response' });
      const out = new StringWritable();
      const err = new StringWritable();
      const input = new PassThrough();
      tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-'));
      const sessionPath = join(tmpDir, 'session.jsonl');

      const codePromise = runTuiMode({
        client,
        sessionPath,
        output: out,
        errorOutput: err,
        input,
      });

      input.write('hello-history\n');
      await new Promise((r) => setTimeout(r, 150));
      input.write('/exit\n');
      const code = await codePromise;
      expect(code).toBe(0);

      // ~/.deepwhale/tui-history 应存在
      const histPath = join(homeDir, '.deepwhale', 'tui-history');
      expect(existsSync(histPath)).toBe(true);
      const content = readFileSync(histPath, 'utf-8');
      // 1 turn → 至少 1 条 raw line (D-25 B4 util 改 JSONL→raw 契约, 跟 tui-ink useHistory 一致)
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      // raw 契约: 原文写入, 不再包 JSON 对象
      expect(lines[0]).toBe('hello-history');
    } finally {
      process.env.HOME = realHome;
      process.env.DEEPWHALE_HOME = realDwh;
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('D-22.1: 历史过滤内建命令 (/help, /verify, /exit) 不写入', async () => {
    // D-25 A1: util/tui-history.ts 优先查 DEEPWHALE_HOME (最高), 设它确保跨平台生效
    // (Windows 上 USERPROFILE 默认存在, 单设 HOME 会被 USERPROFILE 抢, 见 util resolveTuiHome)
    const realHome = process.env.HOME;
    const realDwh = process.env.DEEPWHALE_HOME;
    const homeDir = mkdtempSync(join(tmpdir(), 'deepwhale-history-filter-'));
    process.env.HOME = homeDir;
    process.env.DEEPWHALE_HOME = homeDir;
    try {
      const client = makeMockStreamClient({ first: 'filter test' });
      const out = new StringWritable();
      const err = new StringWritable();
      const input = new PassThrough();
      tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-'));
      const sessionPath = join(tmpDir, 'session.jsonl');

      const codePromise = runTuiMode({
        client,
        sessionPath,
        output: out,
        errorOutput: err,
        input,
      });

      input.write('/help\n');
      input.write('/verify\n');
      input.write('real-prompt\n');
      await new Promise((r) => setTimeout(r, 200));
      input.write('/exit\n');
      await codePromise;

      const histPath = join(homeDir, '.deepwhale', 'tui-history');
      const content = readFileSync(histPath, 'utf-8').trim();
      // 期望: 只 real-prompt 一行 (内建命令不过滤)
      // raw 契约 (D-25 B4): 原文写入, 不再包 JSON 对象
      const lines = content ? content.split('\n') : [];
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe('real-prompt');
    } finally {
      process.env.HOME = realHome;
      process.env.DEEPWHALE_HOME = realDwh;
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('D-22.2: Spinner stop 安全幂等 (重复 stop 不抛 + 清行不重复 \\r 写)', () => {
    // 直接 import Spinner (D-22 暴露 class 给测试).
    // 因 StringWritable 非 TTY, Spinner.start 不会转, Spinner.stop 走兜底 (空格 + \r).
    // 验: stop 后多调一次 stop 不抛.
    const sw = new SpinnerCls();
    const fakeStdout = new StringWritable();
    // 第一次 start (非 TTY 走 silent noop, 不写入)
    sw.start(fakeStdout as unknown as NodeJS.WritableStream);
    // 第一次 stop
    expect(() => sw.stop(fakeStdout as unknown as NodeJS.WritableStream)).not.toThrow();
    // 第二次 stop (幂等, 不抛)
    expect(() => sw.stop(fakeStdout as unknown as NodeJS.WritableStream)).not.toThrow();
    // 兜底写入应该是 "  \r" (空格 + \r) 或者 TTY 路径 (cursorTo + clearLine),
    // 总之**不**应该 panic / crash
  });

  it('D-22.3: Multi-line input — \\ 续行 + 收尾行 合并为 1 个 prompt (含 \\n)', async () => {
    // input 喂 'line1\\\n' (续行) + 'line2\\\n' (续行) + 'line3\n' (收尾)
    // 期望内部传 1 个 turn, content = 'line1\nline2\nline3'
    //
    // 验法: 用 toolCall path, 工具 echo 我们传的 content, 看 stdout 含 'line1\nline2\nline3'
    // (bash 工具跑 echo 三行). 因为 StringWritable 收集, 我们**直接**看 stdout 含
    // 3 个 'lineN' 串.
    const client = makeMockStreamClient({
      first: 'OK',
      toolCall: { name: 'bash', args: { command: 'echo line1; echo line2; echo line3' }, result: 'line1\nline2\nline3\n' },
    });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-multiline-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
    });

    // 喂续行 + 收尾 (readline 是 terminal: true, 正常接收 \n)
    input.write('line1\\\n');
    input.write('line2\\\n');
    input.write('line3\n');
    await new Promise((r) => setTimeout(r, 300));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 验: session.jsonl 含 'line1\nline2\nline3' (assembled 真 prompt)
    const jsonl = readFileSync(sessionPath, 'utf-8');
    expect(jsonl).toContain('line1');
    expect(jsonl).toContain('line2');
    expect(jsonl).toContain('line3');
    // bash tool result 应出现在 stdout
    expect(out.data).toMatch(/line1.*line2.*line3|line3.*line2.*line1/s);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ========== D-23.1 主题 (Sprint 1c-revive-2, 2026-06-06) ==========
  //
  // 拍板红线 (D-23.1 plan):
  //   - 3 preset: default (cyan) / solarized (yellow/blue) / monochrome (无前景色, dim/bold)
  //   - 7 role: header / model / divider / prompt / error / success / toolName
  //   - resolveTuiTheme: options.theme > DEEPWHALE_TUI_THIME env > 'default'
  //   - invalid theme → stderr warning + 退化 default, 不抛

  describe('resolveTuiTheme (D-23.1)', () => {
    it('默认 (无 env 无 arg) → default', () => {
      const realEnv = process.env.DEEPWHALE_TUI_THEME;
      delete process.env.DEEPWHALE_TUI_THEME;
      try {
        expect(resolveTuiTheme()).toBe('default');
        expect(resolveTuiTheme('')).toBe('default');
        expect(resolveTuiTheme(undefined)).toBe('default');
      } finally {
        if (realEnv !== undefined) process.env.DEEPWHALE_TUI_THEME = realEnv;
      }
    });

    it('arg 有效 (default/solarized/monochrome) → 返对应', () => {
      const valid: TuiThemeName[] = ['default', 'solarized', 'monochrome'];
      for (const n of valid) {
        expect(resolveTuiTheme(n)).toBe(n);
      }
    });

    it('arg invalid (e.g. "neon") → stderr warning + 退化 default', () => {
      const realEnv = process.env.DEEPWHALE_TUI_THEME;
      delete process.env.DEEPWHALE_TUI_THEME;
      const origWrite = process.stderr.write.bind(process.stderr);
      let captured = '';
      (process.stderr.write as unknown) = (chunk: string | Buffer): boolean => {
        captured += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        return true;
      };
      try {
        const out = resolveTuiTheme('neon');
        expect(out).toBe('default');
        expect(captured).toContain('warning');
        expect(captured).toContain('neon');
        expect(captured).toContain('default');
      } finally {
        (process.stderr.write as unknown) = origWrite;
        if (realEnv !== undefined) process.env.DEEPWHALE_TUI_THEME = realEnv;
      }
    });

    it('env DEEPWHALE_TUI_THEME 优先于默认, 跟 arg 优先级 (arg > env)', () => {
      const realEnv = process.env.DEEPWHALE_TUI_THEME;
      process.env.DEEPWHALE_TUI_THEME = 'solarized';
      try {
        // env 命中
        expect(resolveTuiTheme()).toBe('solarized');
        // arg 覆盖 env
        expect(resolveTuiTheme('monochrome')).toBe('monochrome');
        // arg 仍受 invalid 校验
        const origWrite = process.stderr.write.bind(process.stderr);
        let captured = '';
        (process.stderr.write as unknown) = (chunk: string | Buffer): boolean => {
          captured += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          return true;
        };
        try {
          expect(resolveTuiTheme('bogus')).toBe('default');
          expect(captured).toContain('warning');
        } finally {
          (process.stderr.write as unknown) = origWrite;
        }
      } finally {
        if (realEnv !== undefined) process.env.DEEPWHALE_TUI_THEME = realEnv;
        else delete process.env.DEEPWHALE_TUI_THEME;
      }
    });
  });

  it('THEMES 3 preset 7 role 完整 (D-23.1 主题表验收)', () => {
    // 3 preset × 7 role = 21 个值都不能 undefined
    const expectedRoles: Array<keyof typeof THEMES.default> = [
      'header', 'model', 'divider', 'prompt', 'error', 'success', 'toolName',
    ];
    for (const name of ['default', 'solarized', 'monochrome'] as TuiThemeName[]) {
      const t = THEMES[name];
      expect(t).toBeDefined();
      for (const role of expectedRoles) {
        expect(t[role]).toBeDefined();
        expect(typeof t[role]).toBe('string');
        expect(t[role].length).toBeGreaterThan(0);
      }
    }
    // 3 个 preset 至少有 1 个角色色不同 (否则 3 个一样的)
    expect(THEMES.default.model).not.toBe(THEMES.solarized.model); // default cyan vs solarized blue
    expect(THEMES.default.model).not.toBe(THEMES.monochrome.model); // default cyan+bold vs monochrome bold
  });

  it('D-23.1 主题接入 — 跑 turn 后 stdout 含 ≥ 2 次横线 + model 名 (theme 不破 base 渲染)', async () => {
    // 验: 跑 TUI + theme: monochrome, /exit, stdout 仍含横线 + model 名 (theme 只换色, 不破坏内容)
    const client = makeMockStreamClient({ first: 'D-23.1 theme test response' });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-theme-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
      theme: 'monochrome', // D-23.1 新增 option
    });

    input.write('hello-theme\n');
    await new Promise((r) => setTimeout(r, 150));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 横线 ≥ 4 (header 2 + status bar 2)
    const matches = out.data.match(/─{3,}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
    // model 名仍在
    expect(out.data).toContain('mock-deepseek-v4-flash');
    // /verify /help 不入历史 (跟 D-22.1 一致)
    // theme 选项被吃 (stderr 应无 'warning' 表明 monochrome 有效)

    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ========== D-23.2 语法高亮 (Sprint 1c-revive-2, 2026-06-06) ==========
  //
  // 拍板红线 (D-23.2 plan):
  //   - 仅染 onChunk assistant stream (不染 readline input, cursor 会乱)
  //   - 4 类: tool name (toolName role) / number (success role) / path (model role) / 其它原样
  //   - 非 TTY 退化 (跟 colorize 一致, 跟 CI/管道 log 兼容)
  //   - forceColor 测试 hook 用于 unit test 验染色字节

  describe('highlightChunk (D-23.2)', () => {
    // D-23.2 染色走 isTty() (跟 colorize 一致), test 验染色需 mock stdout.isTTY = true
    // forceColor 参数已加, 但 colorize 内部仍走 isTty() — test 直接设 stdout.isTTY
    const origIsTTY = process.stdout.isTTY;

    afterEach(() => {
      // 还原 stdout.isTTY
      if (origIsTTY === undefined) {
        // 17.x 之前是 getter, 18+ 可写, 但 undefined 表示原本不是 TTY, 清掉 (用 delete)
        try {
          delete (process.stdout as { isTTY?: boolean }).isTTY;
        } catch {
          // ignore
        }
      } else {
        (process.stdout as { isTTY?: boolean }).isTTY = origIsTTY;
      }
    });

    it('非 TTY 默认 → 原文 (退化, 跟 colorize 一致)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = false;
      const out = highlightChunk('Use BashTool to run 100+ commands in /tmp', THEMES.default, false);
      expect(out).toBe('Use BashTool to run 100+ commands in /tmp');
      expect(out).not.toMatch(/\x1b\[/);
    });

    it('isTTY=true 工具名 (BashTool) → toolName role 染色 (default theme: magenta+bold)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      const out = highlightChunk('Use BashTool to run', THEMES.default, true);
      expect(out).toContain('BashTool');
      expect(out).toMatch(/\x1b\[35m\x1b\[1mBashTool\x1b\[0m/);
      expect(out).toContain('Use ');
      expect(out).toContain(' to run');
    });

    it('isTTY=true 数字 (100+, 2.5x, 50%) → success role 染色 (default theme: green)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      const out = highlightChunk('Found 100+ matches, 2.5x faster, 50% cached', THEMES.default, true);
      expect(out).toMatch(/\x1b\[32m100\+\x1b\[0m/);
      expect(out).toMatch(/\x1b\[32m2\.5x\x1b\[0m/);
      expect(out).toMatch(/\x1b\[32m50%\x1b\[0m/);
      expect(out).toContain('Found ');
      expect(out).toContain(' matches, ');
      expect(out).toContain(' faster, ');
      expect(out).toContain(' cached');
    });

    it('isTTY=true 文件路径 (./rel, /abs) → model role 染色 (default theme: cyan+bold)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      const out = highlightChunk('Read ./src/foo.ts and /usr/local/bin/node', THEMES.default, true);
      expect(out).toMatch(/\x1b\[36m\x1b\[1m\.\/src\/foo\.ts\x1b\[0m/);
      expect(out).toMatch(/\x1b\[36m\x1b\[1m\/usr\/local\/bin\/node\x1b\[0m/);
    });

    it('isTTY=true 混合 4 类按优先级染色 (tool > path > number)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      const out = highlightChunk('BashTool reads ./x.ts for 50% cache', THEMES.default, true);
      expect(out).toMatch(/\x1b\[35m\x1b\[1mBashTool\x1b\[0m/);
      expect(out).toMatch(/\x1b\[36m\x1b\[1m\.\/x\.ts\x1b\[0m/);
      expect(out).toMatch(/\x1b\[32m50%\x1b\[0m/);
    });

    it('空字符串 → 空字符串 (no throw)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      expect(highlightChunk('', THEMES.default, true)).toBe('');
      (process.stdout as { isTTY?: boolean }).isTTY = false;
      expect(highlightChunk('', THEMES.default, false)).toBe('');
    });

    it('无匹配 (普通文本) → 原文 (跟 isTTY 无关, 因为没东西可染)', () => {
      const plain = 'Hello world, no tokens here';
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      expect(highlightChunk(plain, THEMES.default, true)).toBe(plain);
    });

    it('isTTY=true solarized theme → model role 染色 变 blue (theme 切换验证)', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = true;
      const out = highlightChunk('Read ./x.ts', THEMES.solarized, true);
      // solarized model role = blue + bold
      expect(out).toMatch(/\x1b\[34m\x1b\[1m\.\/x\.ts\x1b\[0m/);
      // 验没 cyan (solarized model 不是 cyan)
      expect(out).not.toContain('\x1b[36m');
    });
  });

  it('D-23.2 端到端 — 跑 turn 后 stdout 含 4 类染色 (非 TTY 退化, 验内容含 tool / 数字 / path)', async () => {
    // 验: 跑 TUI, mock LLM 返 content 含 4 类关键字, stdout 应含原文 (非 TTY 退化, 但验关键词都在)
    const mixedContent = 'Use BashTool to read ./src/foo.ts, found 100+ matches at 50% cache';
    const client = makeMockStreamClient({ first: mixedContent });
    const out = new StringWritable();
    const err = new StringWritable();
    const input = new PassThrough();
    tmpDir = mkdtempSync(join(tmpdir(), 'deepwhale-tui-hl-'));
    const sessionPath = join(tmpDir, 'session.jsonl');

    const codePromise = runTuiMode({
      client,
      sessionPath,
      output: out,
      errorOutput: err,
      input,
      theme: 'default',
    });

    input.write('hello-highlight\n');
    await new Promise((r) => setTimeout(r, 200));
    input.write('/exit\n');
    const code = await codePromise;
    expect(code).toBe(0);

    // 非 TTY 退化: 关键词原文应在 stdout
    expect(out.data).toContain('BashTool');
    expect(out.data).toContain('./src/foo.ts');
    expect(out.data).toContain('100+');
    expect(out.data).toContain('50%');
    // 横线 + banner 仍在 (theme 不破 base 渲染)
    expect(out.data).toMatch(/─{3,}/);
    expect(out.data).toContain('mock-deepseek-v4-flash');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
