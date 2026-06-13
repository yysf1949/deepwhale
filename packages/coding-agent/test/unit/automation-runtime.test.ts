import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationRuntime } from '../../src/util/automation-runtime.js';
import { CronStore } from '../../src/util/cron-store.js';

function clockFrom(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[index++] ?? values[values.length - 1] ?? '2026-06-13T00:00:00.000Z');
}

describe('AutomationRuntime (D132)', () => {
  let dir: string;
  let store: CronStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-automation-runtime-'));
    store = new CronStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('executes enabled cron jobs through an injected runner and records success', async () => {
    await store.add({ id: 'j1', schedule: '* * * * *', prompt: 'summarize repo', enabled: true });
    await store.add({ id: 'j2', schedule: '* * * * *', prompt: 'disabled', enabled: false });
    const runner = vi.fn(async (job) => ({ output: `ran:${job.prompt}` }));
    const runtime = new AutomationRuntime({
      store,
      runner,
      clock: clockFrom(['2026-06-13T00:00:00.000Z', '2026-06-13T00:00:01.000Z']),
    });

    await runtime.fireOnce();

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0].id).toBe('j1');
    expect(await store.listRuns()).toEqual([
      {
        runId: 'j1:2026-06-13T00:00:00.000Z',
        jobId: 'j1',
        schedule: '* * * * *',
        prompt: 'summarize repo',
        status: 'success',
        startedAt: '2026-06-13T00:00:00.000Z',
        finishedAt: '2026-06-13T00:00:01.000Z',
        output: 'ran:summarize repo',
      },
    ]);
  });

  it('records failed jobs and continues to later enabled jobs', async () => {
    await store.add({ id: 'bad', schedule: '* * * * *', prompt: 'fail', enabled: true });
    await store.add({ id: 'good', schedule: '* * * * *', prompt: 'recover', enabled: true });
    const runner = vi.fn(async (job) => {
      if (job.id === 'bad') throw new Error('runner exploded');
      return { output: `ran:${job.prompt}` };
    });
    const runtime = new AutomationRuntime({
      store,
      runner,
      clock: clockFrom([
        '2026-06-13T00:00:00.000Z',
        '2026-06-13T00:00:01.000Z',
        '2026-06-13T00:00:02.000Z',
        '2026-06-13T00:00:03.000Z',
      ]),
    });

    await runtime.fireOnce();

    expect(runner).toHaveBeenCalledTimes(2);
    expect((await store.listRuns()).map((run) => `${run.jobId}:${run.status}:${run.error ?? run.output}`)).toEqual([
      'bad:failed:runner exploded',
      'good:success:ran:recover',
    ]);
  });
});
