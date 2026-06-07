/**
 * Requesting Code Review skill (D-30.5.7, 2026-06-08).
 *
 * Engine module form (跟 ~/.hermes/skills/ 形式区别). 集成进 coding-agent
 * 的 pre-commit hook: 跑 reviewChecklist() 给出必查项, LLM-driven reviewer
 * 拿这 list 扫 diff.
 *
 * 红线: 不直接调 LLM, 不接 network, 不存 state — 纯函数 return list.
 */
export interface ReviewChecklistOptions {
  category?: 'block' | 'nit' | 'all';
}

const BLOCK: ReadonlyArray<string> = [
  'Security: secrets in code (API keys, tokens, passwords)',
  'Security: SQL/XSS/command injection vectors',
  'Correctness: 5 红线 preserved (D-19.5 P2-SIGINT, D-19.6.1, 6afccc8, 1ceef94, no-unsafe-finally)',
  'Correctness: turnInFlight/lineQueue state machine unchanged',
  'Public API: 1:1 shape preserved (no breaking renames)',
];

const NIT: ReadonlyArray<string> = [
  'Style: 0 dead code, 0 commented-out blocks',
  'Tests: new code has failing test → green test',
  'Docs: README + plan + ship log updated if public surface changed',
  'Commit: subject under 72 chars, body explains WHY not WHAT',
];

export function reviewChecklist(opts: ReviewChecklistOptions = {}): string[] {
  const cat = opts.category ?? 'all';
  if (cat === 'block') return [...BLOCK];
  if (cat === 'nit') return [...NIT];
  return [...BLOCK, ...NIT];
}