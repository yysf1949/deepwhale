/**
 * plan 工具 — Plan mode 持久化 + 工具入口 (D-30.2.7, 2026-06-07).
 *
 * 走 PlanStore 持久到 ~/.deepwhale/plan/current.json.
 * 跟 TodoStore 1:1 同形态: 显式 rootDir 注入 (测试用 tmpdir).
 * - action: 'enter' | 'exit' | 'add_step'
 * - steps: 累积, 自动编号 1..N
 * - 0 改业务, 5 红线 0 触碰
 * - risk: low (本地小数据, 跟 todo store 同档)
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { deepwhaleRoot } from '../util/deepwhale-paths.js';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export interface PlanStep {
  no: number;
  text: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface PlanState {
  active: boolean;
  steps: PlanStep[];
}

/**
 * PlanStore — ~/.deepwhale/plan/current.json 单文件 store.
 * 跟 TodoStore 1:1 同形态 (显式 rootDir 注入, 测试用 tmpdir).
 */
export class PlanStore {
  constructor(private readonly rootDir: string) {}

  private get planPath(): string {
    return join(this.rootDir, 'plan', 'current.json');
  }

  async get(): Promise<PlanState> {
    try {
      const data = await fs.readFile(this.planPath, 'utf8');
      const parsed = JSON.parse(data) as unknown;
      if (typeof parsed !== 'object' || parsed === null) {
        return { active: false, steps: [] };
      }
      const obj = parsed as { active?: boolean; steps?: PlanStep[] };
      return {
        active: obj.active === true,
        steps: Array.isArray(obj.steps) ? obj.steps : [],
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { active: false, steps: [] };
      }
      throw e;
    }
  }

  async enter(): Promise<void> {
    const state = await this.get();
    state.active = true;
    await this.save(state);
  }

  async exit(): Promise<void> {
    const state = await this.get();
    state.active = false;
    await this.save(state);
  }

  async addStep(text: string): Promise<PlanStep> {
    const state = await this.get();
    const step: PlanStep = {
      no: state.steps.length + 1,
      text,
      status: 'pending',
    };
    state.steps.push(step);
    await this.save(state);
    return step;
  }

  private async save(state: PlanState): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'plan'), { recursive: true });
    await fs.writeFile(this.planPath, JSON.stringify(state, null, 2), 'utf8');
  }
}

export class PlanTool implements Tool {
  readonly name = 'plan' as ToolName;
  readonly description =
    'Plan mode (enter / exit / add_step). Persists to ~/.deepwhale/plan/current.json. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = [] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['enter', 'exit', 'add_step'],
      },
      step: { type: 'string', description: 'Step text (for action=add_step)' },
    },
    required: ['action'],
  };

  private store(): PlanStore {
    return new PlanStore(deepwhaleRoot());
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const step = input['step'];

    if (action !== 'enter' && action !== 'exit' && action !== 'add_step') {
      return {
        success: false,
        content: '',
        error: 'invalid-input: action must be "enter" | "exit" | "add_step"',
      };
    }

    const store = this.store();
    try {
      if (action === 'enter') {
        await store.enter();
        return { success: true, content: 'plan: enter', meta: { active: true } };
      }
      if (action === 'exit') {
        await store.exit();
        return { success: true, content: 'plan: exit', meta: { active: false } };
      }
      // add_step
      if (typeof step !== 'string' || step.length === 0) {
        return { success: false, content: '', error: 'invalid-input: step is required for add_step' };
      }
      const added = await store.addStep(step);
      return {
        success: true,
        content: `plan: add_step ${added.no} (${added.text})`,
        meta: { step: added },
      };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `plan error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}

export const plan = new PlanTool();
