/**
 * Channel opt-in contract — v4.0 (D-33.6.5)
 *
 * Per master plan §Stage 6: "All channel capabilities are opt-in and absent
 * from the default profile." Channels live in `packages/coding-agent/src/channel/`
 * (separate from `tools/`) so the default `createDefaultRegistry()` already
 * excludes them. This module exposes the canonical list of channel capability
 * names so the contract can be asserted in a test and so a future
 * CapabilityRegistry wiring (Stage 2.3 in v1.5) can register them under the
 * `channel` and `all` profiles.
 */

export type ChannelKind = 'telegram' | 'discord';

export interface ChannelCapabilityDescriptor {
  readonly id: string;
  readonly kind: ChannelKind;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly description: string;
}

export const DEFAULT_CHANNEL_CAPABILITIES: ReadonlyArray<ChannelCapabilityDescriptor> = [
  {
    id: 'channel.telegram.sendMessage',
    kind: 'telegram',
    riskLevel: 'medium',
    description: 'Telegram sendMessage via the bot API; outbound actions require explicit approval.',
  },
  {
    id: 'channel.telegram.start',
    kind: 'telegram',
    riskLevel: 'low',
    description: 'Telegram long-polling start; inbound only.',
  },
  {
    id: 'channel.discord.sendMessage',
    kind: 'discord',
    riskLevel: 'medium',
    description: 'Discord sendMessage via REST; outbound actions require explicit approval.',
  },
  {
    id: 'channel.discord.start',
    kind: 'discord',
    riskLevel: 'low',
    description: 'Discord gateway start; inbound only.',
  },
];
