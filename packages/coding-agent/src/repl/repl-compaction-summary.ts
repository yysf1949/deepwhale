/**
 * REPL compaction summary factory — Sprint 1c-revive-2-D-29.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1c-revive-2-D-6 (2026-06-04): makeLlmSummarizeFn 是 repl.ts 内
 *   module-private 工厂, 给 runToolLoopWithCompaction 注入 summaryFn. 走 client.chat
 *   调 LLM 生成 1 short paragraph summary, 跨 openai/anthropic 同形态 (跟
 *   test 1c-revive-2-D-5 cluster 拍板一致).
 *
 * 拍板 (D-29.2):
 *   - 文件: `repl-compaction-summary.ts` (kebab-case, 跟 `repl-format-error.ts` /
 *     `repl-confirm.ts` / `repl-signal-coordinator.ts` / `repl-session.ts` 同形态).
 *   - 公共 API 0 改: runAgentTurn 走 `import { makeLlmSummarizeFn } from
 *     './repl/repl-compaction-summary.js'`, 行为 1:1.
 *   - 行为 1:1: 工厂函数体逐字迁移, system prompt 模板 + user 模板跟 protocol
 *     字段 1:1. 跨协议一致 (D-6 拍板: protocol 字段保留供未来 system prompt 模板
 *     差异化用, 当前用同 system prompt 模板).
 *   - module-private (不 re-export): 跟现行为一致, 外部 caller 调 runAgentTurn
 *     即可.
 *
 * 拍板 (D-29.2 §out of scope):
 *   - 不抽 protocol-specific system prompt 模板 — 跟 D-6 拍板一致, 当前跨协议用
 *     同 system prompt 模板.
 *   - 不动 runAgentTurn — 留给 D-29.3+.
 */

import type { ChatMessage, LLMClient } from '@deepwhale/llm';
import type { SummarizeFn } from '@deepwhale/core';

/**
 * 生成 LLM summary callback (Sprint 1c-revive-2-D-6).
 *
 * 跟 1c-revive-2-D-5 cluster test (compaction-cross-protocol-2d5.test.ts:231)
 * 拍板一致: 走 client.chat 调 LLM 生成 1 short paragraph summary. 跨
 * openai/anthropic 同形态, 因为 client.chat 是 LLMClient 契约的统一入口.
 *
 * 不**在**这里拼 protocol-specific system prompt: Anthropic protocol
 * 走 client.chat 时已由 client 内部加 (跟 agent-compaction.ts protocol
 * 字段对齐). 1c-revive-2-D-6 拍板: protocol 字段保留供未来 system
 * prompt 模板差异化用, 当前 D-6 默认用同 system prompt 模板 (跨协议一致).
 */
export function makeLlmSummarizeFn(client: LLMClient, _protocol: 'openai' | 'anthropic'): SummarizeFn {
  return async (toSummarize: ReadonlyArray<ChatMessage>): Promise<string> => {
    const summaryMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a concise summarizer. Compress the following conversation into 1 short paragraph ' +
          '(max 200 words). Preserve key arithmetic results, tool calls, and final answers.',
      },
      {
        role: 'user',
        content: toSummarize
          .map((m, i) => `[${i}] ${m.role}: ${m.content ?? '(empty)'}`)
          .join('\n'),
      },
    ];
    const r = await client.chat(summaryMessages, {});
    return r.content;
  };
}
