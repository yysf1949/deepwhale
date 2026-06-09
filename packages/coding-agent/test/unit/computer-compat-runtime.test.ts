import { describe, expect, it } from 'vitest';
import { createComputerCompatRuntime } from '../../src/computer/compat-runtime.js';

describe('computer use compatibility runtime', () => {
  it('delegates actions to an external provider', async () => {
    const calls: string[] = [];
    const runtime = createComputerCompatRuntime({
      provider: {
        invoke: async (name) => {
          calls.push(name);
          return { status: 'ok' };
        },
      },
    });

    await runtime.invoke('computer.mouse_click', { x: 1, y: 2 });

    expect(calls).toEqual(['computer.mouse_click']);
  });

  it('does not export local vision or input primitives', async () => {
    const runtimeModule = await import('../../src/computer/compat-runtime.js');

    expect(runtimeModule).not.toHaveProperty('detectUiElements');
    expect(runtimeModule).not.toHaveProperty('screenCapture');
    expect(runtimeModule).not.toHaveProperty('mouseClick');
    expect(runtimeModule).not.toHaveProperty('keyboardType');
  });

  it('records every invocation and surfaces the call log', async () => {
    const runtime = createComputerCompatRuntime({
      provider: { invoke: async () => ({ status: 'ok' as const }) },
    });
    await runtime.invoke('computer.screenshot', {});
    await runtime.invoke('computer.type_text', { text: 'hi' });
    expect(runtime.listInvocations().map((i) => i.name)).toEqual(['computer.screenshot', 'computer.type_text']);
  });
});
