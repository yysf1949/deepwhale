/**
 * createReplConfirm factory unit tests — Sprint 1c-revive-3-D-15 (2026-06-05).
 *
 * 覆盖 (D-15 拍板):
 *   - 工厂返回函数 (ToolPolicy.confirm shape)
 *   - prompt 格式: "Allow <tool>? (<reason>) [y/N]: "
 *   - 输入识别: y/yes/Y/YES → true; n/no/N/NO/空/other → false; EOF/abort → null
 *   - prompt 不含原始 args / secret (红线)
 *
 * 拍板 (D-15 plan §Risk R-4): 单测用 PassThrough mock, 不依赖真 stdin. 端到端真
 * stdin prompt 留给 manual 测.
 */

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { createReplConfirm } from '../../src/repl/repl-confirm.js';

describe('repl/repl-confirm (D-15)', () => {
  function setup() {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (c: Buffer) => chunks.push(c));
    const confirm = createReplConfirm({ input, output });
    return {
      input,
      confirm,
      getOutput: () => Buffer.concat(chunks).toString(),
    };
  }

  it('factory returns a function (ToolPolicy.confirm shape)', () => {
    const { confirm } = setup();
    expect(typeof confirm).toBe('function');
  });

  it('prompt format: "Allow <tool_name>? (<reason>) [y/N]: "', async () => {
    const { input, confirm, getOutput } = setup();
    const p = confirm('Allow write_file? (writes to filesystem)');
    setImmediate(() => input.write('y\n'));
    await p;
    expect(getOutput()).toMatch(/Allow write_file\?\s*\(writes to filesystem\)\s*\[y\/N\]:\s*$/);
  });

  it('y → true', async () => {
    const { input, confirm } = setup();
    const p = confirm('x');
    setImmediate(() => input.write('y\n'));
    expect(await p).toBe(true);
  });

  it('yes → true', async () => {
    const { input, confirm } = setup();
    const p = confirm('x');
    setImmediate(() => input.write('yes\n'));
    expect(await p).toBe(true);
  });

  it('Y / YES (大小写) → true', async () => {
    const { input, confirm } = setup();
    const p1 = confirm('x');
    setImmediate(() => input.write('Y\n'));
    expect(await p1).toBe(true);

    const p2 = confirm('x');
    setImmediate(() => input.write('YES\n'));
    expect(await p2).toBe(true);
  });

  it('n / no / N / NO → false', async () => {
    for (const ans of ['n', 'no', 'N', 'NO']) {
      const { input, confirm } = setup();
      const p = confirm('x');
      setImmediate(() => input.write(`${ans}\n`));
      expect(await p).toBe(false);
    }
  });

  it('empty input → false (default N, fail-closed)', async () => {
    const { input, confirm } = setup();
    const p = confirm('x');
    setImmediate(() => input.write('\n'));
    expect(await p).toBe(false);
  });

  it('other input (e.g. "maybe") → false (不打扰, 当 N)', async () => {
    const { input, confirm } = setup();
    const p = confirm('x');
    setImmediate(() => input.write('maybe\n'));
    expect(await p).toBe(false);
  });

  it('EOF (input.end 无 input.write) → null (dismissed)', async () => {
    const { input, confirm } = setup();
    const p = confirm('x');
    setImmediate(() => input.end()); // 立刻 EOF
    expect(await p).toBe(null);
  });

  it('abort signal 触发 → null', async () => {
    const { confirm } = setup();
    const ac = new AbortController();
    const p = confirm('x', { signal: ac.signal });
    setImmediate(() => ac.abort());
    expect(await p).toBe(null);
  });

  it('prompt 不含原始 args / secret (红线)', async () => {
    const { input, confirm, getOutput } = setup();
    const p = confirm('Allow write_file? (writes to filesystem)');
    setImmediate(() => input.write('y\n'));
    await p;
    const out = getOutput();
    // prompt 字符串就只是 tool name + reason, 没有 args
    expect(out).not.toMatch(/path=/);
    expect(out).not.toMatch(/api[_-]?key/i);
    expect(out).not.toMatch(/sha256:/);
    // 也不暴露 argsDigest
    expect(out).not.toMatch(/digest/i);
  });
});
