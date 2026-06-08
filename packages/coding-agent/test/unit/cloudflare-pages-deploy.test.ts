import { describe, it, expect, beforeEach } from 'vitest';
import { CloudflarePagesDeployTool } from '../../src/tools/cloudflare-pages-deploy.js';

describe('cloudflare_pages_deploy', () => {
  let tool: CloudflarePagesDeployTool;
  beforeEach(() => {
    tool = new CloudflarePagesDeployTool({ runner: async (args) => {
      if (args[0] === 'pages' && args[1] === 'deploy') return 'Deployed to https://x.pages.dev\n';
      if (args[0] === 'pages' && args[1] === 'deployments' && args[2] === 'list') return JSON.stringify([{ id: 'd1', url: 'https://x.pages.dev', created_on: '2026-06-08' }]);
      if (args[0] === 'pages' && args[1] === 'deployments' && args[2] === 'rollback') return 'Rolled back to d1';
      return '';
    }});
  });

  it('deploy runs wrangler pages deploy', async () => {
    const r = await tool.execute({ action: 'deploy', project: 'my-site', directory: './dist' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('x.pages.dev');
  });

  it('listDeploys parses JSON', async () => {
    const r = await tool.execute({ action: 'listDeploys', project: 'my-site' });
    expect(r.success).toBe(true);
  });

  it('rollback runs wrangler pages deployments rollback', async () => {
    const r = await tool.execute({ action: 'rollback', project: 'my-site', deploymentId: 'd1' });
    expect(r.success).toBe(true);
  });

  it('returns error on runner failure', async () => {
    const fail = new CloudflarePagesDeployTool({ runner: async () => { throw new Error('CF_API_TOKEN missing'); } });
    const r = await fail.execute({ action: 'deploy', project: 'x', directory: './dist' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('CF_API_TOKEN');
  });
});
