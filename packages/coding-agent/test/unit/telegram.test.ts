/**
 * D-30.4.3: TelegramChannel.
 *
 * 拍板 (D-30.4): 走 Telegram Bot API + fetch + long polling. 注入 fetcher
 *   (单测 mock), 注入 onMessage. start() 拉 getUpdates(offset), 每条 text
 *   message 调 onMessage, 回包 sendMessage. stop() 翻 polling 标志.
 * - 0 改业务, 5 红线 0 触碰
 * - 跟 tui-ink / 后续 4 channel 共享 ChannelMessage shape (在 router.ts 定义)
 */

import { describe, it, expect } from 'vitest';
import { TelegramChannel, type TelegramConfig, type TelegramFetcher } from '../../src/channel/telegram.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TelegramChannel (D-30.4.3)', () => {
  it('sends a message via sendMessage', async () => {
    const sent: Array<{ url: string; body: string }> = [];
    const fetcher: TelegramFetcher = async (url, init) => {
      sent.push({ url, body: String(init?.body ?? '') });
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    };
    const ch = new TelegramChannel({ token: 'TKN', fetcher }, async () => 'reply');
    await ch.sendMessage(42, 'hello');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain('botTKN/sendMessage');
    expect(JSON.parse(sent[0]!.body)).toEqual({ chat_id: 42, text: 'hello' });
  });

  it('polls getUpdates, dispatches text messages, and replies', async () => {
    // Sequence:
    //  - getUpdates #1: 2 messages → onMessage("hi") + onMessage("next")
    //  - getUpdates #2: empty → stop()
    const replies: Array<{ chatId: number; reply: string }> = [];
    let poll = 0;
    const fetcher: TelegramFetcher = async (url) => {
      poll++;
      if (poll === 1) {
        return jsonResponse({
          ok: true,
          result: [
            { update_id: 100, message: { chat: { id: 1 }, text: 'hi' } },
            { update_id: 101, message: { chat: { id: 2 }, text: 'next' } },
          ],
        });
      }
      // stop after 2nd poll so test exits
      setTimeout(() => ch.stop(), 0);
      return jsonResponse({ ok: true, result: [] });
    };
    const onMessage = async (text: string): Promise<string> => `echo:${text}`;
    const ch = new TelegramChannel({ token: 'TKN', fetcher }, onMessage);
    ch.sendMessage = async (chatId, reply) => {
      replies.push({ chatId, reply });
    };
    await ch.start();
    expect(replies).toEqual([
      { chatId: 1, reply: 'echo:hi' },
      { chatId: 2, reply: 'echo:next' },
    ]);
  });

  it('skips updates without text', async () => {
    const replies: string[] = [];
    let poll = 0;
    const fetcher: TelegramFetcher = async () => {
      poll++;
      if (poll === 1) {
        return jsonResponse({
          ok: true,
          result: [
            { update_id: 200, message: { chat: { id: 1 } } }, // no text
          ],
        });
      }
      setTimeout(() => ch.stop(), 0);
      return jsonResponse({ ok: true, result: [] });
    };
    const ch = new TelegramChannel({ token: 'TKN', fetcher }, async () => 'should-not-fire');
    ch.sendMessage = async (_chatId, reply) => {
      replies.push(reply);
    };
    await ch.start();
    expect(replies).toEqual([]);
  });

  it('survives polling errors and retries', async () => {
    let poll = 0;
    const fetcher: TelegramFetcher = async () => {
      poll++;
      if (poll === 1) throw new Error('network blip');
      if (poll === 2) {
        setTimeout(() => ch.stop(), 0);
        return jsonResponse({ ok: true, result: [] });
      }
      setTimeout(() => ch.stop(), 0);
      return jsonResponse({ ok: true, result: [] });
    };
    const ch = new TelegramChannel({ token: 'TKN', fetcher }, async () => 'x');
    await ch.start();
    expect(poll).toBeGreaterThanOrEqual(2);
  });

  it('uses config without fetcher (defaults to global fetch)', () => {
    const ch = new TelegramChannel({ token: 'TKN' }, async () => 'x');
    expect(ch).toBeInstanceOf(TelegramChannel);
  });
});
