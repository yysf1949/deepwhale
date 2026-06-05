/**
 * Sprint 1c-revive-2-D-11+4 review P2 修复 (2026-06-05).
 *
 * 覆盖 1 个 reviewer finding:
 *   - P2: verify-runner SIGTERM grace 实际发 SIGKILL
 *     之前用 `child.killed` (Node 标记"信号已发", 跟"进程已退出"语义不同)
 *     判断 grace, child 忽略 SIGTERM 时 1s 后跳过 SIGKILL, 子进程卡到 timeout.
 *     修法: 闭包变量 `childClosed` + `child.on('close', ...)` 设 true.
 *
 * Mock 思路: 替换 node:child_process.spawn, 返一个 EventEmitter 模拟 child.
 * 关键差异: mock child.kill 不立即触发 close (跟 docker-runner.test.ts 不同,
 * 这里需要验证"kill 后 close 延迟" 行为). mock 控制 kill 跟 close 时机, 精确
 * 验证 grace timer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import { runVerify, type VerifyCheck } from '../../../src/verify/verify-runner.js';

// ─── Mock child_process.spawn ────────────────────────────────────────────────

type MockChild = EventEmitter & {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  killed: boolean;
  /** 收到 kill 调用的信号列表. */
  killSignals: Array<string | undefined>;
  kill: ReturnType<typeof vi.fn>;
  /** mock 控制器: 是否忽略 SIGTERM (不立即 close). 验证 grace 时用. */
  ignoreSigterm: boolean;
};

const { mockChildren, spawnMock } = vi.hoisted(() => {
  const children: MockChild[] = [];
  const mock = vi.fn((..._args: unknown[]) => {
    const child: MockChild = new EventEmitter() as MockChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.killSignals = [];
    child.ignoreSigterm = false;
    child.kill = vi.fn((signal?: string) => {
      child.killed = true;
      child.killSignals.push(signal);
      // ignoreSigterm=true 模拟 child 阻塞 IO, 不响应 SIGTERM, 不 close
      if (signal === 'SIGTERM' && child.ignoreSigterm) {
        return true;
      }
      // 其他信号 (含 SIGKILL) 立即触发 close
      setImmediate(() => child.emit('close', null, signal ?? null));
      return true;
    });
    children.push(child);
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  return { mockChildren: children, spawnMock: mock };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    spawn: spawnMock,
  };
});

beforeEach(() => {
  mockChildren.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── 测试主体 ──────────────────────────────────────────────────────────────

describe('D-11+4 review P2: verify-runner SIGTERM grace 实际发 SIGKILL', () => {
  it('mock child 忽略 SIGTERM, 1s grace 后 child 收到 SIGKILL', async () => {
    // 这是 reviewer 拍板的核心断言: 旧实现用 child.killed 判断, 1s 后跳过 SIGKILL.
    // 新实现用 childClosed, child 不响应 SIGTERM 时 1s 后**仍**发 SIGKILL.
    //
    // 用 vi.useFakeTimers 控制时间: 测里发生:
    //   1. spawn mock child
    //   2. signal abort → onAbort → child.kill('SIGTERM')  (mock 不 close)
    //   3. advance 1000ms → sigkillTimer 触发 → child.kill('SIGKILL')
    //   4. 验证 child.killSignals === ['SIGTERM', 'SIGKILL']
    //
    // 测**只**验证 grace 行为本身, 不验证后续 status (后续 status 走真 close 路径
    // 属于 D-11-4 P2 已覆盖的范畴). 防止 fake/real timer 切换 race.

    vi.useFakeTimers();
    const check: VerifyCheck = {
      name: 'slow',
      command: 'mock-slow',
      args: ['node', 'fake-slow.js'],
      timeoutMs: 5000,
    };

    const ac = new AbortController();
    // 不 await runVerify — 我们只关心 grace 行为, 后续 close → aborted 走真事件链
    // 不在本 P2 测范围.
    void runVerify({
      cwd: '/tmp',
      checks: [check],
      signal: ac.signal,
      continueOnError: true,
    });

    // 让 spawn handler 注册 + mock child 创建
    await vi.advanceTimersByTimeAsync(0);

    const child = mockChildren[0]!;
    child.ignoreSigterm = true; // 关键: 模拟 child 不响应 SIGTERM

    // 触发 abort
    ac.abort();
    await vi.advanceTimersByTimeAsync(0);

    // SIGTERM 已发
    expect(child.killSignals).toEqual(['SIGTERM']);

    // 提前 1s 验证 SIGKILL **未**发 (grace 还没到)
    await vi.advanceTimersByTimeAsync(500);
    expect(child.killSignals).toEqual(['SIGTERM']);

    // 1s grace 到了, sigkillTimer 触发
    await vi.advanceTimersByTimeAsync(500);

    // **关键断言**: child 收到了 SIGKILL (旧实现会跳过)
    expect(child.killSignals).toContain('SIGKILL');
    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('mock child 响应 SIGTERM, 1s 内 close → grace timer 看到 childClosed=true 不发 SIGKILL', async () => {
    // 对照组: child 正常响应 SIGTERM → close 触发 childClosed=true → sigkillTimer
    // 触发时判 !childClosed = false → 跳过 SIGKILL (避免错杀已退出的进程).
    //
    // 同样只验证 grace 行为本身, 不验证后续 status.

    vi.useFakeTimers();
    const check: VerifyCheck = {
      name: 'responsive',
      command: 'mock-resp',
      args: ['node', 'fake-resp.js'],
      timeoutMs: 5000,
    };

    const ac = new AbortController();
    void runVerify({
      cwd: '/tmp',
      checks: [check],
      signal: ac.signal,
      continueOnError: true,
    });

    await vi.advanceTimersByTimeAsync(0);

    const child = mockChildren[0]!;
    child.ignoreSigterm = false; // 默认: 收到 SIGTERM 立即 close (mock 内 setImmediate emit)

    ac.abort();
    await vi.advanceTimersByTimeAsync(0);

    // 1s grace 后: childClosed=true (mock 已在 setImmediate emit close, 走 close handler),
    // sigkillTimer 跳过 SIGKILL
    await vi.advanceTimersByTimeAsync(1000);

    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(child.killSignals).not.toContain('SIGKILL');
  });
});
