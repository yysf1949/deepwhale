import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createDefaultRegistry,
  isToolRegistryProfile,
  LEGACY_OPT_IN_REGISTRY_PROFILES,
  registryProfilePolicy,
  STABLE_REGISTRY_PROFILES,
} from '../../src/tools/registry.js';

describe('registry profile policy (D-57)', () => {
  it('defines the stabilization profile set separately from legacy opt-in profiles', () => {
    expect(STABLE_REGISTRY_PROFILES).toEqual(['core', 'coding', 'code-intel', 'productivity', 'media', 'all']);
    expect(LEGACY_OPT_IN_REGISTRY_PROFILES).toEqual(['web', 'engineering', 'research']);
  });

  it('does not treat Browser, Desktop, or Channel as registry profiles', () => {
    expect(isToolRegistryProfile('default')).toBe(true);
    expect(isToolRegistryProfile('browser')).toBe(false);
    expect(isToolRegistryProfile('desktop')).toBe(false);
    expect(isToolRegistryProfile('channel')).toBe(false);
  });

  it('marks default as the only default-enabled profile', () => {
    expect(registryProfilePolicy('default')).toEqual({
      profile: 'default',
      kind: 'default',
      defaultEnabled: true,
      explicitOptInRequired: false,
    });
    expect(registryProfilePolicy('web')).toEqual({
      profile: 'web',
      kind: 'legacy-opt-in',
      defaultEnabled: false,
      explicitOptInRequired: true,
    });
    expect(registryProfilePolicy('productivity')).toEqual({
      profile: 'productivity',
      kind: 'stable',
      defaultEnabled: false,
      explicitOptInRequired: true,
    });
  });

  it('keeps createDefaultRegistry limited to coding plus Code Intel essentials', () => {
    const names = createDefaultRegistry().list().map((tool) => tool.name);

    expect(names).toEqual([
      'read_file',
      'write_file',
      'edit_file',
      'bash',
      'find',
      'grep',
      'patch',
      'search_files',
      'execute_code',
      'todo',
      'plan',
      'browser_action',
      'parse_file',
      'get_symbols',
      'analyze_repo',
      'find_definition',
      'find_references',
      'call_graph',
      'rename_symbol',
      'smart_search',
    ]);
    expect(names).not.toContain('browser_navigate');
    expect(names).not.toContain('github_pr_workflow');
    expect(names).not.toContain('arxiv');
    expect(names).not.toContain('notion');
    expect(names).not.toContain('spotify');
  });

  it('keeps opt-in tool modules out of the synchronous default registry module graph', async () => {
    const source = await readFile(resolve(process.cwd(), 'packages/coding-agent/src/tools/registry.ts'), 'utf8');

    for (const moduleName of [
      'web-search',
      'web-extract',
      'browser-navigate',
      'delegate-task',
      'vision-analyze',
      'text-to-speech',
      'github-pr-workflow',
      'github-issues',
      'github-code-review',
      'kanban-orchestrator',
      'cloudflare-pages-deploy',
      'webhook-subscriptions',
      'arxiv',
      'blogwatcher',
      'llm-wiki',
      'polymarket',
      'notion',
      'linear',
      'airtable',
      'ocr-and-documents',
      'spotify',
      'youtube-content',
    ]) {
      expect(source).not.toContain(`'./${moduleName}.js'`);
    }
  });

  it('fails closed when synchronous callers request opt-in profiles', () => {
    expect(() => createDefaultRegistry({ profile: 'media' })).toThrow(/createRegistryForProfile/);
  });
});
