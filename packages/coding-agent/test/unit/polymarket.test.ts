import { describe, it, expect, beforeEach } from 'vitest';
import { PolymarketTool } from '../../src/tools/polymarket.js';

const mockMarkets = JSON.stringify([
  { id: 'm1', question: 'Will X happen?', outcomes: ['Yes', 'No'], volume: 1000 },
]);
const mockBook = JSON.stringify({ bids: [{ price: 0.6, size: 100 }], asks: [{ price: 0.65, size: 50 }] });

describe('polymarket', () => {
  let tool: PolymarketTool;
  beforeEach(() => {
    tool = new PolymarketTool({ fetcher: async (url) => {
      if (url.includes('/markets') && !url.includes('/markets/')) return mockMarkets;
      if (url.includes('/book')) return mockBook;
      if (url.includes('/price')) return '0.62';
      return '';
    }});
  });

  it('search returns markets', async () => {
    const r = await tool.execute({ action: 'search', query: 'election' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('m1');
  });

  it('getMarket returns single market', async () => {
    const r = await tool.execute({ action: 'getMarket', marketId: 'm1' });
    expect(r.success).toBe(true);
  });

  it('getPrice returns mid price', async () => {
    const r = await tool.execute({ action: 'getPrice', marketId: 'm1', outcome: 'Yes' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('0.62');
  });

  it('getOrderbook returns bids/asks', async () => {
    const r = await tool.execute({ action: 'getOrderbook', marketId: 'm1' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('0.6');
  });
});
