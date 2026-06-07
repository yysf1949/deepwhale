/**
 * D-30.4.4: DiscordChannel.
 *
 * 拍板 (D-30.4): 走 Discord gateway (GET /gateway/bot → WS). 注入 fetcher +
 *   WS factory (单测 mock, 不真连). onMessage 调 → sendMessage via REST
 *   /channels/{id}/messages. 真实 discord.js 留 D-30.4.5+.
 * - 0 改业务, 5 红线 0 触碰
 */

import { describe, it, expect } from 'vitest';
import { DiscordChannel, type DiscordConfig, type DiscordFetcher, type DiscordWebSocketFactory, type DiscordSocket } from '../../src/channel/discord.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

class FakeSocket implements DiscordSocket {
  public listeners: Record<string, Array<(data: string) => void>> = {};
  public sent: string[] = [];
  public closed = false;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  /** Simulate a gateway event. */
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('DiscordChannel (D-30.4.4)', () => {
  it('sends a message via REST POST /channels/{id}/messages', async () => {
    const sent: Array<{ url: string; body: string; authHeader: string | null }> = [];
    const fetcher: DiscordFetcher = async (url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      sent.push({ url, body: String(init?.body ?? ''), authHeader: headers?.['Authorization'] ?? null });
      return jsonResponse({ id: 'm1' });
    };
    const ch = new DiscordChannel({ token: 'TKN', channelId: 'C1', fetcher }, async () => 'reply');
    await ch.sendMessage('hi');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain('/channels/C1/messages');
    expect(sent[0]!.authHeader).toBe('Bot TKN');
    expect(JSON.parse(sent[0]!.body)).toEqual({ content: 'hi' });
  });

  it('connects to gateway and dispatches MESSAGE_CREATE for the configured channel', async () => {
    const socket = new FakeSocket();
    const factory: DiscordWebSocketFactory = () => socket;
    const fetcher: DiscordFetcher = async (url) => {
      if (url.includes('/gateway/bot')) {
        return jsonResponse({ url: 'wss://gateway.discord.test' });
      }
      return jsonResponse({ id: 'ok' });
    };
    const replies: string[] = [];
    const ch = new DiscordChannel(
      { token: 'TKN', channelId: 'C1', fetcher, wsFactory: factory },
      async (text) => `echo:${text}`,
    );
    ch.sendMessage = async (text) => {
      replies.push(text);
    };
    await ch.start();
    // Simulate gateway hello
    socket.emit({ op: 10, d: { heartbeat_interval: 100 } });
    // Simulate a message in the configured channel
    socket.emit({ t: 'MESSAGE_CREATE', d: { channel_id: 'C1', content: 'ping' } });
    // Simulate a message in a different channel — should be ignored
    socket.emit({ t: 'MESSAGE_CREATE', d: { channel_id: 'OTHER', content: 'skip' } });
    // Give microtasks a chance
    await new Promise((r) => setTimeout(r, 10));
    expect(replies).toEqual(['echo:ping']);
  });

  it('stop() closes the websocket', async () => {
    const socket = new FakeSocket();
    const factory: DiscordWebSocketFactory = () => socket;
    const fetcher: DiscordFetcher = async () => jsonResponse({ url: 'wss://x' });
    const ch = new DiscordChannel({ token: 'TKN', channelId: 'C1', fetcher, wsFactory: factory }, async () => 'x');
    await ch.start();
    ch.stop();
    expect(socket.closed).toBe(true);
  });
});
