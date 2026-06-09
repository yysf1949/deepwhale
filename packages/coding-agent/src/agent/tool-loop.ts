/**
 * Tool Loop — minimal agent loop (Sprint 1a)
 *
 * 协议（Codex/oh-my-pi 借鉴）：
 *   1. 把 system + history 喂给 LLM
 *   2. 如果 LLM 返回 tool_calls:
 *      - 用 ToolRegistry 调工具（schema 校验 Sprint 1b 加）
 *      - 把结果作为 tool 消息 push 回 messages
 *      - 回到 (1)
 *   3. 如果 LLM 返回 content（finish_reason='stop'）→ 终结
 *   4. 如果 max_steps 触顶 → 抛 ToolLoopLimitError
 *
 * Sprint 1a 范围（极简）：
 *   - 同步（不并发 tool_calls；DeepSeek V4 Flash 一次只调 1 个常见）
 *   - 不做 budget cap（v2.0）
 *   - 不做 schema 校验（trust LLM 输出，argparse 失败时 tool 返回 error 即可）
 *   - 不做 plan mode（v2.5）
 *   - 不做 cost accounting（1b 加）
 *   - 流式：可选 onChunk 回调（REPL 用）
 *
 * 错误处理：
 *   - tool 自身失败 → tool 消息 content 是 error，loop 继续
 *   - LLM 失败 → 抛 LLMError（caller 决定是否 retry/终止）
 *   - max_steps 触顶 → 抛 ToolLoopLimitError（caller 决定是否放弃）
 *
 * @module @deepwhale/coding-agent/agent
 */

import type { ChatMessage, ChatResult, LLMClient, LLMToolSchema, ToolCall } from '@deepwhale/llm';
import { canonicalizeSchema, LLMStreamError, LLMUnknownError } from '@deepwhale/llm';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolResult } from '../types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolPolicy } from '../policy/types.js';
import { evaluatePolicy } from '../policy/chain.js';
import { staticToolPolicy, evaluateBashCommand } from '../policy/static-rules.js';
import { computeArgsDigest } from '../policy/args-digest.js';
import { sanitizeReason } from '../policy/sanitize-reason.js';
import { appendPolicyDecisionEvent } from './session-adapter.js';
import type { SessionWriter } from '@deepwhale/core';

/** Sprint 1a 默认：跟 LLM 来回 5 轮（够用 coding agent 短任务，长任务 caller 调高）。 */
export const TOOL_LOOP_DEFAULT_MAX_STEPS = 5;

export interface ToolLoopOptions {
  /** 注入工具注册表（默认 createDefaultRegistry()）。 */
  registry?: ToolRegistry;
  /** 上限：单次 loop LLM call 次数（含 tool_calls 触发的回传）。默认 5。 */
  maxSteps?: number;
  /** 给所有 tool 调用的 timeout ms。Sprint 1a 不支持单 tool 自定义 timeout。 */
  toolTimeoutMs?: number;
  /** 流式 chunk 回调（null/undefined = 不流式）。REPL 接 onChunk 实时打印。 */
  onChunk?: (chunk: { content?: string; tool_calls?: ReadonlyArray<ToolCall> }) => void;
  /** 外部 abort signal（Ctrl-C / session 结束）。 */
  signal?: AbortSignal;
  /**
   * Sprint 1c-revive-3-D-13 (2026-06-05): tool call policy.
   * 默认 staticToolPolicy. 显式传 null = 不检查 (单测用).
   * 拍板: 'allow' 不写 session, 只有 deny / require_confirmation 落 policy_decision.
   */
  policy?: ToolPolicy | null;
  /** Sprint 1c-revive-3-D-13: 模式是否可交互 (REPL = true, print/rpc 默认 = false). */
  isInteractive?: boolean;
  /** Sprint 1c-revive-3-D-13: --yes 标志. yes=true bypass require_confirmation, 不 bypass deny. */
  yes?: boolean;
  /** Sprint 1c-revive-3-D-13: session writer 注入 (写 policy_decision event 用). */
  writer?: SessionWriter | null;
}

export type ToolLoopStep =
  | { kind: 'assistant'; ts: number; message: ChatMessage; result: ChatResult }
  | {
      kind: 'tool';
      ts: number;
      tool_call: ToolCall;
      result: ToolResult;
      duration_ms: number;
    }
  | { kind: 'limit'; ts: number; steps: number; lastResult: ChatResult }
  | { kind: 'error'; ts: number; error: Error };

export interface ToolLoopResult {
  /** 全部 messages（含 tool_calls 步骤），caller 用来继续下一轮。 */
  messages: ChatMessage[];
  /** 最后一次 assistant ChatResult（content + tool_calls + usage）。 */
  final: ChatResult;
  /**
   * 完整 step 序列（含 tool 调用、limit、error），caller 用来回放/审计/持久化。
   * Sprint 1a 极简：caller 通过 runToolLoop 后读取 .steps 自己落盘。
   * Sprint 1b 加 onStep 实时回调（避免 caller 等跑完才落）。
   */
  steps: ToolLoopStep[];
}

/**
 * 错误：maxSteps 触顶、LLM 一直在调工具不收敛。
 * caller 通常应当：缩短 prompt / 拆任务 / 主动放弃。
 */
export class ToolLoopLimitError extends Error {
  override readonly name = 'ToolLoopLimitError' as const;
  readonly isToolLoopError = true as const;
  constructor(
    public readonly steps: number,
    public readonly lastResult: ChatResult,
  ) {
    super(`Tool loop exceeded max steps (${steps}); LLM kept calling tools without stopping`);
  }
}

/** 类型守卫。 */
export function isToolLoopError(err: unknown): err is ToolLoopLimitError {
  return err instanceof Error && (err as { isToolLoopError?: unknown }).isToolLoopError === true;
}

/**
 * 执行一轮 tool loop。
 *
 * 行为契约：
 *   - 不修改输入 messages（immutable），返回**新**数组（带 tool 步骤）
 *   - 任何 LLM 调用失败 → 抛 LLMError（ToolLoopStep.error 事件也写入 steps）
 *   - tool 自身失败 → 不抛，包成 tool 消息的 error content 继续
 *   - maxSteps 触顶 → 抛 ToolLoopLimitError（steps 同时写入）
 *   - 外部 abort → 抛带 cause 的 LLMUnknownError（包装 AbortError）
 *
 * Sprint 1a 限制：
 *   - 只支持非流式调用时 onChunk=null；有 onChunk 时走 stream()。
 *   - onChunk 触发的内容**也**写入最终 final.content（assembled）
 */
export async function runToolLoop(
  client: LLMClient,
  messages: ReadonlyArray<ChatMessage>,
  options: ToolLoopOptions = {},
): Promise<ToolLoopResult> {
  const maxSteps = options.maxSteps ?? TOOL_LOOP_DEFAULT_MAX_STEPS;
  const registry = options.registry;
  const onChunk = options.onChunk;
  const toolTimeoutMs = options.toolTimeoutMs;

  if (registry === undefined) {
    throw new LLMUnknownError('ToolLoop: registry is required (no default in Sprint 1a)');
  }

  // 复制 messages 到可变数组(Sprint 1a 保持 caller 引用不变)
  const working: ChatMessage[] = [...messages];
  const steps: ToolLoopStep[] = [];
  let lastResult!: ChatResult;

  for (let stepIdx = 0; stepIdx < maxSteps; stepIdx += 1) {
    if (options.signal?.aborted) {
      throw new LLMUnknownError('Tool loop aborted by caller', { cause: options.signal.reason });
    }

    // 1) 调 LLM
    const tools = buildLlmTools(registry.list());
    try {
      lastResult = onChunk
        ? await runStreamStep(client, working, tools, onChunk, options.signal)
        : await client.chat(working, {
            tools,
            tool_choice: 'auto',
            ...(options.signal !== undefined ? { signal: options.signal } : {}),
          });
    } catch (err) {
      steps.push({ kind: 'error', ts: Date.now(), error: err as Error });
      throw err;
    }

    // 2) 把 assistant 消息写进 working(tool_calls 必带;content 可能空)
    // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 DeepSeek V4 thinking 400 bug):
    // reasoning_content 也写进 working, 让下轮 LLM call 时 toWireMessage 透传.
    // DeepSeek V4 默认开 thinking, 多轮必须回传上轮 reasoning, 否则 400.
    // 不开 thinking 时 (V3 旧 alias / thinking 关) lastResult.reasoning_content
    // 是 undefined, 字段 absent, 行为不变.
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: lastResult.content,
      ...(lastResult.reasoning_content !== undefined
        ? { reasoning_content: lastResult.reasoning_content }
        : {}),
    };
    if (lastResult.tool_calls && lastResult.tool_calls.length > 0) {
      assistantMsg.tool_calls = lastResult.tool_calls;
    }
    working.push(assistantMsg);
    steps.push({
      kind: 'assistant',
      ts: Date.now(),
      message: assistantMsg,
      result: lastResult,
    });

    // 3) 如果没 tool_calls → 收敛,return
    const tcs = lastResult.tool_calls;
    if (!tcs || tcs.length === 0) {
      return { messages: working, final: lastResult, steps };
    }

    // 4) 执行 tool_calls(同步串行)
    for (const tc of tcs) {
      if (options.signal?.aborted) {
        throw new LLMUnknownError('Tool loop aborted by caller', { cause: options.signal.reason });
      }
      const toolResult = await executeToolCall(registry, tc, toolTimeoutMs, options.signal, {
        ...(options.policy !== undefined ? { policy: options.policy } : {}),
        ...(options.isInteractive !== undefined ? { isInteractive: options.isInteractive } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(options.writer !== undefined ? { writer: options.writer } : {}),
      });
      const toolMsg: ChatMessage = {
        role: 'tool',
        content: formatToolResult(toolResult),
        tool_call_id: tc.id,
        name: tc.name,
      };
      working.push(toolMsg);
      steps.push({
        kind: 'tool',
        ts: Date.now(),
        tool_call: tc,
        result: toolResult,
        duration_ms: (toolResult.meta?.['duration_ms'] as number) ?? 0,
      });
    }
  }

  // 5) 触顶
  steps.push({ kind: 'limit', ts: Date.now(), steps: maxSteps, lastResult });
  throw new ToolLoopLimitError(maxSteps, lastResult);
}

// ============================================================================
// 内部 helper
// ============================================================================

/**
 * 把 ToolRegistry 里的工具转成 LLM 看得懂的 wire schema。
 * Sprint 1b (Prefix-cache 机制 4): canonicalizeSchema 让 key 顺序稳定,
 * LLM 端 hash 稳定 → prefix-cache 命中率不再因 property 顺序抖动归零。
 * (对齐 Reasonix schema_canonicalize.go:10-67)
 */
function buildLlmTools(tools: ReadonlyArray<Tool>): ReadonlyArray<LLMToolSchema> {
  return tools.map((t) =>
    canonicalizeSchema({
      name: t.name,
      description: t.description,
      parameters: t.schema as unknown as LLMToolSchema['parameters'],
    }),
  );
}

/**
 * 调单个 tool。
 * Sprint 1a：直接 execute()，不做 schema 校验(LLM 错了包成 tool 错误继续)。
 * Sprint 1a 超时策略：toolTimeoutMs 由外层 setTimeout + AbortController 统一包。
 * Sprint 1c-revive-3-D-13 (2026-06-05): policy gate 在 execute 之前.
 *   拍板: deny / require_confirmation 都返 success=false, LLM 续聊看到 tool 错误.
 *   bash 工具自身用 evaluateBashCommand 拍 cmd 危险模式, 双重防线 (tool-loop 一层 + bash 工具一层).
 */
async function executeToolCall(
  registry: ToolRegistry,
  tc: ToolCall,
  toolTimeoutMs: number | undefined,
  externalSignal: AbortSignal | undefined,
  options: {
    policy?: ToolPolicy | null;
    isInteractive?: boolean;
    yes?: boolean;
    writer?: SessionWriter | null;
  } = {},
): Promise<ToolResult> {
  const tool = registry.get(tc.name);
  if (!tool) {
    return {
      success: false,
      content: '',
      error: `tool-not-found: '${tc.name}' is not registered. Available: ${registry
        .list()
        .map((t) => t.name)
        .join(', ')}`,
    };
  }

  // Sprint 1c-revive-3-D-13: policy check (在 execute 之前, 拍板红线 deny 默认走 fail-closed)
  // 拍板 (用户 2026-06-05):
  //   - 'allow' 不写 session, 也不在 tool result 里加 meta (除 yes bypass 走 user_approved 拍板)
  //   - 'deny' / 'require_confirmation' 走 fail-closed: tool 不执行, 返 success=false
  //   - 非交互模式 + require_confirmation → policy_blocked (no interactive confirmation)
  //   - session 写 fail → 抛 (audit 红线, 写不进就拒绝继续)
  //
  // Sprint 1c-revive-3-D-13 review P1(b) 修复 (2026-06-05): --yes bypass 落 user_approved 审计
  //   拍板 (用户 2026-06-05): "保持 PolicyDecision 简洁, 在 tool-loop.ts 里保留 raw decision".
  //   实现: 在 require_confirmation 分支里, 如果 ctx.yes=true, 落 user_approved 事件再
  //   继续执行 (绕过交互确认), tool result 仍返 success (不返 policy_blocked).
  if (options.policy !== null) {
    const policy = options.policy ?? staticToolPolicy;
    const argsDigest = computeArgsDigest(tc.args);
    const ctx = {
      isInteractive: options.isInteractive ?? false,
      yes: options.yes ?? false,
      argsDigest,
    };
    let decision = evaluatePolicy({ name: tc.name as ToolName, argsDigest }, ctx, policy);

    // bash 工具自身层用 evaluateBashCommand 拍 cmd 危险模式 (双重防线).
    // tool-loop 这层 staticToolPolicy 走 allow, 不会 deny; 改走 bash 自身层.
    if (tc.name === 'bash' && decision.decision !== 'deny' && decision.decision === 'allow') {
      const cmd = (tc.args['command'] as string | undefined) ?? '';
      const args = (tc.args['args'] as ReadonlyArray<string> | undefined) ?? [];
      const bashDecision = evaluateBashCommand(cmd, args);
      if (bashDecision.decision === 'require_confirmation') {
        decision = evaluatePolicy({ name: tc.name as ToolName, argsDigest }, ctx, {
          evaluate: () => bashDecision,
        });
      }
    }

    if (decision.decision === 'deny') {
      const reason = sanitizeReason(decision.reason);
      // 落 session (拍板: 'deny' 写 policy_decision)
      if (options.writer) {
        await appendPolicyDecisionEvent(options.writer, {
          tool_call_id: tc.id,
          name: tc.name,
          decision: 'deny',
          argsDigest,
          reason,
        });
      }
      return {
        success: false,
        content: '',
        error: `policy_blocked: ${reason}`,
        meta: { argsDigest, policy: 'deny' },
      };
    }
    if (decision.decision === 'require_confirmation') {
      // === Sprint 1c-revive-3-D-13.5 review P1 重排 (2026-06-05) ===
      // 顺序拍板 (用户 2026-06-05): ctx.yes first → !isInteractive → policy.confirm.
      // 理由: --yes 是显式用户拍板, 必须最先处理 (audit 红线不丢);
      //       非交互模式是机器模式 (print/rpc), 没用户就 deny (fail-closed);
      //       最后才走 policy.confirm (REPL D-15 才会注入, D-13 MVP 落 no-confirm-impl deny).
      // 不要最小插入留阅读陷阱: 整段重排成下面 4 个分支, 一段一段看完就懂优先级.

      // 1) ctx.yes first: --yes 显式拍板, 落 user_approved 后放行 (audit 红线).
      if (ctx.yes) {
        if (options.writer) {
          await appendPolicyDecisionEvent(options.writer, {
            tool_call_id: tc.id,
            name: tc.name,
            decision: 'user_approved',
            argsDigest,
            reason: sanitizeReason(`--yes bypass: ${decision.reason}`),
            meta: { bypassedByYes: true, isInteractive: ctx.isInteractive },
          });
        }
        // 不返, 继续往下走 (执行工具)
      } else if (!ctx.isInteractive) {
        // 2) 非交互模式: print/rpc 没有用户, 默认 deny (R-3 拍板: fail-closed).
        const reason = sanitizeReason(`non-interactive mode: ${decision.reason}`);
        if (options.writer) {
          await appendPolicyDecisionEvent(options.writer, {
            tool_call_id: tc.id,
            name: tc.name,
            decision: 'deny',
            argsDigest,
            reason,
            meta: { isInteractive: false },
          });
        }
        return {
          success: false,
          content: '',
          error: `policy_blocked: ${reason}`,
          meta: { argsDigest, policy: 'require_confirmation', isInteractive: false },
        };
      } else if (typeof policy.confirm === 'function') {
        // 3) 交互模式 + 注入 confirm: 走 y/N (D-15 注入 readline; D-13 MVP 没人调这条).
        // Sprint 1c-revive-3-D-19 (2026-06-05): 透传 externalSignal 给 confirm (Ctrl+C / turn 取消).
        // 拍板 (D-19): repl-confirm.ts 拿到 signal 后, abort 时立即 resolve null (dismissed).
        // 老 confirm() 实现 (单参 prompt) 继续合法 (opts 默认 undefined).
        const ok = await policy.confirm(`Allow ${tc.name}? (${sanitizeReason(decision.reason)})`, {
          ...(externalSignal !== undefined ? { signal: externalSignal } : {}),
        });
        const userDecision: 'user_approved' | 'user_denied' =
          ok === true ? 'user_approved' : 'user_denied';
        if (options.writer) {
          await appendPolicyDecisionEvent(options.writer, {
            tool_call_id: tc.id,
            name: tc.name,
            decision: userDecision,
            argsDigest,
            reason: ok === true ? 'user approved' : `user ${ok === false ? 'denied' : 'dismissed'}`,
          });
        }
        if (ok !== true) {
          return {
            success: false,
            content: '',
            error: `policy_blocked: user ${ok === false ? 'denied' : 'dismissed'} confirmation`,
            meta: { argsDigest, policy: 'require_confirmation', userDecision: ok },
          };
        }
      } else {
        // 4) 交互模式 + 没 confirm 实现: 兜底 deny (fail-closed, D-13 MVP 现状).
        const reason = sanitizeReason(`no confirm impl: ${decision.reason}`);
        if (options.writer) {
          await appendPolicyDecisionEvent(options.writer, {
            tool_call_id: tc.id,
            name: tc.name,
            decision: 'deny',
            argsDigest,
            reason,
            meta: { reason: 'no-confirm-impl' },
          });
        }
        return {
          success: false,
          content: '',
          error: `policy_blocked: ${reason}`,
          meta: { argsDigest, policy: 'require_confirmation', reason: 'no-confirm-impl' },
        };
      }
    }
    // 'allow' 走默认, 不落 session, 不返特殊 meta
  }

  // Sprint 1a 修 P2-B:tool 自带 timeout 不支持,通过外层 setTimeout + Promise.race 包一层强制中断。
  // 不动 Tool.execute() 签名(Sprint 1a 简化),而是 race 出 timeout 时 reject 让上层 catch 包成 tool 错误。
  // 同步清掉 timer 避免进程 hang。
  let timer: NodeJS.Timeout | undefined;
  let timeoutReason: unknown;
  const executePromise = Promise.resolve().then(() => tool.execute(tc.args));
  let timeoutPromise: Promise<never> | undefined;
  if (toolTimeoutMs !== undefined) {
    timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timeoutReason = new Error(`tool-timeout: '${tc.name}' exceeded ${toolTimeoutMs}ms`);
        reject(timeoutReason);
      }, toolTimeoutMs);
    });
  }
  // externalSignal 一旦 abort,立即 reject 以让 race 收敛
  const externalAbortPromise: Promise<never> | undefined = externalSignal
    ? new Promise<never>((_resolve, reject) => {
        if (externalSignal!.aborted) {
          reject(new Error('aborted: external signal already triggered'));
          return;
        }
        externalSignal!.addEventListener(
          'abort',
          () => reject(new Error('aborted: external signal triggered')),
          { once: true },
        );
      })
    : undefined;

  const start = Date.now();
  try {
    const raceCandidates: Array<Promise<unknown>> = [executePromise];
    if (timeoutPromise) raceCandidates.push(timeoutPromise);
    if (externalAbortPromise) raceCandidates.push(externalAbortPromise);
    const result = (await Promise.race(raceCandidates)) as ToolResult;
    return {
      ...result,
      meta: { ...(result.meta ?? {}), duration_ms: Date.now() - start },
    };
  } catch (err) {
    // 区分是 tool 自身抛错,还是 timeout/abort 包出来的错
    const isSynthetic =
      err === timeoutReason || (err instanceof Error && /^(aborted:)/.test(err.message));
    return {
      success: false,
      content: '',
      error: isSynthetic
        ? err instanceof Error
          ? err.message
          : String(err)
        : `tool-threw: ${err instanceof Error ? err.message : String(err)}`,
      meta: { duration_ms: Date.now() - start },
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal && externalAbortPromise) {
      externalSignal.removeEventListener('abort', () => {});
    }
  }
}

/**
 * 把 ToolResult 序列化成 tool 消息的 content。
 *
 * Sprint 1a 简化：success 时返回 content；失败时返回 [error] xxx。
 * Sprint 1b 会改成 Observation 4 字段 + Recovery 3 字段 schema 统一形态。
 */
function formatToolResult(r: ToolResult): string {
  if (r.success) return r.content;
  return `[error] ${r.error ?? 'unknown tool error'}`;
}

/**
 * 走 stream API 的一步：assemble chunks 到 final result，复用 chat() 的同等逻辑。
 *
 * Sprint 1a 简化：stream 模式下，tool_calls 一次性在最后 chunk 出现（DeepSeek V4 当前实现）。
 * 如果未来 OAI 协议增量给 tool_calls（index 字段递增），sprint 1b 再加增量合并。
 */
async function runStreamStep(
  client: LLMClient,
  messages: ReadonlyArray<ChatMessage>,
  tools: ReadonlyArray<LLMToolSchema>,
  onChunk: (chunk: { content?: string; tool_calls?: ReadonlyArray<ToolCall> }) => void,
  signal: AbortSignal | undefined,
): Promise<ChatResult> {
  try {
    const result = await client.stream([...messages], {
      tools,
      tool_choice: 'auto',
      ...(signal !== undefined ? { signal } : {}),
      onChunk: (c) => {
        if (c.delta.content) onChunk({ content: c.delta.content });
        if (c.delta.tool_calls) onChunk({ tool_calls: c.delta.tool_calls });
      },
    });
    return result;
  } catch (err) {
    if (err instanceof LLMStreamError) {
      throw new LLMUnknownError(`Stream step failed: ${err.message}`, { cause: err });
    }
    throw err;
  }
}

// ============================================================================
// v2.5 runTaskLoop — Executor role with pre-decomposed tasks
// ============================================================================

/**
 * v2.5 runTaskLoop — Executor that runs a pre-decomposed list of tasks
 * in dependency order. The Planner (separate role) decomposes goals; the
 * Executor (this function) runs them.
 *
 * Contract (D-33.4.2):
 *   - Tasks are NOT decomposed here. Calling `runTaskLoop` is the Executor.
 *   - If a task has no `tool` field, it is recorded as skipped (success=true,
 *     summary='no-tool-attached'). This is a deliberate "executor cannot
 *     decompose" boundary — the Planner must have attached a tool.
 *   - Stops on first failure (any tool returning success=false).
 *   - Tasks whose dependencies failed/skipped are themselves skipped.
 *
 * v1.0 contract (runToolLoop) is NOT modified — this is a NEW export.
 */
export interface RunTaskLoopTask {
  id: string;
  goal: string;
  dependsOn: ReadonlyArray<string>;
  tool?: { name: string; input: Record<string, unknown> };
}

export interface RunTaskLoopOptions {
  tasks: ReadonlyArray<RunTaskLoopTask>;
  registry: ToolRegistry;
  signal?: AbortSignal;
}

export interface RunTaskLoopResult {
  results: Array<{
    taskId: string;
    success: boolean;
    summary?: string;
    error?: string;
  }>;
}

export async function runTaskLoop(options: RunTaskLoopOptions): Promise<RunTaskLoopResult> {
  const { tasks, registry, signal } = options;
  const results: RunTaskLoopResult['results'] = [];
  const status = new Map<string, 'pending' | 'running' | 'done' | 'failed' | 'skipped'>();
  for (const t of tasks) status.set(t.id, 'pending');

  // Process ready tasks in id order, repeatedly, until all done or a failure blocks progress.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const task of tasks) {
      if (status.get(task.id) !== 'pending') continue;
      // Check if all dependencies are done.
      const allDepsDone = task.dependsOn.every((d) => status.get(d) === 'done');
      if (!allDepsDone) {
        // If any dep is failed or skipped, this task is blocked → skip.
        const anyBlocked = task.dependsOn.some(
          (d) => status.get(d) === 'failed' || status.get(d) === 'skipped',
        );
        if (anyBlocked) {
          status.set(task.id, 'skipped');
          results.push({
            taskId: task.id,
            success: false,
            summary: 'skipped: dependency failed or skipped',
          });
          progressed = true;
        }
        continue;
      }

      if (signal?.aborted) {
        status.set(task.id, 'failed');
        results.push({ taskId: task.id, success: false, error: 'aborted' });
        return { results };
      }

      status.set(task.id, 'running');

      if (!task.tool) {
        // Executor cannot decompose — Planner must attach a tool.
        status.set(task.id, 'done');
        results.push({ taskId: task.id, success: true, summary: 'no-tool-attached' });
        progressed = true;
        continue;
      }

      const tool = registry.get(task.tool.name);
      if (!tool) {
        status.set(task.id, 'failed');
        results.push({
          taskId: task.id,
          success: false,
          error: `tool-not-found: '${task.tool.name}'`,
        });
        return { results };
      }

      let toolResult;
      try {
        toolResult = await tool.execute(task.tool.input);
      } catch (err) {
        toolResult = {
          success: false,
          content: '',
          error: `tool-threw: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }

      if (toolResult.success) {
        status.set(task.id, 'done');
        results.push({
          taskId: task.id,
          success: true,
          summary: toolResult.content.slice(0, 200),
        });
        progressed = true;
      } else {
        status.set(task.id, 'failed');
        results.push({
          taskId: task.id,
          success: false,
          error: toolResult.error ?? 'tool failed',
        });
        // Stop on first failure.
        return { results };
      }
    }
  }

  return { results };
}
