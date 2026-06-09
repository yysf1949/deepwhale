/**
 * Cross-Session TaskGraph — v4.0 (D-33.6.2)
 *
 * Append-only JSONL store for cross-session task scheduling. Distinct from
 * the in-memory `TaskDag` (Stage 4 / v2.5) which only models in-flight task
 * dependencies. The TaskGraph persists tasks across process restarts, tracks
 * retry counters, timeout state, and recovery on crash.
 *
 * Per master plan §A.19: TaskGraph stores WORK (not messages). Session DAG
 * stores messages.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export type TaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'timeout';
export type TaskSource = 'auto' | 'user_explicit' | 'planner';

export interface TaskGraphNode {
  readonly id: string;
  readonly goal: string;
  readonly dependsOn: ReadonlyArray<string>;
  status: TaskStatus;
  retryCount: number;
  source: TaskSource;
  createdAt: number;
  updatedAt: number;
}

export interface TaskGraphOptions {
  readonly root: string;
}

export class TaskGraphStore {
  private readonly file: string;
  private nodes: Map<string, TaskGraphNode> = new Map();

  constructor(opts: TaskGraphOptions) {
    this.file = join(opts.root, 'taskgraph.jsonl');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.nodes = new Map(
        raw
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as TaskGraphNode)
          .map((node) => [node.id, node]),
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.nodes = new Map();
        return;
      }
      throw err;
    }
  }

  async append(node: Omit<TaskGraphNode, 'retryCount' | 'createdAt' | 'updatedAt'> & Partial<Pick<TaskGraphNode, 'retryCount' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    if (this.nodes.has(node.id)) {
      throw new Error(`duplicate task id: ${node.id}`);
    }
    const now = Date.now();
    const full: TaskGraphNode = {
      id: node.id,
      goal: node.goal,
      dependsOn: node.dependsOn,
      status: node.status,
      retryCount: node.retryCount ?? 0,
      source: node.source,
      createdAt: node.createdAt ?? now,
      updatedAt: node.updatedAt ?? now,
    };
    this.nodes.set(full.id, full);
    await this.flush();
  }

  async update(id: string, change: Partial<Pick<TaskGraphNode, 'status' | 'retryCount' | 'updatedAt'>>): Promise<void> {
    const existing = this.nodes.get(id);
    if (!existing) throw new Error(`unknown task id: ${id}`);
    const updated: TaskGraphNode = {
      ...existing,
      ...change,
      updatedAt: change.updatedAt ?? Date.now(),
    };
    this.nodes.set(id, updated);
    await this.flush();
  }

  async archive(id: string): Promise<void> {
    await this.update(id, { status: 'done' });
  }

  async readyTasks(): Promise<ReadonlyArray<TaskGraphNode>> {
    const done = new Set(
      Array.from(this.nodes.values())
        .filter((n) => n.status === 'done')
        .map((n) => n.id),
    );
    return Array.from(this.nodes.values()).filter(
      (n) => n.status === 'pending' && n.dependsOn.every((d) => done.has(d)),
    );
  }

  async list(): Promise<ReadonlyArray<TaskGraphNode>> {
    return Array.from(this.nodes.values());
  }

  private async flush(): Promise<void> {
    await fs.mkdir(join(this.file, '..'), { recursive: true });
    const lines = Array.from(this.nodes.values()).map((n) => JSON.stringify(n));
    await fs.writeFile(this.file, lines.join('\n') + (lines.length ? '\n' : ''));
  }
}

export interface CreateTaskGraphStoreOptions {
  readonly root: string;
}

export async function createTaskGraphStore(opts: CreateTaskGraphStoreOptions): Promise<TaskGraphStore> {
  const store = new TaskGraphStore(opts);
  await store.load();
  return store;
}
