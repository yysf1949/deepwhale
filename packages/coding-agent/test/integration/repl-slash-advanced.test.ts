/**
 * D-30.1δ.2-δ.7 → δ.11-δ.16: REPL 6 advanced slash 验证.
 *
 * 拍板 (D-30.1δ): /memory /skills /cron /sessions /load /plan 走 router, 由 caller
 * 注入 store 回调 (MemoryStore / SkillStore / CronStore / SessionIndex).
 *
 * D-30.1δ.11-δ.14: callback 重命名 + shape 调整 (listCronJobs → listCron,
 *   searchSessions → listSessions, loadSessionById → loadSession (Promise<void>),
 *   getPlan → enterPlanMode (void)). 行为 1:1 保, 渲染格式跟 plan 1:1 对齐.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl slash /memory (D-30.1δ.2)', () => {
  it('shows current memory', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/memory', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      getMemory: async () => 'user prefers concise answers',
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('MEMORY');
    expect(outText).toContain('user prefers concise answers');
  });

  it('appends to memory when arg given', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const appendFn = vi.fn().mockResolvedValue(undefined);
    const result = await dispatchSlashBuiltin('/memory user likes dark mode', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      appendMemory: appendFn,
    });
    expect(result.handled).toBe(true);
    expect(appendFn).toHaveBeenCalledWith('user likes dark mode');
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('memory appended');
  });
});

describe('repl slash /skills (D-30.1δ.3)', () => {
  it('lists skills', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/skills', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listSkills: async () => ['code-review', 'refactor'],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('code-review');
    expect(outText).toContain('refactor');
    expect(outText).toContain('2 skills');
  });

  it('reads skill by name', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/skills code-review', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      readSkill: async (n) => `# ${n}\n\ndo code review`,
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('code review');
  });
});

describe('repl slash /cron (D-30.1δ.11)', () => {
  it('lists cron jobs', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/cron', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listCron: async () => [
        { id: 'j1', schedule: '0 * * * *', prompt: 'hourly check', enabled: true },
        { id: 'j2', schedule: '0 0 * * *', prompt: 'daily cleanup', enabled: false },
      ],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('j1');
    expect(outText).toContain('j2');
    expect(outText).toContain('hourly check');
    expect(outText).toContain('2 cron jobs');
  });
});

describe('repl slash /sessions (D-30.1δ.12)', () => {
  it('lists sessions from SessionIndex', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/sessions', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listSessions: async () => [
        { id: 's1', path: '/tmp/s1.jsonl', messageCount: 3, firstUser: 'fix bug', createdAt: 1000 },
        { id: 's2', path: '/tmp/s2.jsonl', messageCount: 7, firstUser: 'add feature', createdAt: 2000 },
      ],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('s1');
    expect(outText).toContain('s2');
    expect(outText).toContain('fix bug');
    expect(outText).toContain('3 msgs');
  });

  it('handles empty session list', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/sessions', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listSessions: async () => [],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('no sessions found');
  });
});

describe('repl slash /load (D-30.1δ.13)', () => {
  it('loads session by id', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    let capturedId = '';
    const result = await dispatchSlashBuiltin('/load s1', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      loadSession: async (id: string) => {
        capturedId = id;
      },
    });
    expect(result.handled).toBe(true);
    expect(capturedId).toBe('s1');
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('loaded: s1');
  });

  it('shows usage when no id', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/load', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      loadSession: vi.fn(),
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('usage');
  });
});

describe('repl slash /plan (D-30.1δ.14)', () => {
  it('enters plan mode', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    let entered = false;
    const result = await dispatchSlashBuiltin('/plan', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      enterPlanMode: () => {
        entered = true;
      },
    });
    expect(result.handled).toBe(true);
    expect(entered).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('plan mode');
  });

  it('handles missing enterPlanMode callback', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/plan', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('plan mode');
  });
});
