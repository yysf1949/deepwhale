/**
 * D-30.1δ.2-δ.7: REPL 6 advanced slash 验证.
 *
 * 拍板 (D-30.1δ): /memory /skills /cron /sessions /load /plan 走 router, 由 caller
 * 注入 store 回调 (MemoryStore / SkillStore / CronStore / SessionStore).
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

describe('repl slash /cron (D-30.1δ.4)', () => {
  it('lists cron jobs', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/cron', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listCronJobs: async () => [
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

describe('repl slash /sessions (D-30.1δ.5)', () => {
  it('lists recent sessions when no arg', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/sessions', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      searchSessions: async () => [
        { id: 's1', path: '/tmp/s1.jsonl', firstUser: 'fix bug' },
        { id: 's2', path: '/tmp/s2.jsonl', firstUser: 'add feature' },
      ],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('s1');
    expect(outText).toContain('fix bug');
  });

  it('searches sessions with query', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const searchFn = vi.fn().mockResolvedValue([
      { id: 's1', path: '/tmp/s1.jsonl', firstUser: 'fix bug' },
    ]);
    const result = await dispatchSlashBuiltin('/sessions bug', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      searchSessions: searchFn,
    });
    expect(result.handled).toBe(true);
    expect(searchFn).toHaveBeenCalledWith('bug');
  });
});

describe('repl slash /load (D-30.1δ.6)', () => {
  it('loads session by id', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/load s1', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      loadSessionById: async () => '/tmp/s1.jsonl',
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('loaded');
    expect(outText).toContain('/tmp/s1.jsonl');
  });

  it('reports session not found', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/load nope', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      loadSessionById: async () => null,
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('not found');
  });
});

describe('repl slash /plan (D-30.1δ.7)', () => {
  it('shows current plan', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/plan', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      getPlan: () => 'Step 1: do X\nStep 2: do Y',
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('Plan');
    expect(outText).toContain('Step 1');
  });

  it('shows no plan fallback', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/plan', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('no plan');
  });
});
