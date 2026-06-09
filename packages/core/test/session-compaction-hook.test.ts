import { describe, expect, it } from 'vitest';
import { compactSession } from '../src/session/compaction.js';

describe('compaction hook contract', () => {
  it('uses compaction as the only prefix cache reset point', async () => {
    const resets: string[] = [];
    await compactSession({
      messages: [{ role: 'user', content: 'long task' }],
      onPrefixCacheReset: (reason) => resets.push(reason),
    });

    expect(resets).toEqual(['compaction']);
  });

  it('allows a hook to replace the default summary', async () => {
    const result = await compactSession({
      messages: [{ role: 'user', content: 'keep this' }],
      compact: async () => ({ summary: 'hook summary' }),
    });

    expect(result.summary).toBe('hook summary');
  });

  it('still emits the prefix cache reset event when a hook is provided', async () => {
    const resets: string[] = [];
    await compactSession({
      messages: [{ role: 'user', content: 'task' }],
      onPrefixCacheReset: (reason) => resets.push(reason),
      compact: () => ({ summary: 's' }),
    });
    expect(resets).toEqual(['compaction']);
  });
});
