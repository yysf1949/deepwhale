import { describe, it, expect, beforeAll } from 'vitest';
import { AnalyzeRepoTool } from '../../src/tools/analyze-repo.js';
import { resolve } from 'node:path';

const REPO_FIXTURE = resolve(
  process.cwd(),
  'packages/code-intel/test/fixtures'
);

describe('analyze_repo (D-32.1.3)', () => {
  let tool: AnalyzeRepoTool;
  beforeAll(() => {
    tool = new AnalyzeRepoTool();
  });

  it('returns totalFiles and langStats for a small repo', async () => {
    const r = await tool.execute({ path: REPO_FIXTURE });
    expect(r.success).toBe(true);
    const totalFiles = (r.meta as { totalFiles?: number })?.totalFiles ?? 0;
    // 6 fixture files (typescript.ts, javascript.js, python.py, go.go, bash.sh, rust.rs)
    expect(totalFiles).toBeGreaterThanOrEqual(6);
  });

  it('detects TypeScript and Python languages', async () => {
    const r = await tool.execute({ path: REPO_FIXTURE });
    expect(r.success).toBe(true);
    const langStats = (r.meta as { langStats?: Record<string, number> })?.langStats ?? {};
    expect(langStats.typescript ?? 0).toBeGreaterThanOrEqual(1);
    expect(langStats.python ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('returns symbol count > 0', async () => {
    const r = await tool.execute({ path: REPO_FIXTURE });
    expect(r.success).toBe(true);
    const symbolCount = (r.meta as { symbolCount?: number })?.symbolCount ?? 0;
    expect(symbolCount).toBeGreaterThan(0);
  });

  it('returns error for non-existent path', async () => {
    const r = await tool.execute({ path: '/nonexistent/repo/path/xyz' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/ENOENT|no such file|cannot find/i);
    }
  });
});
