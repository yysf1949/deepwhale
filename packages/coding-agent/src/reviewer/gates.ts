/**
 * Reviewer default verification gates — v3.0 (D-33.5.1)
 *
 * These are the canonical shell commands the Reviewer runs to validate
 * a v3.0 release candidate. They are exported so the Reviewer can be wired
 * into the tool-loop policy and into the v3.0 release gate.
 */

export const DEFAULT_REVIEWER_GATES: ReadonlyArray<string> = [
  'pnpm typecheck',
  'pnpm lint',
  'pnpm test',
  'git diff --check',
];
