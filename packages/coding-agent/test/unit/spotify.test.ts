import { describe, it, expect, beforeEach } from 'vitest';
import { SpotifyTool } from '../../src/tools/spotify.js';

const mockSearch = JSON.stringify({
  tracks: { items: [{ id: 't1', name: 'Song A', artists: [{ name: 'Artist' }] }] },
});
const mockEmpty = JSON.stringify({});

describe('spotify', () => {
  let tool: SpotifyTool;
  beforeEach(() => {
    tool = new SpotifyTool({ fetcher: async (url, opts) => {
      if (url.includes('/search') && opts?.method === 'GET') return mockSearch;
      if (url.endsWith('/play') && opts?.method === 'PUT') return mockEmpty;
      if (url.endsWith('/pause') && opts?.method === 'PUT') return mockEmpty;
      if (url.endsWith('/next') && opts?.method === 'POST') return mockEmpty;
      if (url.includes('/queue') && opts?.method === 'POST') return mockEmpty;
      if (url.includes('/currently-playing')) return JSON.stringify({ item: { id: 't1', name: 'Song A' } });
      return mockEmpty;
    }});
  });

  it('search returns tracks', async () => {
    const r = await tool.execute({ action: 'search', query: 'Song A' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Song A');
  });

  it('play triggers playback', async () => {
    const r = await tool.execute({ action: 'play', trackId: 't1' });
    expect(r.success).toBe(true);
  });

  it('pause stops playback', async () => {
    const r = await tool.execute({ action: 'pause' });
    expect(r.success).toBe(true);
  });

  it('next skips track', async () => {
    const r = await tool.execute({ action: 'next' });
    expect(r.success).toBe(true);
  });

  it('queue adds track', async () => {
    const r = await tool.execute({ action: 'queue', trackId: 't1' });
    expect(r.success).toBe(true);
  });

  it('currentTrack returns now playing', async () => {
    const r = await tool.execute({ action: 'currentTrack' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Song A');
  });

  it('rejects unknown action', async () => {
    const r = await tool.execute({ action: 'wat' });
    expect(r.success).toBe(false);
  });
});
