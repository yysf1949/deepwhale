# D-35 Cross-Session Memory Integration Sub-Sprint Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** Wire the `PersistentMemoryStore` (from PR #9) into the tool loop via a new `runToolLoopWithMemory` wrapper. The wrapper records `user_explicit` scope memories (one per session) when the loop encounters a notable user prompt, and `auto_extracted` scope memories for successful tool results that contain "decision" or "preference" keywords (heuristic, not LLM). This makes the v4.0 persistent memory actually usable from the tool loop, not just a standalone module.

**Architecture:** A new `packages/coding-agent/src/agent/tool-loop-memory.ts` wrapper, mirroring the `runToolLoopWithReview` pattern from PR #10. The wrapper:
1. Calls `runToolLoop(client, messages, options)` (5 红线 0 改, signature 0 改).
2. **Before** the loop, if a `memory` option is provided AND `messages` contains a user message with "remember" or "preference" keywords, records it as a `user_explicit` memory.
3. **After** the loop, walks `result.steps` and records successful tool results that contain "decision" or "preference" keywords as `auto_extracted` session-scope memories.
4. Returns a `RunToolLoopWithMemoryResult` that adds `memoriesWritten: number` on top of the base result.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

**Base branch:** `release/v2.0` (afbbe06). Self-contained (the wrapper defines its own `MemoryStore` interface; the real PR #9 `PersistentMemoryStore` is a drop-in replacement).

---

## Task D.1: Wrapper + Test

**Files:**
- Create: `packages/coding-agent/src/agent/tool-loop-memory.ts`
- Test: `packages/coding-agent/test/integration/tool-loop-memory.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { runToolLoopWithMemory, type MemoryStore } from '../../src/agent/tool-loop-memory.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import type { ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';

class ScriptedLlm implements LLMClient {
  readonly model = 'scripted-mock' as ModelId;
  private index = 0;
  constructor(private readonly responses: ReadonlyArray<ChatResult>) {}
  async chat(_messages: ReadonlyArray<ChatMessage>): Promise<ChatResult> {
    const next = this.responses[this.index] ?? this.responses[this.responses.length - 1];
    this.index += 1;
    return next;
  }
  async stream(): Promise<ChatResult> {
    return this.responses[0]!;
  }
}

const stopResult: ChatResult = {
  model: 'scripted-mock' as ModelId,
  content: 'all done',
  finish_reason: 'stop',
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const decisionResult: ChatResult = {
  model: 'scripted-mock' as ModelId,
  content: '',
  finish_reason: 'tool_calls',
  tool_calls: [
    {
      id: '1',
      name: 'bash',
      args: { command: 'echo', args: ['decision: use pnpm for all packages'] },
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

describe('tool-loop-memory integration (D-35)', () => {
  it('records a user_explicit memory when the user message contains "remember"', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const recorded: Array<{ scope: string; source: string; content: string }> = [];
    const memory: MemoryStore = {
      async put({ scope, source, content }) {
        recorded.push({ scope, source, content });
      },
      async archive() {
        /* noop */
      },
      async restore() {
        /* noop */
      },
      async list() {
        return [];
      },
    };
    const result = await runToolLoopWithMemory({
      client: llm,
      messages: [{ role: 'user', content: 'please remember: I prefer Chinese for status messages' }],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      memory,
    });
    expect(recorded).toEqual([
      { scope: 'user', source: 'user_explicit', content: 'please remember: I prefer Chinese for status messages' },
    ]);
    expect(result.memoriesWritten).toBe(1);
  });

  it('records an auto_extracted memory when a tool result mentions "decision"', async () => {
    const llm = new ScriptedLlm([decisionResult, stopResult]);
    const recorded: Array<{ scope: string; source: string; content: string }> = [];
    const memory: MemoryStore = {
      async put({ scope, source, content }) {
        recorded.push({ scope, source, content });
      },
      async archive() {
        /* noop */
      },
      async restore() {
        /* noop */
      },
      async list() {
        return [];
      },
    };
    const result = await runToolLoopWithMemory({
      client: llm,
      messages: [{ role: 'user', content: 'fix the registry test' }],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      memory,
    });
    // The "decision" result should be recorded as session-scope auto_extracted.
    const decisionMemory = recorded.find((m) => m.content.includes('decision'));
    expect(decisionMemory).toEqual({ scope: 'session', source: 'auto_extracted', content: expect.stringContaining('decision') });
    expect(result.memoriesWritten).toBeGreaterThan(0);
  });

  it('returns 0 memories written when no memory option is provided', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const result = await runToolLoopWithMemory({
      client: llm,
      messages: [{ role: 'user', content: 'hello' }],
      registry: createDefaultRegistry(),
      maxSteps: 3,
    });
    expect(result.memoriesWritten).toBe(0);
  });
});
```

**Step 2: Run — confirm fail**
```bash
pnpm vitest run packages/coding-agent/test/integration/tool-loop-memory.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement wrapper**

`packages/coding-agent/src/agent/tool-loop-memory.ts`:

```ts
/**
 * Tool-loop memory integration — D-35 follow-up.
 * Mirrors the runToolLoopWithReview pattern from D-33.7.
 * Records user_explicit memories on the way in, auto_extracted memories
 * on the way out, when a memory store is provided.
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

export interface RunToolLoopWithMemoryOptions extends Omit<ToolLoopOptions, 'registry' | 'maxSteps'> {
  readonly client: LLMClient;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly registry?: ToolLoopOptions['registry'];
  readonly maxSteps?: number;
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

  // Pre-loop: record user_explicit memories
  if (memory) {
    for (const msg of messages) {
      if (msg.role === 'user' && typeof msg.content === 'string' && containsAnyKeyword(msg.content, REMEMBER_KEYWORDS)) {
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

  // Build clean loop options
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

  // Post-loop: record auto_extracted memories from successful tool results
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
```

**Step 4: Run — confirm pass**
Expected: 3/3 pass.

**Step 5: Commit**
```bash
git add packages/coding-agent/src/agent/tool-loop-memory.ts packages/coding-agent/test/integration/tool-loop-memory.test.ts
git commit -m "feat(agent): wire persistent memory into tool loop (D-35)"
```

---

## Task D.2: Verify + Ship

**Step 1:** Run `pnpm typecheck` and `pnpm lint`, confirm exit 0.

**Step 2:** Run `pnpm test`, confirm no new persistent fail.

**Step 3:** Run `git diff afbbe06..HEAD -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts` and confirm empty (5 红线 0 改).

**Step 4:** Update README with D-35 entry.

**Step 5:** Commit and ship.
```bash
git add README.md
git commit -m "docs: mark D-35 cross-session memory integration"

git commit --allow-empty -m "ship(coding-agent): D-35 cross-session memory integration 收口 (1 task, 1 commit, user_explicit pre-loop + auto_extracted post-loop, 5 红线 0 改, default registry unchanged)"

# DO NOT push — parent pushes after PR review.
```

---

## Acceptance

- [ ] 1 commit with TDD discipline
- [ ] 5 红线 0 改 (vs base afbbe06)
- [ ] Default registry profile audit unchanged
- [ ] typecheck/lint/test all pass
- [ ] 3/3 integration test pass
- [ ] Working tree clean
- [ ] Branch: `feature/d35-cross-session-memory` (create from afbbe06)
- [ ] `runToolLoop` signature untouched (D-33.7 contract preserved)

## STOP conditions

- `runToolLoop` signature changes (v1.0 contract)
- 5 红线 diff becomes non-empty
- Memory key collisions
- LLM is required for memory extraction (must be deterministic keyword heuristic)
- Heuristic extraction captures too much noise (>50% of tool results)
