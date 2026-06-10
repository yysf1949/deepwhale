import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function expectSafePersistentPath(value: string): void {
  const normalized = normalizePath(value);
  expect(normalized).not.toBe('undefined');
  expect(normalized).not.toBe('null');
  expect(normalized).not.toContain('/undefined/');
  expect(normalized).not.toContain('/null/');
  expect(normalized).not.toContain('undefined/.deepwhale');
  expect(normalized).toContain('/.deepwhale');
}

describe('default persistent tool paths (D-55)', () => {
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalDeepwhaleHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    originalDeepwhaleHome = process.env.DEEPWHALE_HOME;
    process.env.HOME = 'undefined';
    process.env.USERPROFILE = 'null';
    process.env.DEEPWHALE_HOME = 'undefined';
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalUserProfile !== undefined) process.env.USERPROFILE = originalUserProfile;
    else delete process.env.USERPROFILE;
    if (originalDeepwhaleHome !== undefined) process.env.DEEPWHALE_HOME = originalDeepwhaleHome;
    else delete process.env.DEEPWHALE_HOME;
  });

  it('does not place default local state below literal undefined/null home dirs', async () => {
    const [{ blogwatcher }, { kanbanOrchestrator }, { llmWiki }, { webhookSubscriptions }, { createRegistryForProfile }] = await Promise.all([
      import('../../src/tools/blogwatcher.js'),
      import('../../src/tools/kanban-orchestrator.js'),
      import('../../src/tools/llm-wiki.js'),
      import('../../src/tools/webhook-subscriptions.js'),
      import('../../src/tools/registry.js'),
    ]);

    expectSafePersistentPath((blogwatcher as unknown as { rootDir: string }).rootDir);
    expectSafePersistentPath((kanbanOrchestrator as unknown as { boardDir: string }).boardDir);
    expectSafePersistentPath((llmWiki as unknown as { dbPath: string }).dbPath);
    expectSafePersistentPath((webhookSubscriptions as unknown as { subsDir: string }).subsDir);

    const researchBlogwatcher = (await createRegistryForProfile({ profile: 'research' })).require('blogwatcher');
    expectSafePersistentPath((researchBlogwatcher as unknown as { rootDir: string }).rootDir);
  });
});
