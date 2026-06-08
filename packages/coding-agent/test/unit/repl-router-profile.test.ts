/**
 * D-31.3.7: REPL slash `/profile` 切换 profile.
 *
 * 拍板 (D-31.3): /profile 走 dispatchSlashBuiltin (D-29.1.3 工厂).
 * - 无 arg:      ctx.listProfiles 列所有
 * - 'current':   ctx.currentProfile 显当前
 * - '<name>':    ctx.switchProfile 切, 兜底 not-found
 *
 * 单测 mock SlashContext, 不走 startRepl e2e (跟 repl-slash-theme.test.ts 同形态).
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchSlashBuiltin } from '../../src/repl/repl-command-router.js';

describe('/profile slash (D-31.3.7)', () => {
  it('lists profiles when no arg', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const r = await dispatchSlashBuiltin('/profile', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      listProfiles: async () => ['work', 'home'],
    });
    expect(r.handled).toBe(true);
    const outText = out.mock.calls.map((c) => String(c[0])).join('');
    expect(outText).toContain('work');
    expect(outText).toContain('home');
  });

  it('shows current profile with /profile current', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const r = await dispatchSlashBuiltin('/profile current', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      listProfiles: async () => ['work'],
      currentProfile: async () => ({ name: 'work', config: { model: 'm-work' } }),
    });
    expect(r.handled).toBe(true);
    const outText = out.mock.calls.map((c) => String(c[0])).join('');
    expect(outText).toContain('work');
    expect(outText).toContain('m-work');
  });

  it('switches to named profile', async () => {
    const out = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: vi.fn(), isTTY: true } as unknown as NodeJS.WritableStream;
    const r = await dispatchSlashBuiltin('/profile home', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      listProfiles: async () => ['work', 'home'],
      switchProfile: async (name: string) => ({ model: `m-${name}` }),
    });
    expect(r.handled).toBe(true);
    const outText = out.mock.calls.map((c) => String(c[0])).join('');
    expect(outText).toContain('home');
  });

  it('rejects unknown profile', async () => {
    const out = vi.fn();
    const err = vi.fn();
    const outStream = { write: out, isTTY: true } as unknown as NodeJS.WritableStream;
    const errStream = { write: err, isTTY: true } as unknown as NodeJS.WritableStream;
    const r = await dispatchSlashBuiltin('/profile wat', {
      out: outStream,
      err: errStream,
      writer: null,
      verifyChecks: [],
      prompt: () => {},
      listProfiles: async () => ['work', 'home'],
      switchProfile: async () => { throw new Error('not-found: wat'); },
    });
    expect(r.handled).toBe(true);
    const errText = err.mock.calls.map((c) => String(c[0])).join('');
    expect(errText).toContain('not-found');
  });
});
