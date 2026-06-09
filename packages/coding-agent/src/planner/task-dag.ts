/**
 * Task DAG (D-33.4.1) — pure data structure for planner/executor boundary.
 *
 * v2.5 contract (master plan §A.11):
 *   - createTaskDag: validate ids (no dupes, deps exist) + reject cycles
 *   - readyTasks: filter nodes with status === 'ready'
 *   - markTaskDone: update a node to 'done' + recompute 'pending' → 'ready' for newly-unblocked tasks
 *   - markTaskFailed: update a node to 'failed'
 *
 * Pure data — no tool execution, no state mutation outside the DAG.
 */

export type TaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'blocked';

export interface TaskNode {
  id: string;
  goal: string;
  dependsOn: ReadonlyArray<string>;
  status: TaskStatus;
  result?: { summary: string };
}

export interface TaskDag {
  nodes: ReadonlyArray<TaskNode>;
}

export function createTaskDag(
  tasks: ReadonlyArray<{ id: string; goal: string; dependsOn: ReadonlyArray<string> }>,
): TaskDag {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (ids.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    ids.add(t.id);
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!ids.has(dep)) throw new Error(`unknown dependency: ${dep} (in task ${t.id})`);
    }
  }
  const adjacency = new Map<string, ReadonlyArray<string>>();
  for (const t of tasks) adjacency.set(t.id, t.dependsOn);
  const visited = new Set<string>();
  const stack = new Set<string>();
  function visit(id: string): void {
    if (stack.has(id)) throw new Error(`cycle detected involving task: ${id}`);
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const dep of adjacency.get(id) ?? []) visit(dep);
    stack.delete(id);
  }
  for (const t of tasks) visit(t.id);

  return {
    nodes: tasks.map((t) => ({
      ...t,
      status: (t.dependsOn.length === 0 ? 'ready' : 'pending') as TaskStatus,
    })),
  };
}

export function readyTasks(dag: TaskDag): ReadonlyArray<TaskNode> {
  return dag.nodes.filter((n) => n.status === 'ready');
}

export function markTaskDone(dag: TaskDag, id: string, result: { summary: string }): TaskDag {
  return updateDag(dag, id, (n) => ({ ...n, status: 'done' as TaskStatus, result }));
}

export function markTaskFailed(dag: TaskDag, id: string): TaskDag {
  return updateDag(dag, id, (n) => ({ ...n, status: 'failed' as TaskStatus }));
}

function updateDag(dag: TaskDag, id: string, fn: (n: TaskNode) => TaskNode): TaskDag {
  const updated = dag.nodes.map((n) => (n.id === id ? fn(n) : n));
  const done = new Set(updated.filter((n) => n.status === 'done').map((n) => n.id));
  const next = updated.map((n) => {
    if (n.status !== 'pending') return n;
    if (n.dependsOn.every((d) => done.has(d))) {
      return { ...n, status: 'ready' as TaskStatus };
    }
    return n;
  });
  return { nodes: next };
}
