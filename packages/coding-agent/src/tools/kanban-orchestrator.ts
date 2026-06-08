/**
 * kanban_orchestrator 工具 — 多 subagent board 编排 (D-31.1.4, 2026-06-08).
 *
 * 拍板: 接 D-30.3 `delegate_task` (subagent 并行), 加 board 状态机:
 *   todo → in_progress → review → done (or failed).
 *   持久化到 `~/.deepwhale/kanban/board.json` (1 source of truth).
 * - addCard / moveCard / list / delegate 4 action
 * - delegate: 走 subTaskRunner (默认 echo stub, 跟 delegate-task 1:1 协议)
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (spawn subagent).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type SubTaskRunner = (prompt: string) => Promise<string>;
const defaultRunner: SubTaskRunner = async (p) => `[kanban-stub] ${p}`;

export type Lane = 'todo' | 'in_progress' | 'review' | 'done' | 'failed';
const LANES: ReadonlyArray<Lane> = ['todo', 'in_progress', 'review', 'done', 'failed'];

export interface KanbanCard {
  id: string;
  title: string;
  lane: Lane;
  createdAt: number;
  updatedAt: number;
}

export interface Board {
  cards: KanbanCard[];
}

export interface KanbanOptions {
  boardDir: string;
  subTaskRunner?: SubTaskRunner;
}

export class KanbanOrchestratorTool implements Tool {
  readonly name = 'kanban_orchestrator' as ToolName;
  readonly description = 'Multi-subagent kanban board: addCard / moveCard / list / delegate. Persists to board.json. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action: addCard | moveCard | list | delegate', enum: ['addCard', 'moveCard', 'list', 'delegate'] },
      title: { type: 'string', description: 'Card title (addCard)' },
      lane: { type: 'string', description: 'Lane: todo | in_progress | review | done | failed' },
      cardId: { type: 'string', description: 'Card id (moveCard | delegate)' },
      prompt: { type: 'string', description: 'Sub-task prompt (delegate)' },
    },
    required: ['action'],
  };

  private readonly boardDir: string;
  private readonly runner: SubTaskRunner;

  constructor(opts: KanbanOptions) {
    this.boardDir = opts.boardDir;
    this.runner = opts.subTaskRunner ?? defaultRunner;
  }

  private async load(): Promise<Board> {
    try {
      const buf = await fs.readFile(join(this.boardDir, 'board.json'), 'utf8');
      return JSON.parse(buf) as Board;
    } catch {
      return { cards: [] };
    }
  }

  private async save(b: Board): Promise<void> {
    await fs.mkdir(this.boardDir, { recursive: true });
    await fs.writeFile(join(this.boardDir, 'board.json'), JSON.stringify(b, null, 2), 'utf8');
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'addCard': {
          const title = input['title'], lane = (input['lane'] as Lane) ?? 'todo';
          if (typeof title !== 'string') return { success: false, content: '', error: 'invalid-input: title required' };
          if (!LANES.includes(lane)) return { success: false, content: '', error: `invalid-lane: ${lane}` };
          const board = await this.load();
          const now = Date.now();
          const card: KanbanCard = { id: `c${now}-${Math.random().toString(36).slice(2, 8)}`, title, lane, createdAt: now, updatedAt: now };
          board.cards.push(card);
          await this.save(board);
          return { success: true, content: `added ${card.id}`, meta: { cardId: card.id, lane } };
        }
        case 'moveCard': {
          const id = input['cardId'], lane = input['lane'] as Lane;
          if (typeof id !== 'string' || !LANES.includes(lane)) {
            return { success: false, content: '', error: 'invalid-input: cardId + valid lane required' };
          }
          const board = await this.load();
          const card = board.cards.find(c => c.id === id);
          if (!card) return { success: false, content: '', error: `not-found: ${id}` };
          card.lane = lane;
          card.updatedAt = Date.now();
          await this.save(board);
          return { success: true, content: `moved ${id} → ${lane}` };
        }
        case 'list': {
          const board = await this.load();
          return { success: true, content: board.cards.map(c => `${c.lane.padEnd(12)} ${c.id}  ${c.title}`).join('\n') || '(empty)', meta: { raw: JSON.stringify(board.cards) } };
        }
        case 'delegate': {
          const id = input['cardId'], prompt = input['prompt'];
          if (typeof id !== 'string' || typeof prompt !== 'string') {
            return { success: false, content: '', error: 'invalid-input: cardId + prompt required' };
          }
          const board = await this.load();
          const card = board.cards.find(c => c.id === id);
          if (!card) return { success: false, content: '', error: `not-found: ${id}` };
          card.lane = 'in_progress';
          card.updatedAt = Date.now();
          await this.save(board);
          try {
            const out = await this.runner(prompt);
            card.lane = 'done';
            card.updatedAt = Date.now();
            await this.save(board);
            return { success: true, content: out, meta: { cardId: id, lane: 'done' } };
          } catch (e) {
            card.lane = 'failed';
            card.updatedAt = Date.now();
            await this.save(board);
            return { success: false, content: '', error: `delegate error: ${e instanceof Error ? e.message : String(e)}`, meta: { cardId: id, lane: 'failed' } };
          }
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `kanban error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const kanbanOrchestrator = new KanbanOrchestratorTool({
  boardDir: join(process.env.HOME || process.env.USERPROFILE || '.', '.deepwhale', 'kanban'),
});
