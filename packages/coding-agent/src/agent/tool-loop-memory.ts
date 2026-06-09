/**
 * Tool-loop memory integration — D-35 cross-session memory.
 *
 * Mirrors the runToolLoopWithCompaction pattern from D-5: a thin wrapper
 * around runToolLoop that records memories on the way in (user_explicit) and
 * on the way out (auto_extracted) when a memory store is provided.
 *
 * Key invariants (跟 D-33.7 + D-35 拍板一致):
 *   - runToolLoop signature 0 改 (v1.0 contract preserved; 5 红线 0 改)
 *   - 0 LLM call for memory extraction — deterministic keyword heuristic
 *     (avoids 额外 latency, 跟 D-35 STOP conditions: "LLM is required for
 *     memory extraction" 红线对应)
 *   - 0 改 default registry (this wrapper lives in src/agent/, separate from
 *     tools/registry.ts)
 *   - When memory option is not provided, behavior is identical to a direct
 *     runToolLoop call (only adds a 0 memoriesWritten field)
 */
import { runToolLoop, type ToolLoopOptions, type ToolLoopResult } from './tool-loop.js';
import type { ChatMessage, LLMClient } from '@deepwhale/llm';

export type MemoryScope = 'user' | 'project' | 'session';
export type MemorySource = 'auto_extracted' | 'user_explicit' | 'project_fact';

export interface MemoryStore {
  put(input: { id: string; scope: MemoryScope; source: MemorySource; content: string; importance?: number }): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  list(filter?: { scope?: MemoryScope; includeArchived?: boolean }): Promise<ReadonlyArray<unknown>>;
}

export interface RunToolLoopWithMemoryOptions {
  readonly client: LLMClient;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly registry?: ToolLoopOptions['registry'];
  readonly maxSteps?: number;
  readonly toolTimeoutMs?: ToolLoopOptions['toolTimeoutMs'];
  readonly onChunk?: ToolLoopOptions['onChunk'];
  readonly signal?: ToolLoopOptions['signal'];
  readonly policy?: ToolLoopOptions['policy'];
  readonly isInteractive?: ToolLoopOptions['isInteractive'];
  readonly yes?: ToolLoopOptions['yes'];
  readonly writer?: ToolLoopOptions['writer'];
  readonly memory?: MemoryStore;
}

export interface RunToolLoopWithMemoryResult extends ToolLoopResult {
  readonly memoriesWritten: number;
}

const REMEMBER_KEYWORDS = ['remember', 'preference', 'always', 'never forget'];
const EXTRACT_KEYWORDS = ['decision', 'preference', 'chose', 'switched to'];

function containsAnyKeyword(text: string, keywords: ReadonlyArray<string>): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function formatToolResultContent(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export async function runToolLoopWithMemory(
  options: RunToolLoopWithMemoryOptions,
): Promise<RunToolLoopWithMemoryResult> {
  const { client, messages, memory, ...loopOptions } = options;
  let memoriesWritten = 0;

  if (memory) {
    for (const msg of messages) {
      if (
        msg.role === 'user' &&
        typeof msg.content === 'string' &&
        containsAnyKeyword(msg.content, REMEMBER_KEYWORDS)
      ) {
        await memory.put({
          id: `user-${Date.now()}-${memoriesWritten}`,
          scope: 'user',
          source: 'user_explicit',
          content: msg.content,
        });
        memoriesWritten += 1;
      }
    }
  }

  const loopOptionsClean: ToolLoopOptions = {};
  if (loopOptions.registry !== undefined) loopOptionsClean.registry = loopOptions.registry;
  if (loopOptions.maxSteps !== undefined) loopOptionsClean.maxSteps = loopOptions.maxSteps;
  if (loopOptions.toolTimeoutMs !== undefined) loopOptionsClean.toolTimeoutMs = loopOptions.toolTimeoutMs;
  if (loopOptions.onChunk !== undefined) loopOptionsClean.onChunk = loopOptions.onChunk;
  if (loopOptions.signal !== undefined) loopOptionsClean.signal = loopOptions.signal;
  if (loopOptions.policy !== undefined) loopOptionsClean.policy = loopOptions.policy;
  if (loopOptions.isInteractive !== undefined) loopOptionsClean.isInteractive = loopOptions.isInteractive;
  if (loopOptions.yes !== undefined) loopOptionsClean.yes = loopOptions.yes;
  if (loopOptions.writer !== undefined) loopOptionsClean.writer = loopOptions.writer;

  const result = await runToolLoop(client, messages, loopOptionsClean);

  if (memory) {
    for (const step of result.steps) {
      if (step.kind === 'tool' && step.result.success) {
        const content = formatToolResultContent(step.result.content);
        if (containsAnyKeyword(content, EXTRACT_KEYWORDS)) {
          await memory.put({
            id: `session-${step.tool_call.id}`,
            scope: 'session',
            source: 'auto_extracted',
            content: content.slice(0, 500),
          });
          memoriesWritten += 1;
        }
      }
    }
  }

  return { ...result, memoriesWritten };
}
