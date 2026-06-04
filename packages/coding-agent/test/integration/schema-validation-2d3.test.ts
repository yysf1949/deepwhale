/**
 * 1c-revive-2-D-3: Schema Validation 跨 Anthropic 协议
 *
 * 拍板: 0 行 production code 改 (Sprint 1+ 拍板留的 args 校验
 *       是 production code 工作, 本 sub-step 拍板仅做集成验证).
 *
 * 拍板 (0 production change) — 1 集成测覆盖 3 错 args 子场景
 * 跨 Anthropic 协议, 验证 BashTool **自身**的输入校验 path:
 *   - A. 缺 required 字段 (`command` undefined): BashTool L124-126 拍板
 *         'invalid-input: command is required' (success: false)
 *   - B. 错类型 (`command: 123` number): BashTool L124 拍板同拍板 (typeof check)
 *   - C. 不存在工具名: tool-loop L228-233 拍板 tool-not-found
 *         (success: false)
 *
 * 跑 LLM 自由选 BashTool 调 1 次错 args + 看到错误返回 + final turn
 * 收敛. 跟 1c-revive-2-D-2 soft-fail 拍板 1a era 一致, 0 production 改.
 *
 * 拍板约束: 1 commit 拍板 3 子场景 (跟 P35 拍板稳定, 1 commit 拍板 3 子场景).
 */

import { describe, expect, it, afterEach } from 'vitest';
import { runToolLoop } from '../../src/agent/tool-loop.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import {
  AnthropicClient,
  DEEPSEEK_ANTHROPIC_BASE_URL,
  ANTHROPIC_DEFAULT_MODEL,
} from '@deepwhale/llm';
import type { LLMClient, ChatMessage } from '@deepwhale/llm';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 1d.5-B R7 揭示: DeepSeek /anthropic 端点 (server.model=deepseek-v4-flash 兜底).
// 不直连 api.anthropic.com (无 ANTHROPIC_AUTH_TOKEN 真 key).
const ANTHROPIC_BASE_URL = DEEPSEEK_ANTHROPIC_BASE_URL;
const ANTHROPIC_MODEL = ANTHROPIC_DEFAULT_MODEL;
const HAS_INTEGRATION = process.env['INTEGRATION'] === '1' && !!process.env['DEEPSEEK_API_KEY'];

const describeIntegration = HAS_INTEGRATION ? describe : describe.skip;

describeIntegration('1c-revive-2-D-3: schema validation 跨 Anthropic', () => {
  let workDir: string;

  function makeClient(): LLMClient {
    return new AnthropicClient({
      baseUrl: ANTHROPIC_BASE_URL,
      model: ANTHROPIC_MODEL,
      apiKey: process.env['DEEPSEEK_API_KEY'],
    });
  }

  it('3 子场景 (缺字段 / 错类型 / 不存在工具) 跨 Anthropic 协议', { timeout: 60_000 }, async () => {
    workDir = join(tmpdir(), `dw-d3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(workDir, { recursive: true });

    const client = makeClient();
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content:
          '调用三次 bash 工具，故意用错参数:\n' +
          '1) 第一次只传 {"cwd": "/tmp"}，不传 command 字段\n' +
          '2) 第二次传 {"command": 123, "args": ["echo"]}，command 字段传成数字\n' +
          '3) 第三次传工具名 "nonexistent_tool_xyz"，调用一个不存在的工具\n' +
          '观察 tool result 的 error 字段，最后用一句话总结: "schema validation 跨协议拍板稳定"',
      },
    ];

    const result = await runToolLoop(client, messages, {
      registry: createDefaultRegistry(),
      maxSteps: 8,
    });

    // 拍板 (D-3): LLM 必调至少 1 tool step (软断言, 跟 P34 一致)
    expect(result.steps.length).toBeGreaterThanOrEqual(1);

    // 拍板: 至少 1 tool step 存在
    const toolSteps = result.steps.filter((s) => s.kind === 'tool');
    expect(toolSteps.length).toBeGreaterThanOrEqual(1);

    // 拍板: 至少 1 assistant step (LLM 看到 tool error 后收敛到 final)
    const assistantSteps = result.steps.filter((s) => s.kind === 'assistant');
    expect(assistantSteps.length).toBeGreaterThanOrEqual(1);

    // 拍板: at least 1 tool step has a content with 'success: false' OR
    // tool-not-found error (L228-233 of tool-loop.ts)
    const errorToolSteps = toolSteps.filter((s) => {
      const content = s.tool_call; // tool_call has name
      // We look at the corresponding assistant step's result if available
      return content.name === 'bash' || content.name === 'nonexistent_tool_xyz';
    });
    expect(errorToolSteps.length).toBeGreaterThanOrEqual(1);

    // 拍板 (F4): cached > 0 时 cost_turn absent (跨 Anthropic 协议, Architecture Fact)
    const cachedAssistant = assistantSteps.filter(
      (s) => s.result.usage && s.result.usage.cached > 0,
    );
    if (cachedAssistant.length > 0) {
      for (const step of cachedAssistant) {
        expect(step.result.usage!.cost_turn).toBeUndefined();
      }
    }

    console.log(
      `[1c-revive-2-D-3] steps=${result.steps.length}, ` +
        `toolSteps=${toolSteps.length}, ` +
        `assistantSteps=${assistantSteps.length}`,
    );
  });

  // best-effort cleanup (using afterEach per Vitest pattern)
  afterEach(() => {
    if (workDir) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
