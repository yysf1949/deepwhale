/**
 * airtable 工具 — Airtable REST API 5 action (D-31.3.3, 2026-06-08).
 *
 * 拍板: 走 Airtable REST (`api.airtable.com/v0`), PAT 走 `AIRTABLE_API_KEY`
 *   env, fetcher 注入. 不引 airtable npm (省 native dep).
 * - listBases:    GET /v0/meta/bases
 * - listRecords:  GET /v0/{baseId}/{tableNameOrId}
 * - createRecord: POST /v0/{baseId}/{tableName}
 * - updateRecord: PATCH /v0/{baseId}/{tableName}/{recordId}
 * - deleteRecord: DELETE /v0/{baseId}/{tableName}/{recordId}
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写 Airtable 记录).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type AirtableFetcher = (url: string, opts?: { method?: string; body?: string }) => Promise<string>;
const defaultFetcher: AirtableFetcher = async () => { throw new Error('airtable: no fetcher injected'); };

const BASE = 'https://api.airtable.com/v0';

export class AirtableTool implements Tool {
  readonly name = 'airtable' as ToolName;
  readonly description = 'Read/write Airtable bases + records via REST: listBases / listRecords / createRecord / updateRecord / deleteRecord. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'airtable action', enum: ['listBases', 'listRecords', 'createRecord', 'updateRecord', 'deleteRecord'] },
      baseId: { type: 'string', description: 'base id (listRecords / createRecord / updateRecord / deleteRecord)' },
      tableName: { type: 'string', description: 'table name or id' },
      recordId: { type: 'string', description: 'record id (updateRecord / deleteRecord)' },
    },
    required: ['action'],
  };

  private readonly fetcher: AirtableFetcher;
  constructor(opts: { fetcher?: AirtableFetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'listBases': {
          const out = await this.fetcher(`${BASE}/meta/bases`, { method: 'GET' });
          return { success: true, content: out };
        }
        case 'listRecords': {
          const baseId = input['baseId'], table = input['tableName'];
          if (typeof baseId !== 'string' || typeof table !== 'string') {
            return { success: false, content: '', error: 'invalid-input: baseId + tableName required' };
          }
          const out = await this.fetcher(`${BASE}/${baseId}/${encodeURIComponent(table)}`, { method: 'GET' });
          return { success: true, content: out };
        }
        case 'createRecord': {
          const baseId = input['baseId'], table = input['tableName'], fields = input['fields'];
          if (typeof baseId !== 'string' || typeof table !== 'string' || typeof fields !== 'object' || fields === null) {
            return { success: false, content: '', error: 'invalid-input: baseId + tableName + fields required' };
          }
          const out = await this.fetcher(`${BASE}/${baseId}/${encodeURIComponent(table)}`, {
            method: 'POST', body: JSON.stringify({ fields }),
          });
          return { success: true, content: out, meta: { baseId, table } };
        }
        case 'updateRecord': {
          const baseId = input['baseId'], table = input['tableName'], recordId = input['recordId'], fields = input['fields'];
          if (typeof baseId !== 'string' || typeof table !== 'string' || typeof recordId !== 'string' || typeof fields !== 'object' || fields === null) {
            return { success: false, content: '', error: 'invalid-input: baseId + tableName + recordId + fields required' };
          }
          const out = await this.fetcher(`${BASE}/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
            method: 'PATCH', body: JSON.stringify({ fields }),
          });
          return { success: true, content: out, meta: { recordId } };
        }
        case 'deleteRecord': {
          const baseId = input['baseId'], table = input['tableName'], recordId = input['recordId'];
          if (typeof baseId !== 'string' || typeof table !== 'string' || typeof recordId !== 'string') {
            return { success: false, content: '', error: 'invalid-input: baseId + tableName + recordId required' };
          }
          const out = await this.fetcher(`${BASE}/${baseId}/${encodeURIComponent(table)}/${recordId}`, { method: 'DELETE' });
          return { success: true, content: out, meta: { recordId } };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `airtable error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const airtable = new AirtableTool();
