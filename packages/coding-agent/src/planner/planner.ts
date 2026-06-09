/**
 * Planner role (D-33.4.2) — v2.5 planner/executor boundary.
 *
 * Contract (master plan §A.12):
 *   - planner.plan({ goal }) → returns { tasks }  (decompose into DAG)
 *   - planner.callTool(name, input) → THROWS 'planner cannot call tools'
 *
 * The Planner role can decompose work into DAG tasks but CANNOT call tools.
 * The Executor (existing runToolLoop + new runTaskLoop) runs the tasks.
 */

export interface PlannedTask {
  id: string;
  goal: string;
  dependsOn: ReadonlyArray<string>;
  /** Optional tool to invoke (only allowed if the EXECUTOR runs the plan, not the planner). */
  tool?: { name: string; input: Record<string, unknown> };
}

export interface Plan {
  tasks: ReadonlyArray<PlannedTask>;
}

export interface Planner {
  plan(input: { goal: string }): Promise<Plan>;
  callTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  decomposeGoal?(goal: string): Promise<Plan>;
}

export function createPlanner(): Planner {
  return {
    async plan({ goal }) {
      return { tasks: [{ id: 'plan-0', goal, dependsOn: [] }] };
    },
    async callTool(name, _input) {
      throw new Error('planner cannot call tools: ' + name);
    },
  };
}
