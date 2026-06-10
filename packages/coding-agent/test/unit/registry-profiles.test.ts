import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistry,
  createRegistryForProfile,
  type OptInToolRegistryProfile,
  type SynchronousToolRegistryProfile,
} from '../../src/tools/registry.js';

function names(profile?: SynchronousToolRegistryProfile): string[] {
  return createDefaultRegistry(profile === undefined ? {} : { profile }).list().map((t) => t.name);
}

async function optInNames(profile: OptInToolRegistryProfile): Promise<string[]> {
  return (await createRegistryForProfile({ profile })).list().map((t) => t.name);
}

describe('registry profiles (stabilization gate)', () => {
  it('defaults to coding + code-intel essentials only', () => {
    const toolNames = names();
    expect(toolNames).toEqual([
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
      'parse_file',
      'get_symbols',
      'analyze_repo',
      'find_definition',
      'find_references',
      'call_graph',
      'rename_symbol',
      'smart_search',
    ]);
  });

  it('keeps non-coding surfaces out of the default profile', () => {
    const toolNames = names();
    expect(toolNames).not.toContain('spotify');
    expect(toolNames).not.toContain('youtube_content');
    expect(toolNames).not.toContain('notion');
    expect(toolNames).not.toContain('linear');
    expect(toolNames).not.toContain('airtable');
    expect(toolNames).not.toContain('browser_navigate');
    expect(toolNames).not.toContain('cloudflare_pages_deploy');
  });

  it('core profile exposes only the original six coding tools', () => {
    expect(names('core')).toEqual(['read_file', 'write_file', 'edit_file', 'bash', 'find', 'grep']);
  });

  it('coding profile exposes file/edit/search/execute planning tools without code-intel', () => {
    const toolNames = names('coding');
    expect(toolNames).toContain('patch');
    expect(toolNames).toContain('search_files');
    expect(toolNames).toContain('execute_code');
    expect(toolNames).not.toContain('parse_file');
    expect(toolNames).not.toContain('spotify');
  });

  it('code-intel profile exposes only code-intel tools', () => {
    expect(names('code-intel')).toEqual([
      'parse_file',
      'get_symbols',
      'analyze_repo',
      'find_definition',
      'find_references',
      'call_graph',
      'rename_symbol',
      'smart_search',
    ]);
  });

  it('domain profiles are explicit opt-in', async () => {
    expect(await optInNames('research')).toEqual(['arxiv', 'blogwatcher', 'llm_wiki', 'polymarket']);
    expect(await optInNames('productivity')).toEqual(['notion', 'linear', 'airtable', 'ocr_and_documents']);
    expect(await optInNames('media')).toEqual(['spotify', 'youtube_content']);
    expect(await optInNames('web')).toEqual(['web_search', 'web_extract', 'browser_navigate']);
    expect(await optInNames('engineering')).toEqual([
      'github_pr_workflow',
      'github_issues',
      'github_code_review',
      'kanban_orchestrator',
      'cloudflare_pages_deploy',
      'webhook_subscriptions',
    ]);
  });

  it('all profile preserves the complete tool surface for explicit opt-in', async () => {
    const toolNames = await optInNames('all');
    expect(toolNames).toHaveLength(41);
    expect(toolNames).toContain('spotify');
    expect(toolNames).toContain('notion');
    expect(toolNames).toContain('browser_navigate');
    expect(toolNames).toContain('smart_search');
  });
});
