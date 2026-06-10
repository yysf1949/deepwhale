/**
 * v6.0 master plan doc-existence test -- D-106 v6.0 master plan sub-sprint.
 *
 * Asserts that the v6.0 master plan doc exists, is non-empty, and
 * contains the 4 v6.0 theme names + the multi-agent safety seed
 * marker. This locks the v6.0 plan in place: a future contributor
 * who deletes or rewrites the doc without updating the test gets
 * a fail.
 *
 * The test is intentionally light: it does NOT validate the
 * CONTENT of the plan (semantic checks would belong to a
 * documentation review, not an automated test). It only checks
 * structural existence + the 4 theme names + the seed marker.
 *
 * Bidirectional TDD pattern: if the doc is removed, this test
 * fails. If the test is removed, the plan doc can be silently
 * deleted. Both are part of the v6.0 hygiene contract.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const V6_PLAN = join(process.cwd(), 'docs', 'superpowers', 'v6.0-master-plan.md');

describe('v6.0 master plan doc-existence (D-106)', () => {
  it('exists at docs/superpowers/v6.0-master-plan.md (D-106)', () => {
    expect(existsSync(V6_PLAN)).toBe(true);
  });

  it('is non-empty and mentions the 4 v6.0 themes (D-106)', () => {
    const content = readFileSync(V6_PLAN, 'utf8');
    expect(content.length).toBeGreaterThan(200);
    expect(content).toContain('Theme 1');
    expect(content).toContain('Multi-Agent Safety');
    expect(content).toContain('Theme 2');
    expect(content).toContain('Hosted/Enterprise');
    expect(content).toContain('Theme 3');
    expect(content).toContain('Distributed Cross-Instance');
    expect(content).toContain('Theme 4');
    expect(content).toContain('Advanced Observability');
  });

  it('declares the entry-criteria checklist with v5.0 + v6.0 master plan items checked (D-106)', () => {
    const content = readFileSync(V6_PLAN, 'utf8');
    expect(content).toContain('Entry criteria');
    expect(content).toContain('v5.0 production hardening shipped');
    expect(content).toContain('v5.0 cross-theme bridge shipped');
    expect(content).toContain('v5.0 4 themes all');
    expect(content).toContain('v6.0 master plan doc written');
  });
});
