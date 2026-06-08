import { describe, it, expect, beforeEach } from 'vitest';
import { AirtableTool } from '../../src/tools/airtable.js';

const mockBases = JSON.stringify({ bases: [{ id: 'b1', name: 'CRM' }] });
const mockRecords = JSON.stringify({ records: [{ id: 'r1', fields: { name: 'Alice' } }] });
const mockRecord = JSON.stringify({ id: 'r1', fields: { name: 'Bob' } });

describe('airtable', () => {
  let tool: AirtableTool;
  beforeEach(() => {
    tool = new AirtableTool({ fetcher: async (url, opts) => {
      if (url.includes('v0/meta/bases') && (!opts || opts.method === 'GET')) return mockBases;
      if (url.includes('/b1/Users') && opts?.method === 'PATCH') return mockRecord;
      if (url.includes('/b1/Users') && opts?.method === 'DELETE') return JSON.stringify({ id: 'r1', deleted: true });
      if (url.includes('/b1/Users') && opts?.method === 'POST') return mockRecord;
      if (url.includes('/b1/Users') && (!opts || opts.method === 'GET')) return mockRecords;
      return '{}';
    }});
  });

  it('listBases returns base list', async () => {
    const r = await tool.execute({ action: 'listBases' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('CRM');
  });

  it('listRecords returns records', async () => {
    const r = await tool.execute({ action: 'listRecords', baseId: 'b1', tableName: 'Users' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Alice');
  });

  it('createRecord posts new record', async () => {
    const r = await tool.execute({ action: 'createRecord', baseId: 'b1', tableName: 'Users', fields: { name: 'Bob' } });
    expect(r.success).toBe(true);
  });

  it('updateRecord patches fields', async () => {
    const r = await tool.execute({ action: 'updateRecord', baseId: 'b1', tableName: 'Users', recordId: 'r1', fields: { name: 'X' } });
    expect(r.success).toBe(true);
  });

  it('deleteRecord removes record', async () => {
    const r = await tool.execute({ action: 'deleteRecord', baseId: 'b1', tableName: 'Users', recordId: 'r1' });
    expect(r.success).toBe(true);
  });

  it('rejects missing baseId', async () => {
    const r = await tool.execute({ action: 'listRecords', tableName: 'x' });
    expect(r.success).toBe(false);
  });
});
