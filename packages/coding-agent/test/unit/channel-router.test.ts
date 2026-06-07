/**
 * D-30.4.5: ChannelRouter.
 *
 * 拍板 (D-30.4): 1 source of truth router, 4 channel (telegram / discord / tui
 *   / cli) 都通过 ChannelMessage shape 流入. handlers 链式执行, 取最后结果.
 * - 0 改业务, 5 红线 0 触碰
 * - 跟 tui-ink 共享 session state (留 D-30.4.5+)
 */

import { describe, it, expect } from 'vitest';
import { ChannelRouter, type ChannelMessage } from '../../src/channel/router.js';

describe('ChannelRouter (D-30.4.5)', () => {
  it('returns empty string when no handlers are registered', async () => {
    const router = new ChannelRouter();
    const out = await router.dispatch({ channel: 'telegram', text: 'hi' });
    expect(out).toBe('');
  });

  it('passes ChannelMessage to each registered handler in order', async () => {
    const router = new ChannelRouter();
    const seen: ChannelMessage[] = [];
    router.onMessage(async (m) => {
      seen.push(m);
      return 'a';
    });
    router.onMessage(async (m) => {
      seen.push(m);
      return 'b';
    });
    const out = await router.dispatch({ channel: 'discord', text: 'hello', userId: 'u1' });
    expect(out).toBe('b');
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ channel: 'discord', text: 'hello', userId: 'u1' });
    expect(seen[1]).toEqual({ channel: 'discord', text: 'hello', userId: 'u1' });
  });

  it('preserves the last handler return value', async () => {
    const router = new ChannelRouter();
    router.onMessage(async () => 'first');
    router.onMessage(async () => 'second');
    router.onMessage(async () => 'final');
    const out = await router.dispatch({ channel: 'tui', text: 'x' });
    expect(out).toBe('final');
  });

  it('does not abort on handler error (logs + continues)', async () => {
    const router = new ChannelRouter();
    router.onMessage(async () => {
      throw new Error('boom');
    });
    router.onMessage(async () => 'recovered');
    const out = await router.dispatch({ channel: 'telegram', text: 'x' });
    expect(out).toBe('recovered');
  });
});
