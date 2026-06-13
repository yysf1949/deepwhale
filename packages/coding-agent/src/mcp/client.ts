import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type { McpServerManifest, McpToolManifest } from './runtime.js';

export interface McpStdioServerConfig {
  server: string;
  command: string;
  args?: ReadonlyArray<string>;
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version?: string };
  capabilities?: Record<string, unknown>;
}

export interface McpStdioClient {
  initializeResult: McpInitializeResult;
  listToolsManifest(): Promise<McpServerManifest>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  stop(): Promise<void>;
}

interface McpStdioClientState {
  child: ChildProcessWithoutNullStreams;
  readline: ReadlineInterface;
  nextId: number;
  pending: Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }
  >;
  closed: boolean;
  error: Error | null;
  stderrTail: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export async function connectMcpStdioServer(config: McpStdioServerConfig): Promise<McpStdioClient> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnOptions: SpawnOptionsWithoutStdio = {
    env: config.env !== undefined
      ? { ...process.env, ...stripUndefined(config.env) } as NodeJS.ProcessEnv
      : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  if (config.cwd !== undefined) {
    spawnOptions.cwd = config.cwd;
  }
  const child = spawn(
    config.command,
    [...(config.args ?? [])],
    spawnOptions,
  ) as ChildProcessWithoutNullStreams;

  const readline = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const state: McpStdioClientState = {
    child,
    readline,
    nextId: 1,
    pending: new Map(),
    closed: false,
    error: null,
    stderrTail: '',
  };

  readline.on('line', (line) => {
    if (!line.trim()) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      failAllPending(state, new McpTransportError('invalid-json', `server sent non-JSON line: ${line}`));
      return;
    }
    const id = message.id;
    if (typeof id !== 'number') return;
    const entry = state.pending.get(id);
    if (!entry) return;
    state.pending.delete(id);
    clearTimeout(entry.timer);
    if (message.error && typeof message.error === 'object') {
      const errObj = message.error as { message?: unknown };
      const messageText = typeof errObj.message === 'string' ? errObj.message : 'unknown error';
      entry.reject(new McpRpcError(messageText, message.error as Record<string, unknown>));
      return;
    }
    entry.resolve(message.result);
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    state.stderrTail = (state.stderrTail + text).slice(-2000);
  });

  child.on('error', (err) => {
    state.error = err;
    failAllPending(state, new McpTransportError('spawn-error', err.message));
  });

  child.on('close', (code, signal) => {
    state.closed = true;
    if (!state.error) {
      state.error = new McpTransportError(
        'closed',
        `server closed before responding (code=${code ?? 'null'}, signal=${signal ?? 'null'}): ${state.stderrTail.trim()}`,
      );
    }
    failAllPending(state, state.error);
  });

  const initializeResult = await request<McpInitializeResult>(state, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'deepwhale-mcp-client', version: '0.0.0' },
  }, timeoutMs);

  const serverName = config.server;
  const listToolsManifest = async (): Promise<McpServerManifest> => {
    const result = await request<{ tools: McpToolManifest[] }>(state, 'tools/list', {}, timeoutMs);
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return { server: serverName, tools };
  };

  const callTool = async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
    return request(state, 'tools/call', { name, arguments: args ?? {} }, timeoutMs);
  };

  const stop = async (): Promise<void> => {
    if (state.closed) return;
    state.closed = true;
    try {
      child.stdin.end();
    } catch {
      // ignore
    }
    try {
      readline.close();
    } catch {
      // ignore
    }
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await new Promise<void>((resolveStop) => {
      const onExit = (): void => {
        child.removeListener('exit', onExit);
        resolveStop();
      };
      child.once('exit', onExit);
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
        resolveStop();
      }, 500);
    });
  };

  return {
    initializeResult,
    listToolsManifest,
    callTool,
    stop,
  };
}

function request<T>(state: McpStdioClientState, method: string, params: unknown, timeoutMs: number): Promise<T> {
  if (state.error) {
    return Promise.reject(state.error);
  }
  if (state.closed) {
    return Promise.reject(new McpTransportError('closed', 'mcp server is already closed'));
  }
  const id = state.nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new McpTimeoutError(`mcp request '${method}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    state.pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
      timer,
    });
    try {
      state.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    } catch (err) {
      state.pending.delete(id);
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function failAllPending(state: McpStdioClientState, err: Error): void {
  for (const [, entry] of state.pending) {
    clearTimeout(entry.timer);
    entry.reject(err);
  }
  state.pending.clear();
}

function stripUndefined(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export class McpTransportError extends Error {
  readonly kind: 'spawn-error' | 'closed' | 'invalid-json';
  constructor(kind: 'spawn-error' | 'closed' | 'invalid-json', message: string) {
    super(message);
    this.name = 'McpTransportError';
    this.kind = kind;
  }
}

export class McpRpcError extends Error {
  readonly detail: Record<string, unknown>;
  constructor(message: string, detail: Record<string, unknown>) {
    super(message);
    this.name = 'McpRpcError';
    this.detail = detail;
  }
}

export class McpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpTimeoutError';
  }
}
