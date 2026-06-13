/**
 * D-30.3.4/D132: Cron daemon timer boundary.
 *
 * The daemon lists jobs on each tick and invokes an injected handler for enabled
 * jobs. AutomationRuntime supplies the D132 execution and run-record layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CronDaemon } from '../../src/util/cron-daemon.js';
import { CronStore } from '../../src/util/cron-store.js';

describe('CronDaemon (D-30.3.4)', () => {
  let dir: string;
  let store: CronStore;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = mkdtempSync(join(tmpdir(), 'dw-cron-daemon-'));
    store = new CronStore(dir);
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fireOnce calls onTick for enabled jobs, skips disabled', async () => {
    await store.add({ id: 'j1', schedule: '0 * * * *', prompt: 'run 1', enabled: true });
    await store.add({ id: 'j2', schedule: '0 * * * *', prompt: 'run 2', enabled: false });
    const onTick = vi.fn();
    const daemon = new CronDaemon(store, onTick);
    await daemon.fireOnce();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls[0]?.[0]?.id).toBe('j1');
  });

  it('start() with timer fires onTick after the interval', async () => {
    await store.add({ id: 'j1', schedule: '0 * * * *', prompt: 'r', enabled: true });
    const onTick = vi.fn();
    const daemon = new CronDaemon(store, onTick);
    daemon.start(1000);
    // fake-timer 推过 interval 边界, 让 setInterval 触发, 然后 drain in-flight
    // promise (store.list → onTick) 完成.
    await vi.advanceTimersByTimeAsync(1000);
    await daemon.drainInFlight();
    daemon.stop();
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('stop() halts further ticks', async () => {
    await store.add({ id: 'j1', schedule: '0 * * * *', prompt: 'r', enabled: true });
    const onTick = vi.fn();
    const daemon = new CronDaemon(store, onTick);
    daemon.start(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await daemon.drainInFlight();
    daemon.stop();
    const callsAtStop = onTick.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(onTick.mock.calls.length).toBe(callsAtStop);
  });

  it('start() with no enabled jobs does not call onTick', async () => {
    await store.add({ id: 'j1', schedule: '0 * * * *', prompt: 'r', enabled: false });
    const onTick = vi.fn();
    const daemon = new CronDaemon(store, onTick);
    await daemon.fireOnce();
    expect(onTick).not.toHaveBeenCalled();
  });

  it('fireOnce reads jobs from store (picks up additions)', async () => {
    const onTick = vi.fn();
    const daemon = new CronDaemon(store, onTick);
    await daemon.fireOnce();
    expect(onTick).toHaveBeenCalledTimes(0);
    await store.add({ id: 'late', schedule: '0 * * * *', prompt: 'late', enabled: true });
    await daemon.fireOnce();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls[0]?.[0]?.id).toBe('late');
  });

  it('onTick rejection is swallowed (does not break other jobs)', async () => {
    await store.add({ id: 'bad', schedule: '0 * * * *', prompt: 'bad', enabled: true });
    await store.add({ id: 'good', schedule: '0 * * * *', prompt: 'good', enabled: true });
    const onTick = vi.fn(async (job: { id: string }) => {
      if (job.id === 'bad') throw new Error('boom');
    });
    const daemon = new CronDaemon(store, onTick);
    await daemon.fireOnce();
    expect(onTick).toHaveBeenCalledTimes(2);
  });
});
