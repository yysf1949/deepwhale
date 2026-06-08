/**
 * spotify 工具 — Spotify Web API 6 action (D-31.4.1, 2026-06-08).
 *
 * 拍板: 走 Spotify Web API (`api.spotify.com/v1`), bearer token 走
 *   `SPOTIFY_TOKEN` env, fetcher 注入. 不引 spotify-web-api-node (省 native dep),
 *   走 hand-rolled HTTP. OAuth flow 留 D-32+ (本 plan 走 stub bearer).
 * - search:        GET /v1/search
 * - play:          PUT /v1/me/player/play
 * - pause:         PUT /v1/me/player/pause
 * - next:          POST /v1/me/player/next
 * - queue:         POST /v1/me/player/queue
 * - currentTrack:  GET /v1/me/player/currently-playing
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写 playback 状态).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type SpotifyFetcher = (url: string, opts?: { method?: string; body?: string }) => Promise<string>;
const defaultFetcher: SpotifyFetcher = async () => { throw new Error('spotify: no fetcher injected'); };

const BASE = 'https://api.spotify.com/v1';

export class SpotifyTool implements Tool {
  readonly name = 'spotify' as ToolName;
  readonly description = 'Control Spotify playback via Web API: search / play / pause / next / queue / currentTrack. Medium risk (writes playback).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['search', 'play', 'pause', 'next', 'queue', 'currentTrack'] },
      query: { type: 'string' },
      trackId: { type: 'string' },
    },
    required: ['action'],
  };

  private readonly fetcher: SpotifyFetcher;
  constructor(opts: { fetcher?: SpotifyFetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'search': {
          const q = input['query'];
          if (typeof q !== 'string') return { success: false, content: '', error: 'invalid-input: query required' };
          const out = await this.fetcher(`${BASE}/search?q=${encodeURIComponent(q)}&type=track&limit=5`, { method: 'GET' });
          return { success: true, content: out, meta: { query: q } };
        }
        case 'play': {
          const id = input['trackId'];
          const body = id ? JSON.stringify({ uris: [`spotify:track:${id}`] }) : undefined;
          await this.fetcher(`${BASE}/me/player/play`, { method: 'PUT', body });
          return { success: true, content: 'playing', meta: { trackId: id } };
        }
        case 'pause': {
          await this.fetcher(`${BASE}/me/player/pause`, { method: 'PUT' });
          return { success: true, content: 'paused' };
        }
        case 'next': {
          await this.fetcher(`${BASE}/me/player/next`, { method: 'POST' });
          return { success: true, content: 'skipped' };
        }
        case 'queue': {
          const id = input['trackId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: trackId required' };
          await this.fetcher(`${BASE}/me/player/queue?uri=spotify:track:${id}`, { method: 'POST' });
          return { success: true, content: 'queued', meta: { trackId: id } };
        }
        case 'currentTrack': {
          const out = await this.fetcher(`${BASE}/me/player/currently-playing`, { method: 'GET' });
          return { success: true, content: out };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `spotify error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const spotify = new SpotifyTool();
