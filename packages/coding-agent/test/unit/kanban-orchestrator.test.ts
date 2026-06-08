import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KanbanOrchestratorTool } from '../../src/tools/kanban-orchestrator.js';

describe('kanban_orchestrator', () => {
  let dir = '';
  let tool: KanbanOrchestratorTool;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'kanban-'));
    tool = new KanbanOrchestratorTool({ boardDir: dir });
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('addCard puts card in todo', async () => {
    const r = await tool.execute({ action: 'addCard', title: 'ship D-31.1', lane: 'todo' });
    expect(r.success).toBe(true);
    const list = await tool.execute({ action: 'list' });
    expect(list.content).toContain('ship D-31.1');
  });

  it('moveCard transitions todo → in_progress', async () => {
    await tool.execute({ action: 'addCard', title: 'x', lane: 'todo' });
    const list1 = await tool.execute({ action: 'list' });
    const cardId = JSON.parse((list1.meta as any).raw)[0].id;
    const r = await tool.execute({ action: 'moveCard', cardId, lane: 'in_progress' });
    expect(r.success).toBe(true);
  });

  it('delegate routes to delegate_task runner', async () => {
    const runner = async (prompt: string) => `[mock] ${prompt}`;
    const t = new KanbanOrchestratorTool({ boardDir: dir, subTaskRunner: runner });
    await t.execute({ action: 'addCard', title: 'a', lane: 'todo' });
    const list = await t.execute({ action: 'list' });
    const cardId = JSON.parse((list.meta as any).raw)[0].id;
    const r = await t.execute({ action: 'delegate', cardId, prompt: 'do it' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('do it');
  });

  it('persists board to board.json', async () => {
    await tool.execute({ action: 'addCard', title: 'persist', lane: 'todo' });
    const stat = await fs.stat(join(dir, 'board.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('rejects invalid lane', async () => {
    const r = await tool.execute({ action: 'addCard', title: 'x', lane: 'wat' as any });
    expect(r.success).toBe(false);
  });
});
