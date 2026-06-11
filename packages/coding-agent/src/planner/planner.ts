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

import type { LLMClient } from '@deepwhale/llm';

export interface PlannedTask {
  id: string;
  goal: string;
  dependsOn: ReadonlyArray<string>;
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

/**
 * Simple stub planner — returns a single task wrapping the goal.
 */
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

const PLANNER_SYSTEM_PROMPT = [
  'You are a planning agent. Decompose the user\'s goal into a directed acyclic',
  'graph (DAG) of concrete tasks. Each task should be small enough for one',
  'coding-agent turn to execute independently.',
  '',
  'Return ONLY a JSON object with this exact shape (no prose outside the code',
  'fence):',
  '',
  '```json',
  '{',
  '  "tasks": [',
  '    { "id": "task-1", "goal": "...", "dependsOn": [] },',
  '    { "id": "task-2", "goal": "...", "dependsOn": ["task-1"] }',
  '  ]',
  '}',
  '```',
  '',
  'Rules:',
  '- ids are stable, kebab-case strings (e.g. "scan-files", "apply-rename").',
  '- dependsOn entries must reference ids that appear in the same plan.',
  '- The graph must be acyclic.',
  '- Prefer 2-6 tasks for a single goal. Do not invent tasks unrelated to the goal.',
].join('\n');

interface RawTaskJson {
  id?: unknown;
  goal?: unknown;
  dependsOn?: unknown;
}

interface RawPlanJson {
  tasks?: unknown;
}

/**
 * LLM-backed planner. Constructor takes the LLMClient dependency.
 */
export class LLMPlanner {
  constructor(private readonly client: LLMClient) {}

  async plan(input: { goal: string }): Promise<Plan> {
    const messages = [
      { role: 'system' as const, content: PLANNER_SYSTEM_PROMPT },
      { role: 'user' as const, content: `Goal: ${input.goal}` },
    ];
    const result = await this.client.chat(messages);
    const parsed = parsePlannerJson(result.content);
    const tasks = parsed
      .map(toPlannedTask)
      .filter((t): t is PlannedTask => t !== null);
    if (tasks.length === 0) {
      return { tasks: [{ id: 'plan-0', goal: input.goal, dependsOn: [] }] };
    }
    return { tasks };
  }

  async callTool(name: string, _input: Record<string, unknown>): Promise<unknown> {
    throw new Error('planner cannot call tools: ' + name);
  }

  async decomposeGoal(goal: string): Promise<Plan> {
    return this.plan({ goal });
  }
}

/**
 * Factory mirroring createPlanner(). Lets callers wire in a specific LLMClient.
 */
export function createLLMPlanner(client: LLMClient): Planner {
  return new LLMPlanner(client);
}

function parsePlannerJson(content: string): RawTaskJson[] {
  const text = extractJsonObject(content);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `planner: LLM response is not valid JSON: ${(e as Error).message}`,
    );
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('planner: LLM JSON root must be an object');
  }
  const tasks = (raw as RawPlanJson).tasks;
  if (!Array.isArray(tasks)) {
    throw new Error('planner: LLM JSON must have a "tasks" array');
  }
  return tasks as RawTaskJson[];
}

function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenced && typeof fenced[1] === 'string') {
    return fenced[1].trim();
  }
  const start = content.indexOf('{');
  if (start === -1) {
    throw new Error('planner: no JSON object found in LLM response');
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (ch === undefined) break;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
  }
  throw new Error('planner: unbalanced braces in LLM JSON response');
}

function toPlannedTask(raw: RawTaskJson): PlannedTask | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (typeof raw.goal !== 'string' || raw.goal === '') return null;
  let dependsOn: ReadonlyArray<string> = [];
  if (raw.dependsOn !== undefined) {
    if (!Array.isArray(raw.dependsOn)) return null;
    if (!raw.dependsOn.every((d) => typeof d === 'string')) return null;
    dependsOn = raw.dependsOn as ReadonlyArray<string>;
  }
  return { id: raw.id, goal: raw.goal, dependsOn };
}
