import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionWriter, readSessionEvents, type SessionEvent } from '../src/session/jsonl.js';

describe('Sprint 0.2: Session JSONL (append-only + crash recovery)', () => {
  let testFile: string;

  beforeEach(() => {
    testFile = join(
      tmpdir(),
      `dw-session-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFile);
    } catch {
      // ignore
    }
  });

  describe('SessionWriter', () => {
    it('appends events line-by-line', async () => {
      const w = new SessionWriter(testFile);
      await w.open();
      await w.append({ kind: 'user', ts: 100, content: 'hello' });
      await w.append({ kind: 'assistant', ts: 200, content: 'hi there' });
      await w.close();

      const content = await fs.readFile(testFile, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).kind).toBe('user');
      expect(JSON.parse(lines[1]!).kind).toBe('assistant');
    });

    it('serializes concurrent appends (no interleaving)', async () => {
      const w = new SessionWriter(testFile);
      await w.open();
      const promises = Array.from({ length: 50 }, (_, i) =>
        w.append({ kind: 'system', ts: i, content: `event-${i}` }),
      );
      await Promise.all(promises);
      await w.close();

      const events = await readSessionEvents(testFile);
      expect(events).toHaveLength(50);
      // 验证顺序（fsync 串行化保证）
      for (let i = 0; i < 50; i++) {
        expect((events[i] as { ts: number }).ts).toBe(i);
      }
    });

    it('throws if append called before open', async () => {
      const w = new SessionWriter(testFile);
      await expect(w.append({ kind: 'user', ts: 0, content: 'x' })).rejects.toThrow(/open\(\)/);
    });

    it('close() drains pending writes (regression: append-then-close)', async () => {
      // 回归：append 后立刻 close（不 await）必须把那条事件写完。
      // 旧实现会触发 'EBADF' / 'file closed' 错误。
      const w = new SessionWriter(testFile);
      await w.open();
      const appendP = w.append({ kind: 'user', ts: 42, content: 'pending' });
      await w.close();
      await appendP; // 不应 throw

      const content = await fs.readFile(testFile, 'utf8');
      expect(content).toContain('"ts":42');
      expect(content).toContain('pending');
    });

    it('close() is safe to call multiple times', async () => {
      const w = new SessionWriter(testFile);
      await w.open();
      await w.close();
      await w.close(); // 不应 throw
    });
  });

  describe('SessionReader — crash recovery', () => {
    it('reads valid JSONL with all complete lines', async () => {
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'a' },
        { kind: 'assistant', ts: 2, content: 'b' },
      ];
      const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(testFile, content, 'utf8');

      const read = await readSessionEvents(testFile);
      expect(read).toHaveLength(2);
      expect(read[0]?.kind).toBe('user');
    });

    it('truncates partial last line (crash recovery)', async () => {
      // 模拟：第 1 行完整，第 2 行 partial（写入中被 kill -9）
      const fullEvent = JSON.stringify({ kind: 'user', ts: 1, content: 'complete' });
      const partialLine = '{"kind":"assistant","ts":2,"content":"partia';
      await fs.writeFile(testFile, fullEvent + '\n' + partialLine, 'utf8');

      const events = await readSessionEvents(testFile);
      expect(events).toHaveLength(1); // 只返回完整的那行
      expect(events[0]?.kind).toBe('user');

      // 验证 truncate 已生效
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).not.toContain('partia');
    });

    it('handles missing file gracefully (returns empty)', async () => {
      const events = await readSessionEvents('/nonexistent/xxx.jsonl');
      expect(events).toEqual([]);
    });
  });

  describe('End-to-end: write → read → truncate', () => {
    it('recovers a corrupted session', async () => {
      const w = new SessionWriter(testFile);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'q1' });
      await w.append({ kind: 'assistant', ts: 2, content: 'a1' });
      await w.close();

      // 模拟 crash：在文件末尾追加一个 partial line
      await fs.appendFile(testFile, '{"kind":"user","ts":3,"content":"q2', 'utf8');

      const events = await readSessionEvents(testFile);
      expect(events).toHaveLength(2);

      // truncate 已自动调用
      const final = await fs.readFile(testFile, 'utf8');
      expect(final).not.toContain('q2');
    });
  });
});
