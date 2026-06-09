import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTaskGraphStore } from '../../src/taskgraph/taskgraph.js';

async function createTempDir(prefix = 'dw-taskgraph-'): Promise<string> {
  return mkdtemp(resolve(tmpdir(), prefix));
}

describe('persistent taskgraph', () => {
  it('recovers tasks across restart and schedules only satisfied dependencies', async () => {
    const root = await createTempDir();

    const writer = await createTaskGraphStore({ root });
    await writer.append({ id: 'a', goal: 'first', dependsOn: [], status: 'done', source: 'planner' });
    await writer.append({ id: 'b', goal: 'second', dependsOn: ['a'], status: 'pending', source: 'planner' });

    const reloaded = await createTaskGraphStore({ root });

    expect((await reloaded.readyTasks()).map((task) => task.id)).toEqual(['b']);
  });

  it('increments retry counters on failed updates', async () => {
    const root = await createTempDir();
    const store = await createTaskGraphStore({ root });
    await store.append({ id: 'x', goal: 'do x', dependsOn: [], status: 'running', source: 'auto' });
    await store.update('x', { status: 'failed' });
    await store.update('x', { status: 'running', retryCount: 1 });
    const all = await store.list();
    const x = all.find((n) => n.id === 'x');
    expect(x?.retryCount).toBe(1);
  });

  it('rejects duplicate task ids', async () => {
    const root = await createTempDir();
    const store = await createTaskGraphStore({ root });
    await store.append({ id: 'dup', goal: 'first', dependsOn: [], status: 'pending', source: 'auto' });
    await expect(
      store.append({ id: 'dup', goal: 'second', dependsOn: [], status: 'pending', source: 'auto' }),
    ).rejects.toThrow(/duplicate task id/);
  });
});
