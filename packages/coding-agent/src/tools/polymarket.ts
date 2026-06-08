/**
 * polymarket 工具 — prediction market 查询 (D-31.2.4, 2026-06-08).
 *
 * 拍板: 走 polymarket.com CLOB public API (无 auth, 0 token). 不下单 (write
 *   action) — D-31 read-only, 下单留 D-32+ (需 API key).
 * - search: query → list markets
 * - getMarket: marketId → 单 market detail
 * - getPrice: marketId + outcome → mid price
 * - getOrderbook: marketId → bids/asks
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读网络).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type Fetcher = (url: string) => Promise<string>;
const defaultFetcher: Fetcher = async () => { throw new Error('polymarket: no fetcher'); };

const BASE = 'https://clob.polymarket.com';

export class PolymarketTool implements Tool {
  readonly name = 'polymarket' as ToolName;
  readonly description = 'Read-only Polymarket prediction market queries: search / getMarket / getPrice / getOrderbook. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'polymarket action', enum: ['search', 'getMarket', 'getPrice', 'getOrderbook'] },
      query: { type: 'string', description: 'search query (search action)' },
      marketId: { type: 'string', description: 'market id (getMarket / getPrice / getOrderbook)' },
      outcome: { type: 'string', description: 'outcome name (getPrice action)' },
    },
    required: ['action'],
  };

  private readonly fetcher: Fetcher;
  constructor(opts: { fetcher?: Fetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'search': {
          const q = input['query'];
          if (typeof q !== 'string') return { success: false, content: '', error: 'invalid-input: query required' };
          const url = `${BASE}/markets?query=${encodeURIComponent(q)}`;
          const out = await this.fetcher(url);
          return { success: true, content: out };
        }
        case 'getMarket': {
          const id = input['marketId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: marketId required' };
          const url = `${BASE}/markets/${id}`;
          const out = await this.fetcher(url);
          return { success: true, content: out };
        }
        case 'getPrice': {
          const id = input['marketId'], outcome = input['outcome'];
          if (typeof id !== 'string' || typeof outcome !== 'string') {
            return { success: false, content: '', error: 'invalid-input: marketId/outcome required' };
          }
          const url = `${BASE}/markets/${id}/price?outcome=${encodeURIComponent(outcome)}`;
          const out = await this.fetcher(url);
          return { success: true, content: out };
        }
        case 'getOrderbook': {
          const id = input['marketId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: marketId required' };
          const url = `${BASE}/markets/${id}/book`;
          const out = await this.fetcher(url);
          return { success: true, content: out };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `polymarket error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const polymarket = new PolymarketTool();
