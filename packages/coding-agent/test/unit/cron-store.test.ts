/**
 * D-30.1δ.9: cron store — ~/.deepwhale/cron/jobs.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CronStore } from '../../src/util/cron-store.js';

describe('cron store (D-30.1δ.9)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-cron-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty list when no jobs.json', async () => {
    const store = new CronStore(dir);
    expect(await store.list()).toEqual([]);
  });

  it('adds and lists jobs', async () => {
    const store = new CronStore(dir);
    await store.add({ id: 'j1', schedule: '0 * * * *', prompt: 'hourly', enabled: true });
    await store.add({ id: 'j2', schedule: '0 0 * * *', prompt: 'daily', enabled: false });
    const jobs = await store.list();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.id).toBe('j1');
    expect(jobs[1]?.id).toBe('j2');
  });

  it('removes job by id', async () => {
    const store = new CronStore(dir);
    await store.add({ id: 'j1', schedule: '0 * * * *', prompt: 'a', enabled: true });
    await store.add({ id: 'j2', schedule: '0 0 * * *', prompt: 'b', enabled: true });
    await store.remove('j1');
    const jobs = await store.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('j2');
  });

  it('persists across instances', async () => {
    const s1 = new CronStore(dir);
    await s1.add({ id: 'p1', schedule: '* * * * *', prompt: 'tick', enabled: true });
    const s2 = new CronStore(dir);
    const jobs = await s2.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.prompt).toBe('tick');
  });
});
