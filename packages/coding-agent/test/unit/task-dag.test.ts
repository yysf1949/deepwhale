import { describe, expect, it } from 'vitest';
import { createTaskDag, markTaskDone, readyTasks } from '../../src/planner/task-dag.js';

describe('task dag', () => {
  it('moves tasks through pending ready running done states by dependency order', () => {
    const dag = createTaskDag([
      { id: 'a', goal: 'first', dependsOn: [] },
      { id: 'b', goal: 'second', dependsOn: ['a'] },
    ]);

    expect(readyTasks(dag).map((task) => task.id)).toEqual(['a']);
    const updated = markTaskDone(dag, 'a', { summary: 'ok' });
    expect(readyTasks(updated).map((task) => task.id)).toEqual(['b']);
  });

  it('rejects cycles', () => {
    expect(() =>
      createTaskDag([
        { id: 'a', goal: 'a', dependsOn: ['b'] },
        { id: 'b', goal: 'b', dependsOn: ['a'] },
      ]),
    ).toThrow(/cycle/);
  });
});
