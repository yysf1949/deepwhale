/**
 * Channel bridges — Telegram / Discord / Router (D-30.4.3-5, 2026-06-07).
 *
 * 拍板 (D-30.4): 1 source of truth ChannelRouter. telegram.ts (polling) +
 * discord.ts (gateway) + router.ts. 真实 discord.js / edge-TTS 留 D-30.4.5+.
 */

export { TelegramChannel, type TelegramConfig, type TelegramFetcher, type TelegramMessageHandler } from './telegram.js';
export { DiscordChannel, type DiscordConfig, type DiscordFetcher, type DiscordWebSocketFactory, type DiscordSocket, type DiscordMessageHandler } from './discord.js';
export { ChannelRouter, type ChannelMessage, type ChannelHandler, type ChannelKind } from './router.js';
