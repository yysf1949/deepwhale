/**
 * DiscordChannel — Discord gateway (WS) bridge (D-30.4.4, 2026-06-07).
 *
 * 拍板 (D-30.4): 走 Discord gateway v10 (GET /gateway/bot → WS wss://...?v=10&encoding=json).
 *   注入 fetcher + WS factory (单测 mock, 不真连). 收到 MESSAGE_CREATE 且
 *   channel_id === config.channelId → onMessage → sendMessage via REST
 *   /channels/{id}/messages. 真实 discord.js 留 D-30.4.5+.
 * - 0 改业务, 5 红线 0 触碰
 * - 跟 telegram 1:1 同形态 (fetcher / handler 注入, 不动 5 红线)
 */

export type DiscordFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Minimal WS interface — test-friendly, only what we use. */
export interface DiscordSocket {
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type DiscordWebSocketFactory = (url: string) => DiscordSocket;

export interface DiscordConfig {
  /** Bot token. */
  readonly token: string;
  /** Channel id to listen to. */
  readonly channelId: string;
  /** Optional fetcher override. */
  readonly fetcher?: DiscordFetcher;
  /** Optional WebSocket factory override (defaults to global WebSocket). */
  readonly wsFactory?: DiscordWebSocketFactory;
}

const defaultFetcher: DiscordFetcher = (url, init) => fetch(url, init);

const defaultWsFactory: DiscordWebSocketFactory = (url) => {
  // 1:1 跟 telegram polling 1:1 形态 — 注入 WS factory, 真实 discord.js
  // 留 D-30.4.5+. 这层只解 dispatch, 不管 heartbeat / shard / identify.
  return new (globalThis as { WebSocket: new (url: string) => DiscordSocket }).WebSocket(url);
};

export type DiscordMessageHandler = (text: string) => Promise<string>;

interface GatewayHelloPayload {
  url: string;
}

export class DiscordChannel {
  private ws: DiscordSocket | null = null;

  constructor(
    private readonly config: DiscordConfig,
    private readonly onMessage: DiscordMessageHandler,
  ) {}

  private get fetcher(): DiscordFetcher {
    return this.config.fetcher ?? defaultFetcher;
  }

  private get wsFactory(): DiscordWebSocketFactory {
    return this.config.wsFactory ?? defaultWsFactory;
  }

  /** Connect to gateway. Resolves once the WS is constructed (not on close). */
  async start(): Promise<void> {
    const res = await this.fetcher('https://discord.com/api/v10/gateway/bot', {
      headers: { Authorization: `Bot ${this.config.token}` },
    });
    const data = (await res.json()) as GatewayHelloPayload;
    const url = `${data.url}?v=10&encoding=json`;
    const ws = this.wsFactory(url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      void this.handleEvent(ev.data);
    };
  }

  stop(): void {
    this.ws?.close();
    this.ws = null;
  }

  private async handleEvent(raw: string): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof data !== 'object' || data === null) return;
    const obj = data as { t?: string; d?: { channel_id?: string; content?: string } };
    if (obj.t !== 'MESSAGE_CREATE') return;
    const d = obj.d;
    if (!d || d.channel_id !== this.config.channelId) return;
    const text = typeof d.content === 'string' ? d.content : '';
    if (text.length === 0) return;
    const reply = await this.onMessage(text);
    await this.sendMessage(reply);
  }

  async sendMessage(text: string): Promise<void> {
    const url = `https://discord.com/api/v10/channels/${this.config.channelId}/messages`;
    await this.fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
  }
}
