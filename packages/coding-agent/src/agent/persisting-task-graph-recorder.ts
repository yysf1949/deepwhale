/**
 * PersistingTaskGraphRecorder — D-80 v4.0 cross-session Agent OS evidence.
 *
 * Implements the TaskGraphRecorder interface from tool-loop-policy.ts.
 * Mirrors the D-78 PersistentMemoryStore pattern:
 *   - single JSONL file (one line per entry, kind discriminator)
 *   - temp-file + fsync + rename atomic write (POSIX; Node.js >= 15 on Windows)
 *   - partial-last-line recovery on load (stop at first JSON.parse failure)
 *
 * Why a separate file (not just PersistentMemoryStore): the TaskGraphRecorder
 * is a hot path called by runToolLoopWithReview. Mixing it into the user/project/
 * session memory namespaces would conflate two distinct concerns:
 *   - PersistentMemoryStore = human-readable facts/preferences
 *   - PersistingTaskGraphRecorder = machine-recorded agent activity
 * Keeping them separate files also keeps the cross-session evidence story
 * clean: a TaskGraph reload from a fresh process instance is independent of
 * memory flush/sync state.
 */

import { closeSync, fsyncSync, openSync, promises as fs, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TaskGraphRecorder } from './tool-loop-policy.js';

export interface RecordedToolCall {
  readonly kind: 'tool_call';
  readonly toolName: string;
  readonly argsDigest: string;
  readonly success: boolean;
  readonly durationMs: number;
}

export interface RecordedGoal {
  readonly kind: 'goal';
  readonly goal: string;
}

export interface RecordedPlan {
  readonly kind: 'plan';
  readonly tasks: ReadonlyArray<{ id: string; goal: string }>;
}

type Entry = RecordedToolCall | RecordedGoal | RecordedPlan;

export interface PersistingTaskGraphRecorderOptions {
  readonly file: string;
}

export class PersistingTaskGraphRecorder implements TaskGraphRecorder {
  private readonly file: string;
  private toolCalls: RecordedToolCall[] = [];
  private goals: RecordedGoal[] = [];
  private plans: RecordedPlan[] = [];

  constructor(opts: PersistingTaskGraphRecorderOptions) {
    this.file = opts.file;
  }

  /**
   * Read the JSONL file and populate the in-memory arrays.
   * Stop at the first JSON.parse failure (mirrors D-78): the destination
   * is either the old contents or the new contents (atomic-rename), so a
   * corrupt last line means the previous flush was interrupted. Keep the
   * successfully-parsed lines and drop the partial last one.
   *
   * If the file does not exist, the in-memory arrays are reset to empty.
   */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.toolCalls = [];
        this.goals = [];
        this.plans = [];
        return;
      }
      throw err;
    }
    const lines = raw.split('\n').filter(Boolean);
    const tcs: RecordedToolCall[] = [];
    const gs: RecordedGoal[] = [];
    const ps: RecordedPlan[] = [];
    for (const line of lines) {
      let parsed: Entry;
      try {
        parsed = JSON.parse(line) as Entry;
      } catch {
        // Stop at the first corrupt line: the previous flush was
        // interrupted. The atomic-rename write path means the destination
        // is either the old contents or the new contents; a corrupt line
        // here means the destination itself was truncated. Keep the
        // successfully-parsed lines and stop.
        break;
      }
      if (parsed.kind === 'tool_call') tcs.push(parsed);
      else if (parsed.kind === 'goal') gs.push(parsed);
      else if (parsed.kind === 'plan') ps.push(parsed);
    }
    this.toolCalls = tcs;
    this.goals = gs;
    this.plans = ps;
  }

  async recordToolCall(input: {
    toolName: string;
    argsDigest: string;
    success: boolean;
    durationMs: number;
  }): Promise<void> {
    const entry: RecordedToolCall = { kind: 'tool_call', ...input };
    this.toolCalls = [...this.toolCalls, entry];
    await this.flush();
  }

  async recordGoal(goal: string): Promise<void> {
    const entry: RecordedGoal = { kind: 'goal', goal };
    this.goals = [...this.goals, entry];
    await this.flush();
  }

  async recordPlan(input: { tasks: ReadonlyArray<{ id: string; goal: string }> }): Promise<void> {
    const entry: RecordedPlan = { kind: 'plan', tasks: input.tasks };
    this.plans = [...this.plans, entry];
    await this.flush();
  }

  getToolCalls(): ReadonlyArray<RecordedToolCall> {
    return this.toolCalls;
  }

  getGoals(): ReadonlyArray<RecordedGoal> {
    return this.goals;
  }

  getPlans(): ReadonlyArray<RecordedPlan> {
    return this.plans;
  }

  private async flush(): Promise<void> {
    await fs.mkdir(dirname(this.file), { recursive: true });
    const all: Entry[] = [...this.toolCalls, ...this.goals, ...this.plans];
    const payload = all.length ? all.map((e) => JSON.stringify(e)).join('\n') + '\n' : '';
    const tmp = `${this.file}.tmp-${process.pid}-${Date.now()}`;
    // Write to temp, fsync, then rename over the destination. The rename
    // is atomic on POSIX and Node.js >= 15 on Windows (uses MoveFileEx
    // with MOVEFILE_REPLACE_EXISTING), so the destination is always
    // either the old contents or the new contents, never partial.
    await fs.writeFile(tmp, payload);
    try {
      const fd = openSync(tmp, 'r');
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch {
      // Best-effort fsync; if it fails (e.g. unsupported FS), the rename
      // still gives us atomic-rename semantics.
    }
    renameSync(tmp, this.file);
  }
}
