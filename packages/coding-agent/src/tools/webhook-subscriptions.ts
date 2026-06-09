/**
 * webhook_subscriptions 工具 — 1 source of truth 订阅表 (D-31.1.6, 2026-06-08).
 *
 * 拍板: 1 source of truth `~/.deepwhale/webhooks/subs.json`. 触发走
 *   child_process spawn local handler (handler 路径写 url 字段). 简化版 — 真 webhook
 *   server (HTTP listener) 留 D-32+ (跟 D-30.3 cron-daemon 1:1 stub 协议).
 * - add: url + event filter (`*` 表所有)
 * - list: 列所有 subs
 * - remove: 按 subId 删
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写本地文件 + spawn).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { deepwhaleRoot } from '../util/deepwhale-paths.js';

export interface Subscription {
  id: string;
  url: string;
  event: string;
  createdAt: number;
}

export interface WebhookOptions {
  subsDir: string;
}

export class WebhookSubscriptionsTool implements Tool {
  readonly name = 'webhook_subscriptions' as ToolName;
  readonly description = 'Manage local webhook subscriptions: add / list / remove. Persists to subs.json. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action: add | list | remove', enum: ['add', 'list', 'remove'] },
      url: { type: 'string', description: 'Webhook URL (add)' },
      event: { type: 'string', description: 'Event filter (add, * for all)' },
      subId: { type: 'string', description: 'Subscription id (remove)' },
    },
    required: ['action'],
  };

  private readonly subsDir: string;
  constructor(opts: WebhookOptions) {
    this.subsDir = opts.subsDir;
  }

  private async load(): Promise<Subscription[]> {
    try {
      const buf = await fs.readFile(join(this.subsDir, 'subs.json'), 'utf8');
      return JSON.parse(buf) as Subscription[];
    } catch {
      return [];
    }
  }

  private async save(subs: Subscription[]): Promise<void> {
    await fs.mkdir(this.subsDir, { recursive: true });
    await fs.writeFile(join(this.subsDir, 'subs.json'), JSON.stringify(subs, null, 2), 'utf8');
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'add': {
          const url = input['url'], event = input['event'];
          if (typeof url !== 'string' || url.length === 0) return { success: false, content: '', error: 'invalid-input: url required' };
          if (typeof event !== 'string' || event.length === 0) return { success: false, content: '', error: 'invalid-input: event required' };
          const subs = await this.load();
          const sub: Subscription = { id: `s${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url, event, createdAt: Date.now() };
          subs.push(sub);
          await this.save(subs);
          return { success: true, content: `added ${sub.id}`, meta: { subId: sub.id } };
        }
        case 'list': {
          const subs = await this.load();
          const lines = subs.map(s => `${s.event.padEnd(16)} ${s.id}  ${s.url}`).join('\n');
          return { success: true, content: lines || '(no subs)', meta: { raw: JSON.stringify(subs) } };
        }
        case 'remove': {
          const id = input['subId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: subId required' };
          const subs = await this.load();
          const next = subs.filter(s => s.id !== id);
          if (next.length === subs.length) return { success: false, content: '', error: `not-found: ${id}` };
          await this.save(next);
          return { success: true, content: `removed ${id}` };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `webhook error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const webhookSubscriptions = new WebhookSubscriptionsTool({
  subsDir: join(deepwhaleRoot(), 'webhooks'),
});
