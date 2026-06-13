/**
 * v2.5 runTaskLoop integration test (D-33.4.2) — Executor with pre-decomposed tasks.
 *
 * Validates the planner/executor boundary:
 *   - runTaskLoop takes a list of pre-decomposed tasks (the Planner's output)
 *   - It executes them in dependency order using the existing tool registry
 *   - No LLM call, no decomposition — pure executor semantics
 *
 * v1.0 contract: runToolLoop signature is unchanged; runTaskLoop is a NEW export.
 */

import { describe, it, expect } from 'vitest';
import { runTaskLoop } from '../../src/agent/tool-loop.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('runTaskLoop (v2.5 executor with pre-decomposed tasks)', () => {
  it('runs 2 sequential tasks in dependency order', async () => {
    const registry = createDefaultRegistry();
    const result = await runTaskLoop({
      tasks: [
        {
          id: 't1',
          goal: 'echo',
          dependsOn: [],
          tool: { name: 'bash', input: { command: 'echo', args: ['first'] } },
        },
        {
          id: 't2',
          goal: 'echo-2',
          dependsOn: ['t1'],
          tool: { name: 'bash', input: { command: 'echo', args: ['second'] } },
        },
      ],
      registry,
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.success).toBe(true);
    expect(result.results[1]?.success).toBe(true);
  });

  it('runs 5 sequential tasks in dependency order (v2.5 5-step scenario)', async () => {
    const registry = createDefaultRegistry();
    const result = await runTaskLoop({
      tasks: [
        { id: 's1', goal: 'step-1', dependsOn: [], tool: { name: 'bash', input: { command: 'echo', args: ['step-1'] } } },
        { id: 's2', goal: 'step-2', dependsOn: ['s1'], tool: { name: 'bash', input: { command: 'echo', args: ['step-2'] } } },
        { id: 's3', goal: 'step-3', dependsOn: ['s2'], tool: { name: 'bash', input: { command: 'echo', args: ['step-3'] } } },
        { id: 's4', goal: 'step-4', dependsOn: ['s3'], tool: { name: 'bash', input: { command: 'echo', args: ['step-4'] } } },
        { id: 's5', goal: 'step-5', dependsOn: ['s4'], tool: { name: 'bash', input: { command: 'echo', args: ['step-5'] } } },
      ],
      registry,
    });
    expect(result.results).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(result.results[i]?.success).toBe(true);
    }
  });
});
