import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebhookSubscriptionsTool } from '../../src/tools/webhook-subscriptions.js';

describe('webhook_subscriptions', () => {
  let dir = '';
  let tool: WebhookSubscriptionsTool;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'wh-'));
    tool = new WebhookSubscriptionsTool({ subsDir: dir });
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('add subscription writes to subs.json', async () => {
    const r = await tool.execute({ action: 'add', url: 'https://example.com/wh', event: 'pr.opened' });
    expect(r.success).toBe(true);
    const stat = await fs.stat(join(dir, 'subs.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('list returns active subs', async () => {
    await tool.execute({ action: 'add', url: 'https://a.com/wh', event: '*' });
    const r = await tool.execute({ action: 'list' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('a.com');
  });

  it('remove deletes the sub', async () => {
    await tool.execute({ action: 'add', url: 'https://a.com/wh', event: '*' });
    const list1 = await tool.execute({ action: 'list' });
    const subId = JSON.parse((list1.meta as any).raw)[0].id;
    const r = await tool.execute({ action: 'remove', subId });
    expect(r.success).toBe(true);
  });

  it('rejects invalid event filter', async () => {
    const r = await tool.execute({ action: 'add', url: 'https://a.com/wh', event: '' });
    expect(r.success).toBe(false);
  });
});
