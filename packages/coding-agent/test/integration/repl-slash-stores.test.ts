/**
 * D-30.1δ.11-δ.16: REPL 6 advanced slash 接 store 回调 验证.
 *
 * 拍板 (D-30.1δ): 把 d51b12e 6 case 拍板 (listCronJobs / searchSessions /
 * loadSessionById / getPlan) 重命名 + 改 shape 为更 clean 的 listCron /
 * listSessions / loadSession (Promise<void>) / enterPlanMode (void),
 * 让 stores 真注入 (CronStore.list / SessionIndex.list / SessionIndex.search /
 * MemoryStore / SkillStore.list).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('repl advanced slash (with stores)', () => {
  it('/memory appends to store', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    let appended = '';
    const result = await dispatchSlashBuiltin('/memory remember this', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      appendMemory: async (text: string) => { appended = text; },
      getMemory: async () => '',
    });
    expect(result.handled).toBe(true);
    expect(appended).toBe('remember this');
  });

  it('/skills lists skills', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/skills', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listSkills: async () => ['coding-agent', 'project-planner'],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('coding-agent');
    expect(outText).toContain('project-planner');
    expect(outText).toContain('2 skills');
  });

  it('/cron lists jobs', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/cron', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listCron: async () => [{ id: 'j1', schedule: '0 9 * * *', prompt: 'morning', enabled: true }],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('j1');
    expect(outText).toContain('0 9 * * *');
  });

  it('/sessions lists sessions', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const result = await dispatchSlashBuiltin('/sessions', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      listSessions: async () => [{ id: 's1', path: '/tmp/s1.jsonl', messageCount: 5, firstUser: 'hi', createdAt: 1000 }],
    });
    expect(result.handled).toBe(true);
    const outText = out.mock.calls.map((c) => c[0]).join('');
    expect(outText).toContain('s1');
    expect(outText).toContain('hi');
  });

  it('/load <id> loads session', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    let loadedId = '';
    const result = await dispatchSlashBuiltin('/load s1', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      loadSession: async (id: string) => { loadedId = id; },
    });
    expect(result.handled).toBe(true);
    expect(loadedId).toBe('s1');
  });

  it('/plan enters plan mode', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    let planEntered = false;
    const result = await dispatchSlashBuiltin('/plan', {
      out: outStream, err: outStream, writer: null, verifyChecks: [], prompt: () => {},
      enterPlanMode: () => { planEntered = true; },
    });
    expect(result.handled).toBe(true);
    expect(planEntered).toBe(true);
  });
});
