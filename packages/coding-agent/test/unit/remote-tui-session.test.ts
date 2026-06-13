import { describe, expect, it, vi } from 'vitest';
import {
  RemoteTuiSession,
  type RemoteTuiServerFrame,
  type RemoteTuiTransport,
} from '../../src/remote-tui/session.js';

class RecordingTransport implements RemoteTuiTransport {
  readonly frames: RemoteTuiServerFrame[] = [];
  closed = false;

  send(frame: RemoteTuiServerFrame): void {
    this.frames.push(frame);
  }

  close(): void {
    this.closed = true;
  }
}

describe('RemoteTuiSession (D133)', () => {
  it('authenticates a remote client and forwards input/resize to local handlers', () => {
    const transport = new RecordingTransport();
    const onInput = vi.fn();
    const onResize = vi.fn();
    const session = new RemoteTuiSession({
      sessionId: 'session-1',
      authToken: 'token-1',
      transport,
      onInput,
      onResize,
    });

    session.receive({ type: 'hello', token: 'token-1', clientId: 'client-a' });
    session.receive({ type: 'input', text: 'hello from remote' });
    session.receive({ type: 'resize', columns: 120, rows: 40 });
    session.publishOutput('local output');

    expect(onInput).toHaveBeenCalledWith({ text: 'hello from remote', clientId: 'client-a' });
    expect(onResize).toHaveBeenCalledWith({ columns: 120, rows: 40, clientId: 'client-a' });
    expect(transport.frames).toEqual([
      { seq: 1, type: 'welcome', sessionId: 'session-1', protocolVersion: 'remote-tui/v1' },
      { seq: 2, type: 'output', text: 'local output' },
    ]);
    expect(transport.closed).toBe(false);
  });

  it('rejects unauthorized clients before forwarding local input', () => {
    const transport = new RecordingTransport();
    const onInput = vi.fn();
    const session = new RemoteTuiSession({
      sessionId: 'session-1',
      authToken: 'token-1',
      transport,
      onInput,
    });

    session.receive({ type: 'hello', token: 'wrong', clientId: 'client-a' });
    session.receive({ type: 'input', text: 'should not pass' });

    expect(onInput).not.toHaveBeenCalled();
    expect(transport.frames).toEqual([
      { seq: 1, type: 'error', code: 'unauthorized', message: 'Remote TUI authentication failed' },
      { seq: 2, type: 'closed', reason: 'unauthorized' },
    ]);
    expect(transport.closed).toBe(true);
  });

  it('sends close frames exactly once', () => {
    const transport = new RecordingTransport();
    const session = new RemoteTuiSession({
      sessionId: 'session-1',
      authToken: 'token-1',
      transport,
    });

    session.receive({ type: 'hello', token: 'token-1', clientId: 'client-a' });
    session.close('server-shutdown');
    session.close('server-shutdown-again');

    expect(transport.frames.map((frame) => frame.type)).toEqual(['welcome', 'closed']);
    expect(transport.frames.at(-1)).toEqual({ seq: 2, type: 'closed', reason: 'server-shutdown' });
    expect(transport.closed).toBe(true);
  });
});