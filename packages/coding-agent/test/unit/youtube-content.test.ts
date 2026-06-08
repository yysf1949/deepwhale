import { describe, it, expect, beforeEach } from 'vitest';
import { YoutubeContentTool } from '../../src/tools/youtube-content.js';

const mockSearch = JSON.stringify({
  items: [{ id: { videoId: 'v1' }, snippet: { title: 'How to X', channelTitle: 'Chan' } }],
});
const mockTranscript = JSON.stringify([
  { text: 'hello world', offset: 0, duration: 2000 },
  { text: 'second line', offset: 2000, duration: 3000 },
]);

describe('youtube_content', () => {
  let tool: YoutubeContentTool;
  beforeEach(() => {
    tool = new YoutubeContentTool({
      fetcher: async (url) => {
        if (url.includes('googleapis.com/youtube/v3/search')) return mockSearch;
        if (url.includes('youtube.com/api/timedtext')) return mockTranscript;
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
    const r = await tool.execute({ action: 'wat' as any });
    expect(r.success).toBe(false);
  });
});
