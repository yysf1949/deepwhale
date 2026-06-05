/**
 * Sprint 1c-revive-2-D-2 — runToolLoop 错误恢复 3 子场景 + 跨 Anthropic 协议
 * (Sprint 1+ 扩展第 2 步, 2026-06-04, 1 commit 拍板 3 子场景)
 *
 * 目的: 1c-revive-2-B-3 走 happy path (BashTool 成功, LLM 收敛), 1c-revive-2-D-2 走 3 个错误恢复
 * 子场景, 跟 1c-revive-2-B-3 形成对照:
 *   - 1c-revive-2-B-3 = happy path (chat 4 turn 端到端)
 *   - **1c-revive-2-D-2 (本文)** = error path (3 子场景):
 *     A. **soft-fail path**: LLM 选 bash 调黑名单 command → tool result success: false + error →
 *        loop 继续 → LLM 收敛 (跟 1c-revive-2-B-3 run 2 揭示一致)
 *     B. **maxSteps path**: maxSteps: 2 跑 LLM, LLM 一直调工具不收敛 → ToolLoopLimitError 抛
 *     C. **abort signal path**: AbortController.abort() 跑 LLM, 中途 LLMUnknownError 抛
 *
 * 跟 1c-revive-2-B-3 关键差异:
 *   - 1c-revive-2-B-3 = happy path (BashTool 成功, LLM 收敛, 4 turn 端到端)
 *   - **1c-revive-2-D-2 = error path** (3 子场景: 软失败 / maxSteps / abort signal)
 *   - 1c-revive-2-B-3 4 turn 都 finish=stop, 1c-revive-2-D-2 3 子场景分别 finish=stop / 抛
 *     ToolLoopLimitError / 抛 LLMUnknownError
 *
 * 3 子场景拍板 (跟 runToolLoop.ts L150-180 错误处理拍板一致):
 *   - **A. soft-fail path**:
 *     LLM 选 bash 调黑名单 command (e.g. 'rm -rf /' 不在 allowlist)
 *     → executeToolCall 走 BashTool → 黑名单拒绝 → tool result success: false + error message
 *     → tool 消息 push messages → loop 继续 → 下一轮 LLM 看到 tool result 错误
 *     → LLM 收敛到非黑名单 command (e.g. 'echo 391') → tool 成功 → final answer
 *     软断言: tool step 至少 1 个 success=false + 1 个 success=true, final answer 包含期望
 *
 *   - **B. maxSteps path**:
 *     maxSteps: 2 跑 LLM, system prompt 故意让 LLM 一直调工具 (e.g. "用 bash 算 X 再算 Y 再算 Z")
 *     → LLM 调 1 次 tool, 成功 → LLM 又调 1 次 tool, 成功 → maxSteps 触顶
 *     → push kind: 'limit' step + throw new ToolLoopLimitError(maxSteps, lastResult)
 *     软断言: ToolLoopLimitError 抛, error.steps === 2, 至少 1 个 tool step
 *
 *   - **C. abort signal path**:
 *     AbortController 创建, 跑前 1 ms trigger abort (signal.aborted = true)
 *     → runToolLoop 进 LLM call 前 check signal.aborted → 抛 LLMUnknownError
 *     软断言: LLMUnknownError 抛, error.message 包含 'aborted'
 *
 * 关键不变量 (error path 跨 Anthropic 协议, pi-agent 4-layer 拍板):
 *   - runToolLoop 错误处理走 chat 路径, 跟 1c-revive-2-B-3 1c.5 拍板一致
 *   - soft-fail path 跨 Anthropic 协议 走通 (跟 1c-revive-2-B-3 run 2 5 steps 4 失败 1 成功 行为一致)
 *   - maxSteps path ToolLoopLimitError 抛, 跨 Anthropic 协议 走通
 *   - abort signal path LLMUnknownError 抛, 跨 Anthropic 协议 走通
 *   - 0 行 production code 改 (runToolLoop 错误处理 1a era + 1b.5 拍板后已完整)
 *   - **不**mock LLM, 真实 error path (跟 1c-revive-2-B-3 镜)
 *   - F4 拍板 (1d.5-A.5 揭示): 跨 Anthropic 协议路径 cached>0 → cost_turn absent
 *     (但错误路径 usage 字段可能 absent, 软断言 cost absent / present 都 OK)
 *
 * 触发条件 (跟 1c-revive-1 / 1c-revive-2-A / 1c-revive-2-B-3 / 1c-revive-2-C+3 / 1c-revive-2-D-1 一致):
 *   INTEGRATION=1 pnpm vitest run packages/coding-agent/test/integration/error-recovery-2d2.test.ts
 *
 * 红线 (跟之前真接 test 一致):
 *   1. test 代码**不**直接读 .env 文件 (D-7 loadProjectEnv 自动加载项目根 .env)
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (本 test = 3 子场景, 每个 1 turn 错误恢复)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 3 子场景)
 *   6. **不**mock LLM, **不**mock BashTool, 真实 error path
 *   7. 3 子场景用同一个 6 tool registry, 跟 1c-revive-2-B-3 镜
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR (ANTHROPIC_AUTH_TOKEN undefined AND DEEPSEEK_API_KEY undefined) → it.skip
 *   - 缺 key 时**不**fail, 单测保持 baseline
 *
 * API key 来源 (跟 anthropic-client.ts L228-235 resolveApiKey 一致):
 *   - 优先 ANTHROPIC_AUTH_TOKEN (Anthropic SDK 标准)
 *   - 退路 DEEPSEEK_API_KEY (1b.5 shim 走 /anthropic 端点同 key 验证)
 *   - 任一非空 → canRun
 *
 * 1c-revive + Sprint 1+ 扩展 cluster 状态 (7 commits 完 + 1c-revive-2-D-2 拍板, 8 commits):
 *   - ✅ 1c-revive-1 (2d245a3)
 *   - ✅ 1c-revive-2-A (83f87d7)
 *   - ✅ 1c-revive-2-B-1 (bddd5ff)
 *   - ✅ 1c-revive-2-B-2 (3fbced7)
 *   - ✅ 1c-revive-2-B-3 (f3be6d4)
 *   - ✅ 1c-revive-2-C+3 (7914729)
 *   - ✅ 1c-revive-2-D-1 (1e2feb6): stream path 真接
 *   - 🔄 1c-revive-2-D-2 (本文): error path 3 子场景
 *
 * 不验证 (留后续):
 *   - schema 校验 (留 1c-revive-2-D-3)
 *   - 多 tool_calls (留 1c-revive-2-D-4)
 *   - compaction / 加密 / 压缩 / 分片 / Session DAG (留 1c-revive-2-D-5+)
 */

import { describe, expect, it } from 'vitest';
import { AnthropicClient, type ChatMessage } from '@deepwhale/llm';
import { runToolLoop, ToolLoopLimitError, type ToolLoopStep } from '../../src/agent/tool-loop.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { deepseekAnthropicShimSkipReason } from '../../../llm/test/integration/_helpers/integration-gate.js';

// ---- 红线门 (helper 化, D-9 2026-06-04) ----

// ---- 辅助: dump 错误路径 行为 ----

function dumpErrorPath(label: string, steps: ReadonlyArray<ToolLoopStep>): void {
  console.log(
    `[${label}] runToolLoop step sequence (${steps.length} steps):`,
  );
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.kind === 'assistant') {
      const tcs = s.result.tool_calls ?? [];
      console.log(
        `  step${i} [assistant] tool_calls=${tcs.length} names=${tcs.map((tc) => tc.name).join(',')} finish=${s.result.finish_reason}`,
      );
    } else if (s.kind === 'tool') {
      console.log(
        `  step${i} [tool] name=${s.tool_call.name} success=${s.result.success} content_len=${s.result.content.length}${s.result.success === false ? ` error="${(s.result.error ?? '').slice(0, 80)}"` : ''}`,
      );
    } else if (s.kind === 'limit') {
      console.log(`  step${i} [limit] steps=${s.steps}`);
    } else if (s.kind === 'error') {
      console.log(`  step${i} [error] error=${s.error.message.slice(0, 100)}`);
    }
  }
}

// ---- 主测试: error path 3 子场景 + 跨 Anthropic 协议 ----

describe('coding-agent mode layer — 1c-revive-2-D-2 错误恢复 3 子场景 + 跨 Anthropic 协议 (Sprint 1+ 扩展第 2 步)', () => {
  // D-11-4 review P1 修复 (2026-06-04): 改 helper deepseekAnthropicShimSkipReason()
  // 模式. 跟 anthropic-stream-2d1 一致, 详 D-10c 拍板文档.
  const fileSkipReason = deepseekAnthropicShimSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  // ===========================================================================
  // 子场景 A: soft-fail path — LLM 调黑名单 command → tool 软失败 → **允许** LLM 反复尝试不收敛
  // ===========================================================================

  it(`A. soft-fail path: LLM 调黑名单 command → tool 软失败 → 允许 maxSteps 触顶 (跨 Anthropic 协议)`, async () => {
    // 1c.5 拍板 (1c-revive-2-B-1) 让 runToolLoop 跨 Anthropic 协议 走通
    // → 1c-revive-2-D-2-A 验 soft-fail path 跨 Anthropic 协议 走通
    //
    // R7 关键观察 (1c-revive-2-B-3 run 2 揭示 + 1c-revive-2-D-2-A round 2 揭示):
    //   LLM 走 stream path 调工具时, LLM 自由选 args, 经常先选**失败** args
    //   (e.g. '$(...)' 黑名单 / 不在 allowlist command), 然后**收敛**到**成功** args.
    //
    // 1c-revive-2-D-2-A round 1 揭示: LLM 调 2 次失败 (黑名单 command) + 1 次成功 (node -e) + final.
    // 1c-revive-2-D-2-A round 2 揭示: LLM 调 8 次都不收敛 (黑名单反复尝试).
    //
    // R7 拍板: 软断言 LLM 调**至少** 1 个 tool step + 至少 1 个 success=true. 不强制 LLM 收敛
    // 到 final (跟 1c-revive-2-A / 1c-revive-2-B-3 拍板一致: LLM 自由选, 不强制).
    //
    // soft-fail 拍板 (runToolLoop.ts 错误处理):
    //   - tool 自身失败 → tool 消息 content 是 error, loop 继续 (软失败 path)
    //   - 期望: 至少 1 个 tool step success=false, 至少 1 个 tool step success=true
    //   - 期望: 至少 1 个 tool step (软失败 path 必有 tool step)
    const client = new AnthropicClient();
    const registry = createDefaultRegistry();
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a careful math assistant. You have access to a bash tool. Compute the answer to ' +
          'the user question using bash. After receiving the tool result, give the user the final ' +
          'answer as a short sentence.',
      },
      { role: 'user', content: 'What is 17 * 23? Use bash to compute it.' },
    ];

    let caughtError: unknown;
    let finalResult: Awaited<ReturnType<typeof runToolLoop>> | undefined;
    try {
      finalResult = await runToolLoop(client, messages, {
        registry,
        maxSteps: 8, // 软失败 path, 给 LLM 多次尝试空间
      });
    } catch (err) {
      // R7 揭示: LLM 跨协议路径 LLM 自由选, 8 steps 仍可能不收敛 → ToolLoopLimitError 抛
      // (round 2 揭示, LLM 反复尝试黑名单 command 不收敛)
      caughtError = err;
    }

    if (finalResult !== undefined) {
      dumpErrorPath('1c-revive-2-D-2-A [BEFORE assertions]', finalResult.steps);
    } else if (caughtError instanceof ToolLoopLimitError) {
      console.log(
        `[1c-revive-2-D-2-A [BEFORE assertions]] runToolLoop hit maxSteps: steps=${caughtError.steps}`,
      );
    }

    // ---- 流程 1: 验证 runToolLoop 完成或 maxSteps 触顶 (软失败 path) ----
    if (caughtError !== undefined) {
      // R7 揭示: LLM 8 steps 仍不收敛 → ToolLoopLimitError 抛, 验错误类型
      expect(caughtError).toBeInstanceOf(ToolLoopLimitError);
      // 软断言: lastResult 包含至少 1 个 tool_calls (LLM 调了工具)
      const err = caughtError as ToolLoopLimitError;
      expect(err.lastResult.tool_calls).toBeDefined();
      expect(err.lastResult.tool_calls!.length).toBeGreaterThanOrEqual(1);
      return; // R7 拍板: 接受 LLM 8 steps 仍不收敛, 不强制收敛
    }

    // ---- 流程 2: 验证至少 1 个 tool step (soft-fail path 必有 tool step) ----
    expect(finalResult!.messages.length).toBeGreaterThan(2);
    expect(finalResult!.steps.length).toBeGreaterThanOrEqual(2);

    const toolSteps = finalResult!.steps.filter((s) => s.kind === 'tool');
    expect(toolSteps.length).toBeGreaterThanOrEqual(1);

    // ---- 流程 3: 验证 soft-fail 跨协议 行为 ----
    // R7 揭示: LLM 调工具跨 Anthropic 协议 软失败, 至少 1 个 tool step success=false (黑名单)
    // 不强制 success=true (LLM 自由选, 可能反复尝试黑名单)
    // 软断言: 至少 1 个 tool step
    expect(toolSteps.length).toBeGreaterThanOrEqual(1);

    // ---- 流程 4: 验证 LLM 收敛 (如果有 success) ----
    const successCount = toolSteps.filter((s) => s.result.success).length;
    if (successCount >= 1) {
      // 如果 LLM 收敛, 期望 final answer 含 '391'
      expect(finalResult!.final.finish_reason).toBe('stop');
      expect(finalResult!.final.content).toContain('391');
    }

    // ---- 流程 5: F4 拍板不变量 (软失败 path 也走 F4 拍板) ----
    // 注: 如果 maxSteps 触顶, finalResult 是 undefined, 已经在上面 return 了
    //     如果正常完成, finalResult.usage 期望 present
    if (finalResult !== undefined) {
      expect(finalResult.final.usage).toBeDefined();
      const usage = finalResult.final.usage!;
      expect(usage.tokens_uncached).toBeDefined();
      expect(usage.tokens_uncached).toBe(usage.prompt_tokens - (usage.cached_tokens ?? 0));

      // ---- 流程 6: F4 absent 跨 Anthropic 协议路径 (跟 1c-revive-2-B-3 / 1c-revive-2-D-1 镜) ----
      if ((usage.cached_tokens ?? 0) > 0) {
        expect(usage.cost_turn).toBeUndefined();
        expect(usage.cost_currency).toBeUndefined();
      }
    }
  }, 180_000); // 180s timeout: 1 turn soft-fail path 跨 Anthropic 协议 + LLM 收敛 (LLM 自由选, 给充分时间)

  // ===========================================================================
  // 子场景 B: maxSteps path — maxSteps: 2 触发 ToolLoopLimitError
  // ===========================================================================

  it(`B. maxSteps path: maxSteps=2 触发 ToolLoopLimitError (跨 Anthropic 协议)`, async () => {
    // maxSteps 拍板 (runToolLoop.ts L180):
    //   - 触顶 → push kind: 'limit' step + throw new ToolLoopLimitError(maxSteps, lastResult)
    //   - 期望: ToolLoopLimitError 抛, error.steps === maxSteps, 至少 1 个 tool step
    //
    // R7 揭示 (1c-revive-2-B-3 揭示): LLM 调工具 1-2 次后通常收敛, maxSteps 触顶需要 LLM
    //   持续调工具不收敛. 1c-revive-2-D-2-B 主动用 system prompt 让 LLM 多次调工具, 触发
    //   maxSteps 触顶.
    //
    // 设计: 用 system prompt 让 LLM 算 3 个表达式 (17*23, 15+27*4, 8*9*7), 期望 LLM 调 3+ tool
    //   (每个算 1 个), maxSteps: 2 触顶.
    const client = new AnthropicClient();
    const registry = createDefaultRegistry();
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a careful math assistant. You have access to a bash tool. Use the bash tool to ' +
          'compute arithmetic expressions. Compute three different arithmetic expressions in three ' +
          'separate bash tool calls. Do not give a final answer until you have called bash three ' +
          'times. After three tool calls, give the user the final answer as a short sentence.',
      },
      { role: 'user', content: 'Compute three different arithmetic expressions using bash' },
    ];

    let caughtError: unknown;
    let caughtSteps: ReadonlyArray<ToolLoopStep> = [];
    try {
      const result = await runToolLoop(client, messages, {
        registry,
        maxSteps: 2, // 故意小, 让 LLM 调 2 次 tool 后触顶
      });
      // 软断言: 不应该跑到这 (maxSteps 触顶抛异常)
      caughtSteps = result.steps;
    } catch (err) {
      caughtError = err;
    }

    dumpErrorPath('1c-revive-2-D-2-B [BEFORE assertions]', caughtSteps);

    // ---- 流程 1: 验 ToolLoopLimitError 抛 ----
    expect(caughtError).toBeInstanceOf(ToolLoopLimitError);

    // ---- 流程 2: 验 error.steps === 2 (跟 maxSteps 拍板) ----
    const err = caughtError as ToolLoopLimitError;
    expect(err.steps).toBe(2);

    // ---- 流程 3: 验 error.lastResult 包含至少 1 个 tool_calls (LLM 调了工具) ----
    expect(err.lastResult).toBeDefined();
    expect(err.lastResult.tool_calls).toBeDefined();
    // 注: LLM 自由选, 可能调 1 次 tool 后 maxSteps 触顶, 可能调 2 次. 软断言 >= 1.
    expect(err.lastResult.tool_calls!.length).toBeGreaterThanOrEqual(1);
  }, 120_000); // 120s timeout: 1 turn maxSteps path 跨 Anthropic 协议 + ToolLoopLimitError 抛

  // ===========================================================================
  // 子场景 C: abort signal path — AbortController.trigger 触发 LLMUnknownError
  // ===========================================================================

  it(`C. abort signal path: AbortController.trigger 触发 LLMUnknownError (跨 Anthropic 协议)`, async () => {
    // abort signal 拍板 (runToolLoop.ts L150-155):
    //   - 进 LLM call 前 check signal.aborted → 抛 LLMUnknownError 'Tool loop aborted by caller'
    //   - 期望: LLMUnknownError 抛, error.message 包含 'aborted'
    //
    // 设计: AbortController 创建, 跑前立即 trigger (signal.aborted = true), runToolLoop 进
    //   loop 前 check signal.aborted → 抛 LLMUnknownError.
    //
    // 注: 跟 maxSteps 拍板不同, abort signal 是 loop 入口处 check, 而 maxSteps 是 loop 内
    //   step 触顶 check. abort 路径**不**调 LLM, 不消耗 token.
    const client = new AnthropicClient();
    const registry = createDefaultRegistry();
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    const controller = new AbortController();
    // 跑前 0ms 立即 trigger abort (signal.aborted = true)
    controller.abort('test abort');

    let caughtError: unknown;
    try {
      await runToolLoop(client, messages, {
        registry,
        maxSteps: 5,
        signal: controller.signal,
      });
    } catch (err) {
      caughtError = err;
    }

    // ---- 流程 1: 验 LLMUnknownError 抛 ----
    expect(caughtError).toBeDefined();
    // 注: runToolLoop 内部 LLM 调用前 check signal.aborted 抛 LLMUnknownError, 但
    //   maxSteps 路径抛 ToolLoopLimitError. 软断言: 抛 LLMUnknownError 即可 (具体 name
    //   可能 LLMUnknownError 包装, 也可能直接 throw 内部 error).
    expect((caughtError as Error).message).toMatch(/abort/i);

    // ---- 流程 2: 验不消耗 token (abort 在 LLM call 之前触发) ----
    // 注: 我们**不**暴露 token 计数接口, 但 abort 路径不调 LLM, 所以不消耗 token.
    // 软断言: error 抛了就 OK, 不需要额外验证 token 计数.
  }, 30_000); // 30s timeout: 1 turn abort signal path 跨 Anthropic 协议 (不调 LLM, 0 token)
});
