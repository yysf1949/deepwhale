/**
 * tool-loop policy 集成测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 *
 * 覆盖 (D-13 验收红线):
 *   - 默认情况下 agent 不能无确认执行 destructive write/bash
 *   - 非交互模式不能假装确认 (print/rpc)
 *   - --yes 明确可追踪 (bypass require_confirmation, 不 bypass deny)
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

  it('bash rm -rf / + isInteractive=false → tool-loop policy 层先拦 (P1 a 修复后), 走 policy_blocked (双层防御)', async () => {
    // 拍板 (D-13 P1 修复 2026-06-05): tool-loop 调 evaluateBashCommand 合并 cmd+args,
    // `rm -rf /` 命中 DANGEROUS_BASH_PATTERNS 第一个, 拍 require_confirmation, 然后
    // isInteractive=false 兜底 deny → policy_blocked. BashTool 自身走不到.
    // 这跟 P1 a 修复一致: 危险 cmd 必过 tool-loop policy 层.
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
    // 拍板 (D-13 P1): tool-loop 层先拦, 走 policy_blocked + non-interactive
    expect(toolResult!.error).toMatch(/policy_blocked.*non-interactive/);
  });

  it('bash mv a b + isInteractive=true + yes=true → require_confirmation bypassed → 工具真执行', async () => {
    // yes=true bypass require_confirmation. 即便 bash 工具自身拍 require_confirmation,
    // tool-loop 的 policy 决策是 allow, tool 真执行.
    // 注: BashTool 自身 allowlist 含 mv (D-12 拍板), mv 不被 BashTool 拦; 走 tool-loop 层.
    const client = makeMockClient({
      id: 'c1',
      name: 'bash',
      // 拍板 (D-13 P1): mv 全部 require_confirmation, 但 mv 在 BashTool allowlist (D-12 拍板)
      // → 走 tool-loop policy 层, yes=true bypass 后 bash 真执行 mv
      args: { command: 'mv', args: ['/tmp/source', '/tmp/dest'] },
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

  // === Sprint 1c-revive-3-D-13 review P1(b) 修复 (2026-06-05) ===
  // 拍板 (用户 2026-06-05): "如果 raw 是 require_confirmation 且 yes=true, 先落 user_approved, 再执行工具"
  it('--yes bypass + writer 注入: session 落 user_approved event (bypassedByYes: true), 工具真执行', async () => {
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
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: true, // REPL 拍板交互模式
        yes: true, // --yes 拍板
        writer, // 拍板红线: audit 不能被 yes 抹平
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // 工具**真的执行了** (yes bypass require_confirmation)
      expect(toolResult!.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('new');
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      // 拍板红线 (P1 b 修复): yes bypass 必落 user_approved 审计
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.tool_call_id).toBe('c1');
        expect(ev.name).toBe('write_file');
        expect(ev.argsDigest).toMatch(/^sha256:[a-f0-9]{12}$/);
        expect(ev.reason).toMatch(/--yes bypass/);
        // 拍板: meta 含 bypassedByYes=true 方便 audit 工具区分
        expect((ev as { meta?: { bypassedByYes?: boolean } }).meta?.bypassedByYes).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--yes bypass 写文件 + BashTool allowlist 含 mv + mv 走 require_confirmation: yes bypass 后 bash 真执行', async () => {
    // 拍板 (D-13 P1): mv 全部 require_confirmation, 但 BashTool allowlist 含 mv (D-12 拍板)
    // → tool-loop policy 层拍 require_confirmation, yes=true bypass, 落 user_approved, bash 真执行
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const source = join(dir, 'source.txt');
      const dest = join(dir, 'dest.txt');
      writeFileSync(source, 'src');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();

      const client = makeMockClient({
        id: 'c1',
        name: 'bash',
        args: { command: 'mv', args: [source, dest] },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: true,
        yes: true,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // bash 真执行 (没被 policy_blocked, exit code != 0 也 OK 因为我们返 success=true)
      expect(toolResult!.error ?? '').not.toMatch(/policy_blocked/);
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.name).toBe('bash');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bash mv a b + isInteractive=true + yes=false + policy.confirm 显式 undefined: 走 no confirm impl → deny (D-13 兼容测, 保留 D-13 P2 拍板)', async () => {
    // 拍板 (D-15, 2026-06-05): D-13 P2 review 修复拍板 "REPL 现状 isInteractive=true 但
    // staticToolPolicy.confirm 是 undefined → 走 no confirm impl → deny (fail-closed)".
    // D-15 注入真 confirm 后这条测的"原意"变成 "未注入 confirm 实现 → 兜底 deny" —
    // D-13 兼容测, 留作 D-15 后人可验证未注入 confirm 的 ToolPolicy 仍走 fail-closed,
    // 不破坏 D-13 静态契约.
    const client = makeMockClient({
      id: 'c1',
      name: 'bash',
      args: { command: 'mv', args: ['a', 'b'] },
    });
    const policyNoConfirm: ToolPolicy = {
      evaluate: staticToolPolicy.evaluate,
      // 显式不传 confirm — 走 no confirm impl 分支
    };
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: policyNoConfirm,
      isInteractive: true, // REPL
      yes: false, // 无 --yes
      onChunk: () => {},
    });
    const toolResult = getToolStepResult(result);
    expect(toolResult!.success).toBe(false);
    // fail-closed deny, 拍板 跟 print/rpc 行为一致 (D-13 P2 修复)
    expect(toolResult!.error).toMatch(/policy_blocked: no confirm impl/);
  });

  // === Sprint 1c-revive-3-D-15 (2026-06-05): REPL confirm 注入补测 ===
  // 拍板 (D-15, 2026-06-05): REPL 注入真 confirm 实现后, 走 confirm 分支. 这 3 条测是
  // D-15 的端到端契约: y → 落 user_approved, n → 落 user_denied, --yes 优先 confirm 0 调用.

  it('D-15: write_file + isInteractive=true + yes=false + policy.confirm 注入 mock 返 true → 走 confirm 分支, 工具真执行 + 落 user_approved', async () => {
    // 拍板 (D-15, 2026-06-05): REPL 注入真 confirm 后, 不再走 no confirm impl → deny,
    // 而是调 confirm 函数. 这里用 mock confirm = () => true 模拟用户输 y.
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-d15-'));
    try {
      const target = join(dir, 'target.txt');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      let confirmCalls = 0;
      const confirmPolicy: ToolPolicy = {
        ...staticToolPolicy,
        confirm: async (_prompt: string) => {
          confirmCalls += 1;
          return true; // 模拟用户输 y
        },
      };
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'repl-confirmed' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: confirmPolicy,
        isInteractive: true, // REPL
        yes: false, // 无 --yes
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具真执行, 文件真落盘
      expect(toolResult!.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('repl-confirmed');
      // (2) confirm 函数被调了 1 次
      expect(confirmCalls).toBe(1);
      // (3) session 落 user_approved event
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.tool_call_id).toBe('c1');
        expect(ev.name).toBe('write_file');
        expect(ev.argsDigest).toMatch(/^sha256:[a-f0-9]{12}$/);
        expect(ev.reason).toBe('user approved');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('D-15: write_file + isInteractive=true + yes=false + policy.confirm 注入 mock 返 false → 走 confirm 分支, 工具不执行 + 落 user_denied', async () => {
    // 拍板 (D-15, 2026-06-05): REPL confirm 注入后, 用户输 n → 工具不执行 + 落 user_denied.
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-d15-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'original');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      let confirmCalls = 0;
      const confirmPolicy: ToolPolicy = {
        ...staticToolPolicy,
        confirm: async (_prompt: string) => {
          confirmCalls += 1;
          return false; // 模拟用户输 n
        },
      };
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'n-no' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: confirmPolicy,
        isInteractive: true, // REPL
        yes: false, // 无 --yes
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具不执行, 文件未覆盖
      expect(toolResult!.success).toBe(false);
      expect(toolResult!.error).toMatch(/policy_blocked: user denied confirmation/);
      expect(readFileSync(target, 'utf8')).toBe('original');
      // (2) confirm 函数被调了 1 次
      expect(confirmCalls).toBe(1);
      // (3) session 落 user_denied event
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_denied');
        expect(ev.tool_call_id).toBe('c1');
        expect(ev.name).toBe('write_file');
        expect(ev.reason).toBe('user denied'); // tool-loop.ts:376 reason="user denied" (无 "confirmation" 后缀, 跟 error msg 不同)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('D-15: write_file + isInteractive=true + yes=true + policy.confirm 注入 mock → ctx.yes 优先, confirm 函数 0 调用, 落 user_approved (bypassedByYes:true)', async () => {
    // 拍板 (D-15, 2026-06-05 + D-13.5 P1 重排红线): --yes 永远先于 confirm, 注入 confirm 后
    // 也要验证 --yes 走 ctx.yes 分支, confirm 0 调用, 落 user_approved (bypassedByYes:true).
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-d15-'));
    try {
      const target = join(dir, 'target.txt');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      let confirmCalls = 0;
      const confirmPolicy: ToolPolicy = {
        ...staticToolPolicy,
        confirm: async (_prompt: string) => {
          confirmCalls += 1;
          return true;
        },
      };
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'yes-priority' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: confirmPolicy,
        isInteractive: true, // REPL
        yes: true, // --yes 拍板
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具真执行
      expect(toolResult!.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('yes-priority');
      // (2) confirm 函数 0 调用 (--yes 优先, D-13.5 P1 重排红线)
      expect(confirmCalls).toBe(0);
      // (3) session 落 user_approved (bypassedByYes:true)
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.reason).toMatch(/--yes bypass/);
        const meta = (ev as { meta?: { bypassedByYes?: boolean; isInteractive?: boolean } }).meta;
        expect(meta?.bypassedByYes).toBe(true);
        expect(meta?.isInteractive).toBe(true); // REPL 模式
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  // === Sprint 1c-revive-3-D-13.5 review P1 重排补测 (2026-06-05) ===
  // 拍板 (用户 2026-06-05): 整段重排后, 旧顺序是 `!isInteractive` 先 deny, 根本没机会走 `ctx.yes`.
  // 新顺序 `ctx.yes` first → print/rpc (`isInteractive=false`) + `yes=true` 也能放行, 落 user_approved.
  // 这 2 条测是 D-13.5 重排的**行为差异真证据**, 缺一不可.

  it('D-13.5: write_file + isInteractive=false (print/rpc) + yes=true → ctx.yes 优先于 !isInteractive: 工具真执行 + 落 user_approved', async () => {
    // 拍板 (D-13.5 P1 重排 2026-06-05):
    //   旧顺序: !isInteractive 先命中 → deny (工具不执行, 即便 yes=true 也不 bypass)
    //   新顺序: ctx.yes 先命中 → 落 user_approved → 继续执行 → write_file 真落盘
    // 验证点:
    //   (1) tool result success=true (没被 policy_blocked, 文件真落盘)
    //   (2) session 落 1 个 policy_decision event, decision=user_approved
    //   (3) meta.bypassedByYes=true AND meta.isInteractive=false (print/rpc 模式触发 yes bypass)
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-d135-'));
    try {
      const target = join(dir, 'target.txt');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();

      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'yes-bypass-print' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: false, // print/rpc 模式 (跟 REPL isInteractive=true 区分)
        yes: true, // --yes 拍板
        writer, // 拍板红线: audit 不能被 yes 抹平
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) 工具真执行, 文件真落盘
      expect(toolResult!.success).toBe(true);
      expect(toolResult!.error ?? '').not.toMatch(/policy_blocked/);
      expect(readFileSync(target, 'utf8')).toBe('yes-bypass-print');

      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      // (2) 1 个 user_approved event
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.tool_call_id).toBe('c1');
        expect(ev.name).toBe('write_file');
        expect(ev.argsDigest).toMatch(/^sha256:[a-f0-9]{12}$/);
        expect(ev.reason).toMatch(/--yes bypass/);
        // (3) meta 含 bypassedByYes=true (audit 红线) + isInteractive=false (D-13.5 新加, 区分触发模式)
        const meta = (ev as { meta?: { bypassedByYes?: boolean; isInteractive?: boolean } }).meta;
        expect(meta?.bypassedByYes).toBe(true);
        expect(meta?.isInteractive).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('D-13.5: bash mv a b + isInteractive=false (print/rpc) + yes=true → ctx.yes 优先于 !isInteractive: bash 真执行 + 落 user_approved', async () => {
    // 拍板 (D-13.5 P1 重排 2026-06-05):
    //   旧顺序: !isInteractive 先命中 → deny (bash 不执行, yes=true 不 bypass)
    //   新顺序: ctx.yes 先命中 → 落 user_approved → bash 真跑 mv
    // 验证点:
    //   (1) tool result 没 policy_blocked error, bash 真跑 (mv 成功, source 没了 dest 在)
    //   (2) session 落 1 个 policy_decision event, decision=user_approved
    //   (3) meta.bypassedByYes=true AND meta.isInteractive=false
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-d135-'));
    try {
      const source = join(dir, 'source.txt');
      const dest = join(dir, 'dest.txt');
      writeFileSync(source, 'src-content');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();

      const client = makeMockClient({
        id: 'c1',
        name: 'bash',
        args: { command: 'mv', args: [source, dest] },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: false, // print/rpc 模式
        yes: true, // --yes 拍板
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      // (1) bash 真跑 mv (没被 policy_blocked)
      expect(toolResult!.error ?? '').not.toMatch(/policy_blocked/);
      // mv 真执行: source 没了, dest 在
      expect(existsSync(source)).toBe(false);
      expect(existsSync(dest)).toBe(true);
      expect(readFileSync(dest, 'utf8')).toBe('src-content');

      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      // (2) 1 个 user_approved event
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.tool_call_id).toBe('c1');
        expect(ev.name).toBe('bash');
        expect(ev.reason).toMatch(/--yes bypass/);
        // (3) meta
        const meta = (ev as { meta?: { bypassedByYes?: boolean; isInteractive?: boolean } }).meta;
        expect(meta?.bypassedByYes).toBe(true);
        expect(meta?.isInteractive).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
