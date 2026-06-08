/**
 * youtube_content 工具 — 2 action (D-31.4.2, 2026-06-08).
 *
 * 拍板: searchVideos 走 YouTube Data API `youtube/v3/search` (key 走
 *   `YOUTUBE_API_KEY` env), getTranscript 走 youtube-transcript npm (留 stub
 *   fetcher, 实际 1 tool 装 npm 时引). fetcher 注入保 1:1 协议.
 * - searchVideos:   GET /youtube/v3/search?q=&part=snippet&type=video
 * - getTranscript:  parse youtube-transcript JSON, output <text> per line
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读网络).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type YtFetcher = (url: string) => Promise<string>;
const defaultFetcher: YtFetcher = async () => { throw new Error('youtube-content: no fetcher injected'); };

const SEARCH_BASE = 'https://www.googleapis.com/youtube/v3/search';
const TRANSCRIPT_BASE = 'https://www.youtube.com/api/timedtext';

export class YoutubeContentTool implements Tool {
  readonly name = 'youtube_content' as ToolName;
  readonly description = 'Read YouTube video metadata + transcript: searchVideos / getTranscript. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'youtube action', enum: ['searchVideos', 'getTranscript'] },
      query: { type: 'string', description: 'search query (searchVideos action)' },
      videoId: { type: 'string', description: 'video id (getTranscript action)' },
    },
    required: ['action'],
  };

  private readonly fetcher: YtFetcher;
  constructor(opts: { fetcher?: YtFetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'searchVideos': {
          const q = input['query'];
          if (typeof q !== 'string') return { success: false, content: '', error: 'invalid-input: query required' };
          const url = `${SEARCH_BASE}?q=${encodeURIComponent(q)}&part=snippet&type=video&maxResults=5`;
          const out = await this.fetcher(url);
          return { success: true, content: out, meta: { query: q } };
        }
        case 'getTranscript': {
          const id = input['videoId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: videoId required' };
          // transcript 走 youtube-transcript npm 协议 (返 [{text, offset, duration}])
          // stub fetcher 模拟返回. 真实接 youtube-transcript 留 D-32+.
          const url = `${TRANSCRIPT_BASE}?v=${id}&lang=en`;
          const out = await this.fetcher(url);
          try {
            const arr = JSON.parse(out) as Array<{ text: string; offset: number; duration: number }>;
            const lines = arr.map(t => t.text).join('\n');
            return { success: true, content: lines || '(empty transcript)', meta: { videoId: id, count: arr.length } };
          } catch {
            return { success: true, content: out, meta: { videoId: id } };
          }
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `youtube error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const youtubeContent = new YoutubeContentTool();
