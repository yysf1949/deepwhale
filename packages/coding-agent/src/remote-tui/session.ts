export const REMOTE_TUI_PROTOCOL_VERSION = 'remote-tui/v1' as const;

export type RemoteTuiCloseReason = string;
export type RemoteTuiErrorCode = 'unauthorized';

export interface RemoteTuiTransport {
  send(frame: RemoteTuiServerFrame): void | Promise<void>;
  close(): void | Promise<void>;
}

export type RemoteTuiClientFrame =
  | { type: 'hello'; token: string; clientId: string }
  | { type: 'input'; text: string }
  | { type: 'resize'; columns: number; rows: number }
  | { type: 'disconnect'; reason?: RemoteTuiCloseReason };

export type RemoteTuiServerFrame =
  | {
      seq: number;
      type: 'welcome';
      sessionId: string;
      protocolVersion: typeof REMOTE_TUI_PROTOCOL_VERSION;
    }
  | { seq: number; type: 'output'; text: string }
  | { seq: number; type: 'error'; code: RemoteTuiErrorCode; message: string }
  | { seq: number; type: 'closed'; reason: RemoteTuiCloseReason };

type WithoutSeq<T extends { seq: number }> = T extends unknown ? Omit<T, 'seq'> : never;
type RemoteTuiServerFramePayload = WithoutSeq<RemoteTuiServerFrame>;

export interface RemoteTuiInputEvent {
  text: string;
  clientId: string;
}

export interface RemoteTuiResizeEvent {
  columns: number;
  rows: number;
  clientId: string;
}

export interface RemoteTuiSessionOptions {
  sessionId: string;
  authToken: string;
  transport: RemoteTuiTransport;
  onInput?: (event: RemoteTuiInputEvent) => void;
  onResize?: (event: RemoteTuiResizeEvent) => void;
}

export class RemoteTuiSession {
  private seq = 0;
  private authenticated = false;
  private clientId: string | null = null;
  private closed = false;

  constructor(private readonly options: RemoteTuiSessionOptions) {}

  receive(frame: RemoteTuiClientFrame): void {
    if (this.closed) return;

    if (frame.type === 'hello') {
      this.handleHello(frame);
      return;
    }

    if (!this.authenticated || this.clientId === null) {
      this.rejectUnauthorized();
      return;
    }

    switch (frame.type) {
      case 'input':
        this.options.onInput?.({ text: frame.text, clientId: this.clientId });
        return;
      case 'resize':
        this.options.onResize?.({
          columns: frame.columns,
          rows: frame.rows,
          clientId: this.clientId,
        });
        return;
      case 'disconnect':
        this.close(frame.reason ?? 'client-disconnect');
        return;
    }
  }

  publishOutput(text: string): void {
    if (this.closed || !this.authenticated) return;
    this.send({ type: 'output', text });
  }

  close(reason: RemoteTuiCloseReason): void {
    if (this.closed) return;
    this.closed = true;
    this.send({ type: 'closed', reason });
    void this.options.transport.close();
  }

  private handleHello(frame: Extract<RemoteTuiClientFrame, { type: 'hello' }>): void {
    if (frame.token !== this.options.authToken) {
      this.rejectUnauthorized();
      return;
    }
    this.authenticated = true;
    this.clientId = frame.clientId;
    this.send({
      type: 'welcome',
      sessionId: this.options.sessionId,
      protocolVersion: REMOTE_TUI_PROTOCOL_VERSION,
    });
  }

  private rejectUnauthorized(): void {
    if (this.closed) return;
    this.send({
      type: 'error',
      code: 'unauthorized',
      message: 'Remote TUI authentication failed',
    });
    this.close('unauthorized');
  }

  private send(frame: RemoteTuiServerFramePayload): void {
    this.seq += 1;
    void this.options.transport.send({ seq: this.seq, ...frame } as RemoteTuiServerFrame);
  }
}
