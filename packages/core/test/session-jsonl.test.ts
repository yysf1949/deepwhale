import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
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
    // Sprint 1c.7 P3: 兜底清理 vi.spyOn, 防止某次 expect 失败时 mock 泄漏到
    // 后续测试. 各 spy 块自身末尾也有 mockRestore (正常路径), 这里是失败兜底.
    vi.restoreAllMocks();
    try {
      await fs.unlink(testFile);
    } catch (err) {
      // Sprint 1c.5: 不再静默吞. ENOENT 正常 (跑前文件已删) 静默; 其他失败
      // (EPERM/EBUSY/Windows 残留) console.warn 留诊断线索, 不 throw (避免 Linux CI 红).
      // 跨平台策略: ENOENT 静默, 其他 warn — 不影响正常 Linux CI 绿.
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        console.warn(
          `[session-jsonl.test] unlink ${testFile} failed: ${e.code ?? 'UNKNOWN'} ${e.message}`,
        );
      }
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

  describe('Sprint 1c regression: kill -9 / 进程被杀 / 断电场景', () => {
    // 2026-06-04: 这组测试模拟"agent 跑了 N 步后被 kill -9 / 断电 / 进程崩溃"的真实 crash 场景.
    // 目标不是 100% 防丢 (fsync 边界由 OS 决定, 应用层无法保证), 而是验证:
    //   1. 二次启动能恢复到 crash 前的最后一个完整状态
    //   2. 二次启动后的 append 不会拼坏 JSON (no-concat-with-partial-line)
    //   3. 极端 corrupt 状态 (size>0 但 0 完整行) 不阻塞启动
    // 全部用真 fs 操作, 不用 mock — R-G1 经验: mock 不模拟 OS 语义

    it('multi-turn crash: 5 turn 后 partial last line, reopen + append 不拼坏 JSON', async () => {
      // 模拟: agent 跑了 5 turn (每 turn = user/assistant/tool/assistant 共 4 步)
      // 写到第 5 turn 最后一条 assistant 中途被 kill
      const w = new SessionWriter(testFile);
      await w.open();
      for (let t = 0; t < 5; t++) {
        await w.append({ kind: 'user', ts: t * 4, content: `q${t}` });
        await w.append({ kind: 'assistant', ts: t * 4 + 1, content: `calling tool for q${t}` });
        await w.append({
          kind: 'tool',
          ts: t * 4 + 2,
          tool_call_id: `c${t}`,
          name: 'echo',
          result: { success: true, content: `out${t}` },
          duration_ms: 1,
        });
        await w.append({ kind: 'assistant', ts: t * 4 + 3, content: `done q${t}` });
      }
      await w.close();

      // 真实 crash 模拟: 模拟"OS 层 write 完但应用没 fsync 就被杀" 的窗口
      // (用 raw fs.appendFile 模拟"partial line 落到文件但应用没机会 read+truncate")
      // 用独特 marker "PARTIAL_TURN5_MARKER" 避免跟 user 消息 "q5" 字符串误匹配
      const partial = '{"kind":"user","ts":20,"content":"PARTIAL_TURN5_MARKER';
      await fs.appendFile(testFile, partial, 'utf8');
      // 注意: partial 本身不是原子 OS 行为, 但对 readAll 来说效果等价 — JSON.parse 失败 → 截断

      // === 二次启动 ===
      const reader = new SessionReader(testFile);
      const events = await reader.readAll();
      // 5 turn × 4 步 = 20 条完整事件, partial line 不算
      expect(events).toHaveLength(20);
      expect(events[0]).toMatchObject({ kind: 'user', content: 'q0' });
      expect(events[19]).toMatchObject({ kind: 'assistant', content: 'done q4' });

      // Sprint 1b 闭环: loadSession 内部 truncate
      await reader.truncate();
      const afterTrunc = await fs.readFile(testFile, 'utf8');
      // partial line 被清掉
      expect(afterTrunc).not.toContain('PARTIAL_TURN5_MARKER');
      // 文件以 \n 结尾 (不是 partial 字节)
      expect(afterTrunc.endsWith('\n')).toBe(true);

      // 关键回归: 续写新条目必须独立成行, 不拼到 partial
      const w2 = new SessionWriter(testFile);
      await w2.open();
      await w2.append({ kind: 'user', ts: 24, content: 'q5-recovery' });
      await w2.close();

      // 重新读: 应当 20 旧 + 1 新 = 21 条, 全部能 parse
      const finalEvents = await readSessionEvents(testFile);
      expect(finalEvents).toHaveLength(21);
      expect(finalEvents[20]).toMatchObject({ kind: 'user', content: 'q5-recovery' });
    });

    it('中间损坏: 损坏行 + 后续完整行, truncate 后从损坏点续写', async () => {
      // 跟"末尾 partial line"不同, 真实 crash 也可能在中间一行写一半.
      // 已有测试 (中间损坏) 验证了 readAll 行为, 这里补"truncate 后续写"契约
      const content = [
        JSON.stringify({ kind: 'user', ts: 1, content: 'q1' }),
        JSON.stringify({ kind: 'assistant', ts: 2, content: 'a1' }),
        '{corrupted: not valid', // 模拟: 第 3 步写到一半被 kill
        JSON.stringify({ kind: 'user', ts: 4, content: 'q2-after-corruption' }),
        '',
      ].join('\n');
      await fs.writeFile(testFile, content, 'utf8');

      // === 二次启动 ===
      const reader = new SessionReader(testFile);
      const events = await reader.readAll();
      // 损坏处之前 2 条 OK, 损坏 + 之后全丢
      expect(events).toHaveLength(2);
      await reader.truncate();
      const afterTrunc = await fs.readFile(testFile, 'utf8');
      // 损坏 + 之后全清
      expect(afterTrunc).not.toContain('corrupted');
      expect(afterTrunc).not.toContain('q2-after-corruption');
      expect(afterTrunc.endsWith('\n')).toBe(true);

      // 关键: 续写不拼到损坏字节
      const w = new SessionWriter(testFile);
      await w.open();
      await w.append({ kind: 'user', ts: 5, content: 'q3-recovery' });
      await w.close();

      const finalEvents = await readSessionEvents(testFile);
      expect(finalEvents).toHaveLength(3);
      expect(finalEvents[0]).toMatchObject({ content: 'q1' });
      expect(finalEvents[1]).toMatchObject({ content: 'a1' });
      expect(finalEvents[2]).toMatchObject({ content: 'q3-recovery' });
    });

    it('size>0 但 0 完整行: readAll 返 [], 不抛错 (启动时不阻塞)', async () => {
      // 真实 crash 极端场景: 文件被 OS 截断到 1 字节 partial, readAll 必须返 []
      // (不能 throw, 否则 agent 启动时遇到这种文件会卡死)
      await fs.writeFile(testFile, '{', 'utf8');

      const events = await readSessionEvents(testFile);
      expect(events).toEqual([]);

      // 续写: truncate 清掉 partial, 后续 append 干净
      const w = new SessionWriter(testFile);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'recovered-from-nothing' });
      await w.close();

      const finalEvents = await readSessionEvents(testFile);
      expect(finalEvents).toHaveLength(1);
      expect(finalEvents[0]).toMatchObject({ content: 'recovered-from-nothing' });
    });

    it('reopen writer append 后顺序连续: kill 中间不丢 (≤ 1 条边界)', async () => {
      // 模拟"写完 5 条, kill 进程 (close 未调用), 二次启动 reopen 同一个文件再写 5 条"
      // 验证: 二次启动后 readAll 拿到至少前 5 条 (fsync 边界后可能丢 1 条, 接受)
      //
      // 模拟语义的精度说明 (P3 反馈后):
      //   真实 kill -9 = 5 条 fsync 中途 / 完成后任意点死, handle 泄漏.
      //   本测试用 "5 条全 await 完 + close 排空" 模拟, 不是 100% kill -9 语义.
      //   接受这个弱化的原因:
      //     1) append 内部 await sync — 5 条全部落盘, 跟"kill 在 fsync 前" 测试场景不在此覆盖
      //     2) close() 不再 await 后还有未完成的写 (writeQueue 已空) — 跟真 kill 的差异
      //        主要是 fd 泄漏, 不影响落盘事实
      //   如要测"kill 在 fsync 前"边界, 需用 raw handle.write 不 sync 模拟, 后续 Sprint 处理.
      const w1 = new SessionWriter(testFile);
      try {
        await w1.open();
        for (let i = 0; i < 5; i++) {
          await w1.append({ kind: 'user', ts: i, content: `first-${i}` });
        }
        // 模拟 "进程被 kill 前 append 全部 fsync 完成": 不再显式 close, 走 finally 兜底
      } finally {
        // P3 cleanup: Windows 上未释放 handle 让 afterEach unlink 失败 (虽被吞, 留 tmp 文件).
        // .catch 兜底 — w1 可能因异常处于不一致状态, 释放失败不应让测试 fail.
        await w1.close().catch(() => {});
      }

      // === 二次启动 ===
      const w2 = new SessionWriter(testFile);
      await w2.open();
      for (let i = 0; i < 5; i++) {
        await w2.append({ kind: 'assistant', ts: 100 + i, content: `second-${i}` });
      }
      await w2.close();

      const events = await readSessionEvents(testFile);
      // 5 first + 5 second = 10 条 (Sprint 1c 不变量: append 内部 sync, 二次启动至少保留前 5)
      expect(events).toHaveLength(10);
      expect(events[0]).toMatchObject({ kind: 'user', content: 'first-0' });
      expect(events[4]).toMatchObject({ kind: 'user', content: 'first-4' });
      expect(events[5]).toMatchObject({ kind: 'assistant', content: 'second-0' });
      expect(events[9]).toMatchObject({ kind: 'assistant', content: 'second-4' });
    });

    it('Sprint 1c.6: truncate atomic rename, 不留 .tmp 残留 + 永不写空文件', async () => {
      // Sprint 1c.6 修 1c.5 漏洞 (review P2 反馈 2026-06-04): 旧实现
      // fs.open(this.path, 'w') — 'w' = O_TRUNC 立即截 0. fsync 救不了
      // "open → write" 窗口 (进程被杀 → 0 字节). 1c.5 test 只验了
      // "成功路径 stat().size", 没覆盖最坏窗口, 是 R-G1 反例.
      //
      // 新实现: temp + atomic rename. 关键不变量 (1c.6 spec):
      //   1. truncate 返回后, 文件内容 = keep (happy path)
      //   2. 没有任何 .tmp 残留 (happy + 写失败都清理)
      //   3. 文件不可能 0 字节 (R-G1 真核心: rename 没成功时原文件没动)
      //
      // 本测试覆盖 (1)+(2)+(3). (3) 的不变量通过以下 2 条路径保证:
      //   - 写 temp 失败: catch 块 unlink temp, 原文件**没动** (没 open 原文件)
      //   - rename 失败: catch 块 unlink temp, rename 没成功原文件**没动**
      // 两种情况都抛错给 caller, 但 caller (session-adapter.loadSession) 已 try/catch 吞.
      const fullEvent = JSON.stringify({ kind: 'user', ts: 1, content: 'complete' });
      const partialLine = '{"kind":"assistant","ts":2,"content":"partia';
      const fullLineLen = fullEvent.length + 1; // + \n
      await fs.writeFile(testFile, fullEvent + '\n' + partialLine, 'utf8');

      const reader = new SessionReader(testFile);
      await reader.readAll();
      await reader.truncate();

      // 契约 1: 文件内容 = keep
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).toBe(fullEvent + '\n');
      // 契约 2: stat().size 落盘 = keep 字节 (跟 1c.5 兼容, 加固)
      const stat = await fs.stat(testFile);
      expect(stat.size).toBe(fullLineLen);
      // 契约 3 (1c.6 新): 没有任何 .tmp 残留 (扫同 dir 找 .tmp 文件)
      // 1c.8 (review P2 反馈 2026-06-04): happy path 跟 failure-path 统一成
      // dirname/basename — 旧写法 testFile.split('/').pop() 在 Windows
      // 拿到整个 "C:\\…\\test.jsonl" 绝对路径, fs.readdir 返回的是文件名
      // (不带 dir 前缀), startsWith 永远对不上, "truncate 成功不留 temp"
      // 断言在 Windows 上是假阴性.
      const tmpDir = dirname(testFile);
      const tmpBase = basename(testFile);
      const entries = await fs.readdir(tmpDir);
      const tmpLeftover = entries.find(
        (name) => name.startsWith(`${tmpBase}.`) && name.endsWith('.tmp'),
      );
      expect(tmpLeftover).toBeUndefined();
    });

    it('Sprint 1c.6: 写 temp 阶段失败时, 原文件完整保留 + temp 清理 (不变量覆盖)', async () => {
      // 1c.6 核心不变量: "写 temp 失败 → 原文件**完整保留**" — R-G1 必测.
      // 模拟方式: spy handle.writeFile 让它抛 ENOSPC (磁盘满).
      // 实际 fs 行为: 写 temp 失败 → catch 块清理 + 抛错 + 原文件**没动** (没 open).
      // 难点: spy handle.writeFile 需要先拿到 handle. 改用更稳的方式:
      //   spy fs.promises.open 当 path 含 '.tmp' 时返回的 handle 写失败.
      //   实际实现里 handle 是 fs.open(tempPath, 'w') 来的, 我们能区分 path.
      //
      // R-G1 折中: spy 模拟 "temp 写失败" 的副作用, 验证**不变量**(原文件保留 +
      // temp 清理) 而不是机制.
      const originalContent = JSON.stringify({ kind: 'user', ts: 1, content: 'keep-me' });
      const partialLine = '{"kind":"assistant","ts":2,"content":"partia';
      await fs.writeFile(testFile, originalContent + '\n' + partialLine, 'utf8');

      // spy fs.open: 当目标是 .tmp path 时, 返回的 handle.writeFile 抛错
      const realOpen = fs.open;
      const writeFileSpy = vi.fn().mockRejectedValueOnce(
        Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }),
      );
      const fakeHandle = {
        writeFile: writeFileSpy,
        sync: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const openSpy = vi.spyOn(fs, 'open').mockImplementation(async (path, flags) => {
        if (typeof path === 'string' && path.endsWith('.tmp')) {
          return fakeHandle as never;
        }
        return realOpen(path, flags);
      });

      const reader = new SessionReader(testFile);
      await reader.readAll();
      // 写 temp 失败 → truncate 抛错
      await expect(reader.truncate()).rejects.toThrow(/no space/);

      // 不变量 1: 原文件**完整保留** (没动) — 1c.6 核心
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).toBe(originalContent + '\n' + partialLine);
      // 不变量 2: temp 清理 (catch 块 unlink) — 防止垃圾堆
      // Sprint 1c.7 P2: 用 dirname/basename 替 split('/'), 修 Windows 反斜杠路径假阴性
      const dir = dirname(testFile);
      const base = basename(testFile);
      const entries = await fs.readdir(dir);
      const tmpLeftover = entries.find(
        (name) => name.startsWith(`${base}.`) && name.endsWith('.tmp'),
      );
      expect(tmpLeftover).toBeUndefined();

      openSpy.mockRestore();
    });

    it('Sprint 1c.6: rename 失败时, 原文件不动 + temp 清理 (不变量覆盖)', async () => {
      // 1c.6 另一个不变量: "rename 失败 → 原文件**不动**" — POSIX atomic 保证.
      // 模拟方式: 让 fs.rename 抛错. 实际原子性是 OS 层, 我们只测清理路径.
      // R-G1 折中: spy fs.rename 抛错, 验证不变量 (原文件完整 + temp 清理).
      const originalContent = JSON.stringify({ kind: 'user', ts: 1, content: 'keep-me' });
      const partialLine = '{"kind":"assistant","ts":2,"content":"partia';
      await fs.writeFile(testFile, originalContent + '\n' + partialLine, 'utf8');

      const renameSpy = vi
        .spyOn(fs, 'rename')
        .mockRejectedValueOnce(
          Object.assign(new Error('cross-device link'), { code: 'EXDEV' }),
        );

      const reader = new SessionReader(testFile);
      await reader.readAll();
      // rename 失败 → truncate 抛错
      await expect(reader.truncate()).rejects.toThrow(/cross-device/);

      // 不变量 1: 原文件**完整保留** (rename 没成功)
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).toBe(originalContent + '\n' + partialLine);
      // 不变量 2: temp 清理
      // Sprint 1c.7 P2: 同上, dirname/basename
      const dir = dirname(testFile);
      const base = basename(testFile);
      const entries = await fs.readdir(dir);
      const tmpLeftover = entries.find(
        (name) => name.startsWith(`${base}.`) && name.endsWith('.tmp'),
      );
      expect(tmpLeftover).toBeUndefined();

      renameSpy.mockRestore();
    });

    //
    // 注: 1c.5 还改了 afterEach unlink "ENOENT 静默 + 其他 warn" 跨平台可诊断.
    // 策略契约**不**单测 — R-G1 风险 (spy fs.promises.unlink 全局副作用 + 复刻 afterEach
    // 逻辑 = 重复), 现有 1c 测试覆盖真实 unlink 成功路径. 策略靠两个 afterEach 代码 review 对齐.

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
