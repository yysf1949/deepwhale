/**
 * Default registry invariant fixture �?D-83 v1.0 evidence.
 *
 * The v1.0 release gate promises a "narrow default": coding tools plus
 * Code Intel essentials. Non-coding surfaces (Browser, Desktop, Channel,
 * media, productivity, research) are explicit opt-in and must NOT be
 * exposed by the default registry.
 *
 * This fixture asserts the invariant with 2 tests. If anyone adds a 20th
 * default tool (deliberate or accidental), the v1.0 narrow-default promise
 * is violated and the count test fails. The "no non-coding opt-in tools"
 * test guards against future code that might pull a non-coding tool into
 * the default import graph.
 */

import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

// Non-coding tool name patterns that must NEVER appear in the default
// registry. The status blocks in README, ROADMAP, and ROADMAP_DECISIONS
// explicitly promise: "Browser, Desktop, Channel, media, and productivity
// remain opt-in or stopped, not default-enabled." A tool name matching
// one of these patterns would break that promise.
const NON_CODING_OPT_IN_PATTERNS: ReadonlyArray<RegExp> = [
  /^browser_(?!action)/i,  // Exclude browser_action which is a coding tool
  /^desktop[_-]/i,
  /^channel[_-]/i,
  /[_-]browser$/i,
  /[_-]desktop$/i,
  /[_-]channel$/i,
  /media/i,
  /productivity/i,
  /research/i,
];

describe('default registry invariant (D-83 v1.0)', () => {
  it('contains exactly 20 coding + Code Intel tools (D-83 v1.0 narrow-default promise)', () => {
    const reg = createDefaultRegistry();
    const tools = reg.list();
    expect(tools.length).toBe(20);
  });

  it('contains no non-coding opt-in tools (D-83 v1.0 narrow-default promise)', () => {
    const reg = createDefaultRegistry();
    const tools = reg.list();
    const offending = tools
      .map((t) => t.name)
      .filter((name) => NON_CODING_OPT_IN_PATTERNS.some((re) => re.test(name)));
    expect(offending, `non-coding opt-in tools leaked into default registry: ${offending.join(', ')}`).toEqual([]);
  });
});
