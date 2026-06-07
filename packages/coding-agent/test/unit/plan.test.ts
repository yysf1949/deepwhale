/**
 * D-30.2.7: plan 工具 (enter/exit/add_step + JSON 持久化).
 *
 * 拍板 (D-30.2): 走 PlanStore 持久到 ~/.deepwhale/plan/current.json.
 * 跟 TodoStore 1:1 同形态: 显式 rootDir 注入 (测试用 tmpdir).
 * - action: 'enter' | 'exit' | 'add_step'
 * - steps: 累积, 自动编号 1..N
 * - 0 改业务, 5 红线 0 触碰
 * - risk: low (本地小数据, 跟 todo store 同档)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlanStore, plan, type PlanState } from '../../src/tools/plan.js';

describe('PlanStore (D-30.2.7)', () => {
  let dir: string;
  let store: PlanStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-plan-'));
    store = new PlanStore(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts inactive with no steps', async () => {
    const state = await store.get();
    expect(state.active).toBe(false);
    expect(state.steps).toEqual([]);
  });

  it('enter activates the plan', async () => {
    await store.enter();
    const state = await store.get();
    expect(state.active).toBe(true);
  });

  it('add_step appends with incrementing no', async () => {
    await store.enter();
    await store.addStep('first step');
    await store.addStep('second step');
    const state = await store.get();
    expect(state.steps).toHaveLength(2);
    expect(state.steps[0]?.no).toBe(1);
    expect(state.steps[1]?.no).toBe(2);
  });

  it('exit deactivates but keeps steps', async () => {
    await store.enter();
    await store.addStep('a');
    await store.exit();
    const state = await store.get();
    expect(state.active).toBe(false);
    expect(state.steps).toHaveLength(1);
  });

  it('persists across instances', async () => {
    await store.enter();
    await store.addStep('persisted');
    const other = new PlanStore(dir);
    const state: PlanState = await other.get();
    expect(state.active).toBe(true);
    expect(state.steps[0]?.text).toBe('persisted');
  });

  it('writes to plan/current.json under root', async () => {
    await store.enter();
    expect(existsSync(join(dir, 'plan', 'current.json'))).toBe(true);
  });
});

describe('plan tool (D-30.2.7)', () => {
  it('action=add_step returns success', async () => {
    const r = await plan.execute({ action: 'add_step', step: 'test step' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('add_step');
  });

  it('action=enter toggles active', async () => {
    const r = await plan.execute({ action: 'enter' });
    expect(r.success).toBe(true);
  });

  it('action=exit returns success', async () => {
    const r = await plan.execute({ action: 'exit' });
    expect(r.success).toBe(true);
  });

  it('returns error for invalid action', async () => {
    const r = await plan.execute({ action: 'bogus' });
    expect(r.success).toBe(false);
  });
});
