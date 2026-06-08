import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../../src/util/profile-store.js';

describe('profile_store', () => {
  let dir = '';
  let store: ProfileStore;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'profiles-'));
    store = new ProfileStore({ profilesDir: dir });
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('list returns empty on fresh dir', async () => {
    const r = await store.list();
    expect(r).toEqual([]);
  });

  it('create writes profile config', async () => {
    await store.create('work', { model: 'gpt-4o', theme: 'solarized' });
    const r = await store.list();
    expect(r).toContain('work');
  });

  it('switch returns config of named profile', async () => {
    await store.create('work', { model: 'gpt-4o', theme: 'solarized' });
    await store.create('home', { model: 'deepseek-chat' });
    const cfg = await store.switch('home');
    expect(cfg.model).toBe('deepseek-chat');
  });

  it('current returns last switched profile', async () => {
    await store.create('work', { model: 'gpt-4o' });
    await store.switch('work');
    const cur = await store.current();
    expect(cur?.name).toBe('work');
  });

  it('switch rejects unknown profile', async () => {
    await expect(store.switch('wat')).rejects.toThrow(/not-found/);
  });
});
