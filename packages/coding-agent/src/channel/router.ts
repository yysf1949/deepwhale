/**
 * ChannelRouter — multi-channel (telegram / discord / tui / cli) 1 source of truth (D-30.4.5, 2026-06-07).
 *
 * 拍板 (D-30.4): 1 source of truth router. 4 channel 都通过 ChannelMessage shape
 *   流入. handlers 链式执行, 取最后结果. handler 抛错不中断链路 (log + 继续).
 * - 0 改业务, 5 红线 0 触碰
 * - 跟 tui-ink 共享 session state (留 D-30.4.5+)
 */

export type ChannelKind = 'telegram' | 'discord' | 'tui' | 'cli';

export interface ChannelMessage {
  readonly channel: ChannelKind;
  readonly text: string;
  readonly userId?: string;
  readonly chatId?: string;
  readonly timestamp?: number;
}

export type ChannelHandler = (m: ChannelMessage) => Promise<string>;

export class ChannelRouter {
  private handlers: ChannelHandler[] = [];

  /** Register a handler. Returns the index for removal. */
  onMessage(h: ChannelHandler): number {
    this.handlers.push(h);
    return this.handlers.length - 1;
  }

  size(): number {
    return this.handlers.length;
  }

  /**
   * Dispatch a message through all handlers. Returns the last handler's reply.
   * A handler error is logged via console.warn and the chain continues.
   */
  async dispatch(msg: ChannelMessage): Promise<string> {
    let last = '';
    for (const h of this.handlers) {
      try {
        last = await h(msg);
      } catch (e) {
        // Plan: 错误吞掉不中断, 沿用 plan 拍板 (跟 telegram 内部错误处理 1:1).
        console.warn(
          `[channel-router] handler error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return last;
  }
}
