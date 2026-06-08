import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionIndex } from '../../src/util/session-index.js';

describe('session_search fulltext (D-31.2.5)', () => {
  let dir = '';
  let idx: SessionIndex;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'sess-'));
    idx = new SessionIndex(dir);
    await idx.init();
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('search across message content returns hit', async () => {
    await idx.index({
      id: 's1', path: '/tmp/s1', firstUser: 'fix bug', messageCount: 2, createdAt: 0,
    }, 'user: how do I fix the auth bug?\nassistant: try restarting the service');
    const r = await idx.search('restarting');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].id).toBe('s1');
  });

  it('search by content returns snippet', async () => {
    await idx.index({
      id: 's2', path: '/tmp/s2', firstUser: 'q', messageCount: 1, createdAt: 0,
    }, 'the quick brown fox jumps');
    const r = await idx.search('fox');
    expect(r.length).toBe(1);
  });

  it('search by title still works (backward compat)', async () => {
    await idx.index({
      id: 's3', path: '/tmp/s3', firstUser: 'kubernetes deploy', messageCount: 1, createdAt: 0,
    }, 'no relevant content here');
    const r = await idx.search('kubernetes');
    expect(r.length).toBe(1);
  });
});
