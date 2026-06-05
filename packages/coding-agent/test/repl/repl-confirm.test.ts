/**
 * createReplConfirm factory unit tests — Sprint 1c-revive-3-D-19 (2026-06-05).
 *
 * 覆盖 (D-19 拍板, 跟 D-15 对齐 + 反映新 API):
 *   - factory 返 controller (含 confirm/offerLine/hasPending/dismiss 4 字段) — D-19
 *   - prompt 格式: "Allow <tool>? (<reason>) [y/N]: "
 *   - 输入识别: y/yes/Y/YES → true; n/no/N/NO/空/other → false; abort → null
 *   - offerLine 期间: 有 pending 时 offerLine 消费 line; 无 pending 时返 false (caller 走 chat)
 *   - hasPending 在 confirm 期间 true, settle 后 false
 *   - dismiss() 强制 resolve null
 *   - prompt 不含原始 args / secret (红线)
 *
 * 拍板 (D-19): 单测用 mock Writable, 不依赖真 stdin. 端到端真 stdin prompt 留给 manual 测
 * + repl-shared-stdin 集成测.
 *
 * 拍板 (D-19): D-15 的 "EOF (input.end 无 input.write) → null" 测删除 — D-19 controller
 * 不再自创 readline, EOF 是 readline 的语义, D-19 不适用. 实际 REPL 端 EOF 由主 rl.on('close')
 * 走 finish(0) 路径, 不在 confirm 范围.
 */

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { createReplConfirm } from '../../src/repl/repl-confirm.js';

describe('repl/repl-confirm (D-19)', () => {
  function setup() {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (c: Buffer) => chunks.push(c));
    const controller = createReplConfirm({ output });
    return {
      controller,
      getOutput: () => Buffer.concat(chunks).toString(),
    };
  }

  it('factory returns a controller with confirm/offerLine/hasPending/dismiss', () => {
    const { controller } = setup();
    expect(typeof controller.confirm).toBe('function');
    expect(typeof controller.offerLine).toBe('function');
    expect(typeof controller.hasPending).toBe('function');
    expect(typeof controller.dismiss).toBe('function');
  });

  it('prompt format: "Allow <tool_name>? (<reason>) [y/N]: "', async () => {
    const { controller, getOutput } = setup();
    const p = controller.confirm('Allow write_file? (writes to filesystem)');
    setImmediate(() => controller.offerLine('y'));
    await p;
    expect(getOutput()).toMatch(/Allow write_file\?\s*\(writes to filesystem\)\s*\[y\/N\]:\s*$/);
  });

  it('y → true', async () => {
    const { controller } = setup();
    const p = controller.confirm('x');
    setImmediate(() => controller.offerLine('y'));
    expect(await p).toBe(true);
  });

  it('yes → true', async () => {
    const { controller } = setup();
    const p = controller.confirm('x');
    setImmediate(() => controller.offerLine('yes'));
    expect(await p).toBe(true);
  });

  it('Y / YES (大小写) → true', async () => {
    const { controller } = setup();
    const p1 = controller.confirm('x');
    setImmediate(() => controller.offerLine('Y'));
    expect(await p1).toBe(true);

    const p2 = controller.confirm('x');
    setImmediate(() => controller.offerLine('YES'));
    expect(await p2).toBe(true);
  });

  it('n / no / N / NO → false', async () => {
    for (const ans of ['n', 'no', 'N', 'NO']) {
      const { controller } = setup();
      const p = controller.confirm('x');
      setImmediate(() => controller.offerLine(ans));
      expect(await p).toBe(false);
    }
  });

  it('empty input → false (default N, fail-closed)', async () => {
    const { controller } = setup();
    const p = controller.confirm('x');
    setImmediate(() => controller.offerLine(''));
    expect(await p).toBe(false);
  });

  it('other input (e.g. "maybe") → false (不打扰, 当 N)', async () => {
    const { controller } = setup();
    const p = controller.confirm('x');
    setImmediate(() => controller.offerLine('maybe'));
    expect(await p).toBe(false);
  });

  it('abort signal 触发 → null', async () => {
    const { controller } = setup();
    const ac = new AbortController();
    const p = controller.confirm('x', { signal: ac.signal });
    setImmediate(() => ac.abort());
    expect(await p).toBe(null);
  });

  it('already-aborted signal 立即 → null', async () => {
    const { controller } = setup();
    const ac = new AbortController();
    ac.abort();
    expect(await controller.confirm('x', { signal: ac.signal })).toBe(null);
  });

  it('dismiss() 强制 resolve null (caller 进程退出 / Ctrl+C / cleanup)', async () => {
    const { controller } = setup();
    const p = controller.confirm('x');
    setImmediate(() => controller.dismiss());
    expect(await p).toBe(null);
  });

  it('hasPending: confirm 期间 true, settle 后 false', async () => {
    const { controller } = setup();
    expect(controller.hasPending()).toBe(false);
    const p = controller.confirm('x');
    expect(controller.hasPending()).toBe(true);
    setImmediate(() => controller.offerLine('y'));
    await p;
    expect(controller.hasPending()).toBe(false);
  });

  it('offerLine 在无 pending 时返 false (caller 走 chat, 不入 confirm)', () => {
    const { controller } = setup();
    expect(controller.offerLine('y')).toBe(false);
    expect(controller.offerLine('hello')).toBe(false);
  });

  it('prompt 不含原始 args / secret (红线)', async () => {
    const { controller, getOutput } = setup();
    const p = controller.confirm('Allow write_file? (writes to filesystem)');
    setImmediate(() => controller.offerLine('y'));
    await p;
    const out = getOutput();
    expect(out).not.toMatch(/password|secret|token|api[_-]?key/i);
  });

  it('重复 confirm 在前一个未 settle 时返 rejected promise (caller bug 防御)', async () => {
    const { controller } = setup();
    const p1 = controller.confirm('x');
    const p2 = controller.confirm('y');
    await expect(p2).rejects.toThrow(/confirmation is in flight/);
    setImmediate(() => controller.offerLine('y'));
    await p1;
  });
});
