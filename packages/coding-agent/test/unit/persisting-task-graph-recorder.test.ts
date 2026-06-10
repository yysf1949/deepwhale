/**
 * PersistingTaskGraphRecorder — D-80 v4.0 cross-session Agent OS evidence.
 *
 * Mirrors the D-78 PersistentMemoryStore pattern (JSONL + atomic-rename +
 * partial-last-line recovery). The recorder is opt-in: callers wire it into
 * runToolLoopWithReview via the `taskGraph` option. The default registry
 * does NOT include it.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  PersistingTaskGraphRecorder,
  type RecordedGoal,
} from '../../src/agent/persisting-task-graph-recorder.js';

function newTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'persisting-tgr-'));
}

describe('PersistingTaskGraphRecorder (D-80)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = newTempDir();
    file = join(dir, 'task-graph.jsonl');
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it('load() reads existing JSONL entries (one of each kind)', async () => {
    const existing = [
      JSON.stringify({
        kind: 'tool_call',
        toolName: 'read_file',
        argsDigest: 'sha256:read_file-1',
        success: true,
        durationMs: 12,
      }),
      JSON.stringify({ kind: 'goal', goal: 'ship D-80' }),
      JSON.stringify({
        kind: 'plan',
        tasks: [{ id: 'p-0', goal: 'ship D-80' }],
      }),
    ].join('\n');
    writeFileSync(file, existing + '\n', 'utf8');

    const store = new PersistingTaskGraphRecorder({ file });
    await store.load();

    const toolCalls = store.getToolCalls();
    const goals = store.getGoals();
    const plans = store.getPlans();
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.toolName).toBe('read_file');
    expect(goals).toEqual([{ kind: 'goal', goal: 'ship D-80' }]);
    expect(plans).toEqual([{ kind: 'plan', tasks: [{ id: 'p-0', goal: 'ship D-80' }] }]);
  });

  it('recordToolCall + recordGoal + recordPlan persist across instances (D-80 cross-session)', async () => {
    // Instance A records entries.
    const a = new PersistingTaskGraphRecorder({ file });
    await a.load();
    await a.recordToolCall({
      toolName: 'bash',
      argsDigest: 'sha256:echo-1',
      success: true,
      durationMs: 5,
    });
    await a.recordGoal('first goal from instance A');
    await a.recordPlan({ tasks: [{ id: 'p-0', goal: 'first goal from instance A' }] });

    // Instance B is a fresh recorder pointing at the same file.
    const b = new PersistingTaskGraphRecorder({ file });
    await b.load();

    // B sees A's entries (cross-session survival).
    expect(b.getToolCalls().map((t) => t.toolName)).toEqual(['bash']);
    expect(b.getGoals().map((g) => g.goal)).toEqual(['first goal from instance A']);
    expect(b.getPlans().map((p) => p.tasks)).toEqual([
      [{ id: 'p-0', goal: 'first goal from instance A' }],
    ]);
    // B records its own entries; both A's and B's entries survive.
    await b.recordGoal('second goal from instance B');
    const c = new PersistingTaskGraphRecorder({ file });
    await c.load();
    expect(c.getGoals().map((g) => g.goal)).toEqual([
      'first goal from instance A',
      'second goal from instance B',
    ]);
  });

  it('load() recovers from a partial last line (truncated JSON)', async () => {
    // 1 valid line + 1 truncated (no closing brace) line. The truncated
    // line simulates a crash mid-flush.
    const partial = [
      JSON.stringify({ kind: 'goal', goal: 'valid goal' }),
      '{"kind":"goal","goal":"truncated',
    ].join('\n');
    writeFileSync(file, partial + '\n', 'utf8');

    const store = new PersistingTaskGraphRecorder({ file });
    await store.load();

    // Only the valid line is kept; the truncated line is dropped silently.
    expect(store.getGoals().map((g) => g.goal)).toEqual(['valid goal']);
  });

  it('flush() writes JSONL content to the destination file (atomic round-trip)', async () => {
    const store = new PersistingTaskGraphRecorder({ file });
    await store.load();
    await store.recordGoal('round-trip goal');

    // Read the file directly and confirm the goal is parseable JSONL.
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] as string) as RecordedGoal;
    expect(parsed.kind).toBe('goal');
    expect(parsed.goal).toBe('round-trip goal');
  });
});
