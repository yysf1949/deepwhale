import { describe, expect, it } from 'vitest';
import { DEFAULT_CHANNEL_CAPABILITIES } from '../../src/channel/capabilities.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('channel opt-in contract', () => {
  it('exposes a stable list of channel capabilities', () => {
    expect(DEFAULT_CHANNEL_CAPABILITIES.map((c) => c.id)).toEqual([
      'channel.telegram.sendMessage',
      'channel.telegram.start',
      'channel.discord.sendMessage',
      'channel.discord.start',
    ]);
  });

  it('does not expose any channel capability in the default tool registry', () => {
    const registry = createDefaultRegistry();
    const defaultNames = registry.list().map((t) => t.name);
    const channelIds = DEFAULT_CHANNEL_CAPABILITIES.map((c) => c.id);
    for (const channelId of channelIds) {
      expect(defaultNames).not.toContain(channelId);
    }
  });

  it('marks sendMessage capabilities as medium risk (explicit approval required)', () => {
    const senders = DEFAULT_CHANNEL_CAPABILITIES.filter((c) => c.id.includes('sendMessage'));
    for (const sender of senders) {
      expect(sender.riskLevel).toBe('medium');
    }
  });

  it('marks start capabilities as low risk (inbound only)', () => {
    const starters = DEFAULT_CHANNEL_CAPABILITIES.filter((c) => c.id.endsWith('.start'));
    for (const starter of starters) {
      expect(starter.riskLevel).toBe('low');
    }
  });
});
