/**
 * TelegramChannel — Telegram Bot API + long polling bridge (D-30.4.3, 2026-06-07).
 *
 * 拍板 (D-30.4): 走 Telegram Bot API (https://api.telegram.org/bot<token>/...).
 *   注入 fetcher (单测 mock), 注入 onMessage. start() 拉 getUpdates(offset),
 *   每条 text message 调 onMessage → sendMessage 回包. stop() 翻 polling 标志.
 * - 0 改业务, 5 红线 0 触碰
 * - 跟 tui-ink / 后续 4 channel 共享 ChannelMessage shape (在 router.ts 定义)
 */

export type TelegramFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface TelegramConfig {
  /** BotFather token */
  readonly token: string;
  /** Optional fetcher override (defaults to global fetch). 1:1 跟其他 channel. */
  readonly fetcher?: TelegramFetcher;
}

const defaultFetcher: TelegramFetcher = (url, init) => fetch(url, init);

export type TelegramMessageHandler = (text: string) => Promise<string>;

export class TelegramChannel {
  private polling = false;

  constructor(
    private readonly config: TelegramConfig,
    private readonly onMessage: TelegramMessageHandler,
  ) {}

  private get fetcher(): TelegramFetcher {
    return this.config.fetcher ?? defaultFetcher;
  }

  /** Long-poll loop. Resolves when stop() is called. */
  async start(): Promise<void> {
    this.polling = true;
    let offset = 0;
    while (this.polling) {
      try {
        const url = `https://api.telegram.org/bot${this.config.token}/getUpdates?offset=${offset}&timeout=30`;
        const res = await this.fetcher(url);
        const data = (await res.json()) as {
          result: Array<{ update_id: number; message?: { chat: { id: number }; text?: string } }>;
        };
        const updates = Array.isArray(data.result) ? data.result : [];
        for (const update of updates) {
          if (!this.polling) break;
          offset = update.update_id + 1;
          const text = update.message?.text;
          if (typeof text !== 'string' || text.length === 0) continue;
          const chatId = update.message!.chat.id;
          const reply = await this.onMessage(text);
          await this.sendMessage(chatId, reply);
        }
      } catch {
        // network blip / parse error → log + retry (plan: 错误吞掉不中断)
      }
      // Yield to event loop so stop() (called via setTimeout) can take effect.
      if (this.polling) await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  stop(): void {
    this.polling = false;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.token}/sendMessage`;
    await this.fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}
