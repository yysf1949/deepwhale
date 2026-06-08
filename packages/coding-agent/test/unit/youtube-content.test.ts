import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YoutubeContentTool } from '../../src/tools/youtube-content.js';
import { YoutubeTranscript } from 'youtube-transcript';

vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn() },
}));

const mockSearch = JSON.stringify({
  items: [{ id: { videoId: 'v1' }, snippet: { title: 'How to X', channelTitle: 'Chan' } }],
});

describe('youtube_content', () => {
  let tool: YoutubeContentTool;
  beforeEach(() => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue([
      { text: 'hello world', offset: 0, duration: 2000 } as never,
      { text: 'second line', offset: 2000, duration: 3000 } as never,
    ]);
    tool = new YoutubeContentTool({
      fetcher: async (url) => {
        if (url.includes('googleapis.com/youtube/v3/search')) return mockSearch;
        return '{}';
      },
    });
  });

  it('searchVideos returns video list', async () => {
    const r = await tool.execute({ action: 'searchVideos', query: 'how to X' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('How to X');
  });

  it('getTranscript returns transcript lines', async () => {
    const r = await tool.execute({ action: 'getTranscript', videoId: 'v1' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('hello world');
    expect(r.content).toContain('second line');
  });

  it('rejects missing videoId on getTranscript', async () => {
    const r = await tool.execute({ action: 'getTranscript' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown action', async () => {
    const r = await tool.execute({ action: 'wat' });
    expect(r.success).toBe(false);
  });

  it('getTranscript rejects when npm throws', async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValueOnce(new Error('Video unavailable'));
    const r = await tool.execute({ action: 'getTranscript', videoId: 'v1' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Video unavailable');
  });

  it('getTranscript does not call fetcher', async () => {
    const throwingFetcher = vi.fn(async () => { throw new Error('fetcher should not be called by getTranscript'); });
    const t = new YoutubeContentTool({ fetcher: throwingFetcher });
    const r = await t.execute({ action: 'getTranscript', videoId: 'v1' });
    expect(r.success).toBe(true);
    expect(throwingFetcher).not.toHaveBeenCalled();
  });
});
