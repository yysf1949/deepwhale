/**
 * Computer Use compatibility layer — v3.0 (D-33.5.4)
 *
 * Provider-delegation only. This module does NOT export any local vision,
 * UI detection, element localization, mouse, keyboard, or screen-capture
 * primitive. All "computer use" actions are forwarded to an injected
 * `ComputerProvider` and the runtime records the call.
 *
 * Per master plan §Stage 5 unlock: "Computer Use is implemented as
 * compatibility layer only. Do not self-implement OCR, UI detection,
 * element localization, mouse, keyboard, or screen capture primitives."
 */

export type ComputerActionStatus = 'ok' | 'error';

export interface ComputerActionResult {
  readonly status: ComputerActionStatus;
  readonly result?: unknown;
  readonly error?: string;
}

export interface ComputerProvider {
  invoke(name: string, args: Readonly<Record<string, unknown>>): Promise<ComputerActionResult>;
}

export interface ComputerCompatRuntime {
  invoke(name: string, args: Readonly<Record<string, unknown>>): Promise<ComputerActionResult>;
  listInvocations(): ReadonlyArray<{ readonly name: string; readonly args: Readonly<Record<string, unknown>> }>;
}

export interface CreateComputerCompatRuntimeOptions {
  readonly provider: ComputerProvider;
}

export function createComputerCompatRuntime(
  opts: CreateComputerCompatRuntimeOptions,
): ComputerCompatRuntime {
  const invocations: Array<{ name: string; args: Readonly<Record<string, unknown>> }> = [];
  return {
    async invoke(name, args) {
      invocations.push({ name, args });
      return opts.provider.invoke(name, args);
    },
    listInvocations() {
      return invocations.slice();
    },
  };
}
