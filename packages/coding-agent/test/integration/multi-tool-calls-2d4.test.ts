/**
 * 1c-revive-2-D-4: Multi-tool_calls 跨 Anthropic 协议
 *
 * 拍板: 0 行 production code 改 (1c.5 拍板时 parseAnthropicMessage
 *       L352 隐式已支持多 tool_use blocks, tool-loop L168 串行执行
 *       1a era 已拍板, 跨 Anthropic 协议 1c.5 拍板后仍稳定).
 *
 * 拍板 (0 production change) — 1 集成测覆盖 3 多 tool_calls 路径
 * 跨 Anthropic 协议, 验证现有 1c.5 + 1a era 拍板:
 *   - A. LLM 一次调 ≥2 个独立工具 (no dependencies)
 *   - B. 多 tool_use → 多 tool 消息 (tool_call_id echo 跨协议 path)
 *   - C. 全部 tool step 跑完 → final turn 收敛
 *
 * LLM 自由选: prompt 明确让 LLM "调 2 个独立工具 (bash + find)
 * 一次返回", 软断言 LLM 调 ≥2 个 tool step (跟 P34 拍板一致).
 *
 * 拍板约束: 1 commit 拍板 1 集成测 (跟 D-3 一致, 0 production 改).
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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ANTHROPIC_BASE_URL = DEEPSEEK_ANTHROPIC_BASE_URL;
const ANTHROPIC_MODEL = ANTHROPIC_DEFAULT_MODEL;
const HAS_INTEGRATION = process.env['INTEGRATION'] === '1' && !!process.env['DEEPSEEK_API_KEY'];

const describeIntegration = HAS_INTEGRATION ? describe : describe.skip;

describeIntegration('1c-revive-2-D-4: multi-tool_calls 跨 Anthropic 协议', () => {
  let workDir: string;

  function makeClient(): LLMClient {
    return new AnthropicClient({
      baseUrl: ANTHROPIC_BASE_URL,
      model: ANTHROPIC_MODEL,
      apiKey: process.env['DEEPSEEK_API_KEY'],
    });
  }

  it('LLM 一次调 ≥2 个独立工具 (bash + find) 跨 Anthropic 协议', { timeout: 90_000 }, async () => {
    workDir = join(tmpdir(), `dw-d4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(workDir, { recursive: true });

    // 写 3 个文件让 find 能找到东西
    writeFileSync(join(workDir, 'a.txt'), 'apple');
    writeFileSync(join(workDir, 'b.txt'), 'banana');
    writeFileSync(join(workDir, 'c.txt'), 'cherry');

    const client = makeClient();
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content:
          '请在同一次 LLM 回应里**同时**调用两个工具:\n' +
          '1) bash 跑 `echo "hello-multi"` 看输出\n' +
          '2) find 工具查找 `*.txt` 文件\n' +
          '两个工具**没有依赖关系**, 一次返回 (用 multi-tool_calls 拍板).\n' +
          '最后用一句话总结: "multi-tool_calls 跨协议拍板稳定"',
      },
    ];

    const result = await runToolLoop(client, messages, {
      registry: createDefaultRegistry(),
      maxSteps: 8,
    });

    // 拍板 (D-4): LLM 必调至少 1 assistant step (有 tool_calls)
    const assistantSteps = result.steps.filter((s) => s.kind === 'assistant');
    expect(assistantSteps.length).toBeGreaterThanOrEqual(1);

    // 拍板: 至少 1 assistant step 包含 ≥2 tool_calls (多 tool 拍板)
    const multiToolCallSteps = assistantSteps.filter(
      (s) => s.result.tool_calls && s.result.tool_calls.length >= 2,
    );
    expect(multiToolCallSteps.length).toBeGreaterThanOrEqual(1);

    // 拍板: 多 tool step (对应 L168-184 串行执行)
    const toolSteps = result.steps.filter((s) => s.kind === 'tool');
    expect(toolSteps.length).toBeGreaterThanOrEqual(2);

    // 拍板: tool_call_id 跨协议 echo 稳定 (P29 + 1c.5 拍板)
    const toolIds = toolSteps.map((s) => s.tool_call.id);
    const uniqueToolIds = new Set(toolIds);
    expect(uniqueToolIds.size).toBe(toolSteps.length); // 全部 unique

    // 拍板 (B): tool_call_id 跟 assistant tool_calls 拍板 echos
    for (const assistant of multiToolCallSteps) {
      const assistantToolIds = assistant.result.tool_calls!.map((tc) => tc.id);
      for (const tcId of assistantToolIds) {
        expect(toolIds).toContain(tcId);
      }
    }

    // 拍板: at least 1 tool step 是 'bash', at least 1 是 'find'
    const toolNames = new Set(toolSteps.map((s) => s.tool_call.name));
    expect(toolNames.has('bash')).toBe(true);
    expect(toolNames.has('find')).toBe(true);

    // 拍板 (F4): cached_tokens > 0 时 cost_turn absent (跨 Anthropic 协议, Architecture Fact)
    const cachedAssistant = assistantSteps.filter(
      (s) => s.result.usage && s.result.usage.cached_tokens && s.result.usage.cached_tokens > 0,
    );
    if (cachedAssistant.length > 0) {
      for (const step of cachedAssistant) {
        expect(step.result.usage!.cost_turn).toBeUndefined();
      }
    }

    console.log(
      `[1c-revive-2-D-4] steps=${result.steps.length}, ` +
        `assistantSteps=${assistantSteps.length}, ` +
        `multiToolCallSteps=${multiToolCallSteps.length}, ` +
        `toolSteps=${toolSteps.length}, ` +
        `toolNames=${Array.from(toolNames).join(',')}`,
    );
  });

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
