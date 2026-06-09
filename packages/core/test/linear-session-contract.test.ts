/**
 * D-33.1.2 — Linear session JSONL contract (v1.0 capability surface).
 *
 * 拍板: v1.0 = Linear session, no DAG. SessionEvent 联合类型**不**变 (DAG 是 v2.0+).
 * 写入 / 读取必须:
 *   1. reload 后事件顺序 = append 顺序 (linear, no re-ordering)
 *   2. `metadata` 字段作为 inert data 完整 round-trip (DAG-style 字段如 parentId
 *      可以以 metadata 形式存, 但 reader 不能因为"出现 metadata"就升级到 DAG mode)
 *   3. 写入路径**不**自动添加 DAG-style 顶层字段 (e.g. `children`)
 *
 * Master plan A.1 helper 形如 `appendSessionEvent(file, event)` (free fn) +
 * `readSessionEvents` 都从 `packages/core/src/session/jsonl.ts` 拿. `createTempSessionFile`
 * 是 test 内部 helper (mkdtempSync + 唯一 filename).
 */
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendSessionEvent,
  readSessionEvents,
  type SessionEvent,
} from '../src/session/jsonl.js';

function createTempSessionFile(): string {
  return join(
    tmpdir(),
    `dw-d33.1.2-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
}

describe('linear session jsonl contract (D-33.1.2)', () => {
  it('reloads events in append order after metadata is present', async () => {
    const file = createTempSessionFile();
    try {
      await appendSessionEvent(file, { kind: 'user', ts: 1, content: 'first' });
      await appendSessionEvent(file, {
        kind: 'assistant',
        ts: 2,
        content: 'second',
        meta: { compacted: true } as Record<string, unknown>,
      });

      const events = await readSessionEvents(file);

      expect(events.map((e) => (e as { ts: number }).ts)).toEqual([1, 2]);
      expect(events[1]).toMatchObject({
        kind: 'assistant',
        meta: { compacted: true },
      } as Partial<SessionEvent>);
    } finally {
      await fs.unlink(file).catch(() => {});
    }
  });

  it('stores dag-style fields as inert metadata in linear mode', async () => {
    const file = createTempSessionFile();
    try {
      await appendSessionEvent(file, {
        kind: 'assistant',
        ts: 1,
        content: 'kept linear',
        meta: { parentId: 'root', leafId: 'leaf' } as Record<string, unknown>,
      });

      const [event] = await readSessionEvents(file);

      expect(event?.meta).toEqual({ parentId: 'root', leafId: 'leaf' });
      expect(event).not.toHaveProperty('children');
      expect(event).not.toHaveProperty('parents');
      expect(event).not.toHaveProperty('edges');
    } finally {
      await fs.unlink(file).catch(() => {});
    }
  });
});
