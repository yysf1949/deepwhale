import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionWriter, SessionReader, readSessionEvents, type SessionEvent } from '../src/session/jsonl.js';

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

  describe('Sprint 1b: SessionReader.truncate 幂等性 (caller 可以放心反复调)', () => {
    it('无 partial line 时 truncate 是 no-op (truncated = 0)', async () => {
      // 写 3 条完整事件
      const w = new SessionWriter(testFile);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'q1' });
      await w.append({ kind: 'assistant', ts: 2, content: 'a1' });
      await w.append({ kind: 'user', ts: 3, content: 'q2' });
      await w.close();

      // readAll 后 lastIncompleteLineIndex = -1, truncate 应当返回 truncated=0 不写文件
      const reader = new SessionReader(testFile);
      const before = await fs.readFile(testFile, 'utf8');
      await reader.readAll();
      const result = await reader.truncate();
      const after = await fs.readFile(testFile, 'utf8');
      expect(result.truncated).toBe(0);
      expect(after).toBe(before);
    });

    it('partial line 被截断后, 后续 append 不拼坏 JSON (关键回归)', async () => {
      // Sprint 1a 已知 bug: partial line 不被清, 下次 append 接着 partial 拼 → JSON.parse 失败
      // Sprint 1b 修复 (在 adapter.loadSession): 调 truncate 后再 append, 新行必独立成行
      const w = new SessionWriter(testFile);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'q1' });
      await w.close();
      // 模拟 crash: 截断最后一行一半
      await fs.appendFile(testFile, '{"kind":"user","ts":2,"content":"q2', 'utf8');

      // Sprint 1a 行为: readAll 返回 1 条, partial line 仍在文件
      // Sprint 1b 行为 (走 loadSession): 自动 truncate, 文件被清干净
      const reader = new SessionReader(testFile);
      await reader.readAll();
      await reader.truncate();

      // 验证: 文件末尾必是 \n (上次 close 留的), partial line 已被切掉
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).not.toContain('q2');
      // 关键: 后续 append 不拼坏 JSON
      const w2 = new SessionWriter(testFile);
      await w2.open();
      await w2.append({ kind: 'user', ts: 3, content: 'q3' });
      await w2.close();
      // 重新读取所有 event 应当能完整 parse
      const final = await readSessionEvents(testFile);
      expect(final).toHaveLength(2);
      expect(final[0]?.kind).toBe('user');
      expect(final[1]?.kind).toBe('user');
    });

    it('中间一行 JSON 损坏: 损坏处之后全部忽略, 但前部分仍可读', async () => {
      // 真实 crash 场景: fsync 之前断电, 中间一行可能半写
      // 跟"末尾 partial line"不同, 损坏在中间
      // 契约: readAll 返回损坏处之前的所有 event, truncate 清掉从损坏点开始的所有内容
      const content = [
        JSON.stringify({ kind: 'user', ts: 1, content: 'q1' }),
        JSON.stringify({ kind: 'assistant', ts: 2, content: 'a1' }),
        '{corrupted: this is not valid JSON', // 中间损坏
        JSON.stringify({ kind: 'user', ts: 4, content: 'q2' }),
        '', // 末尾
      ].join('\n');
      await fs.writeFile(testFile, content, 'utf8');

      const reader = new SessionReader(testFile);
      const events = await reader.readAll();
      // 损坏处之后 (含损坏那一行) 全部忽略
      expect(events).toHaveLength(2);
      expect(events[0]?.kind).toBe('user');
      expect(events[1]?.kind).toBe('assistant');
      // truncate 清掉损坏点开始的全部内容
      await reader.truncate();
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).not.toContain('corrupted');
      expect(after).not.toContain('q2');
    });
  });
});
