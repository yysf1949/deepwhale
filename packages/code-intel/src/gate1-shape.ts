/**
 * Gate-1 evidence shape adapter (D-33.2.5, 2026-06-09).
 *
 * 拍板: `runGate1()` returns a result with the operational field names
 *   (`repoPath`, `metrics.symbolsIndexed`, `metrics.referencesIndexed`,
 *   `evidence.entry`, etc.). The master plan and downstream consumers
 *   want a flatter shape (`repoRoot`, `symbols`, `references`,
 *   `entry` at top level, etc.). Rather than rename the operational
 *   fields and break the committed JSON evidence files in
 *   docs/superpowers/gate-1-vite-result.json, we expose a thin adapter
 *   that maps between the two.
 *
 * The adapter REQUIRES entry + modificationPoint + non-empty callChain
 * because the plan shape treats them as mandatory. When the source
 * result is missing them, the adapter throws — it is a *consumer-side*
 * shape, not a replacement for the operational runner.
 */

import type { Gate1LocQualification, Gate1Result, Gate1SymbolEvidence } from './gate1.js';

export interface PlanGate1Shape {
  repoRoot: string;
  loc: number;
  supportedFiles: number;
  symbols: number;
  references: number;
  callEdges: number;
  elapsedMs: number;
  locQualification: Gate1LocQualification;
  entry: Gate1SymbolEvidence;
  callChain: Gate1Result['evidence']['callChain'];
  modificationPoint: Gate1SymbolEvidence;
  passed: boolean;
}

export function toPlanShape(result: Gate1Result): PlanGate1Shape {
  const entry = result.evidence.entry;
  const modificationPoint = result.evidence.modificationPoint;
  if (!entry) {
    throw new Error('gate1-shape: entry evidence missing in source result');
  }
  if (!modificationPoint) {
    throw new Error('gate1-shape: modificationPoint evidence missing in source result');
  }
  return {
    repoRoot: result.repoPath,
    loc: result.metrics.loc,
    supportedFiles: result.metrics.supportedFiles,
    symbols: result.metrics.symbolsIndexed,
    references: result.metrics.referencesIndexed,
    callEdges: result.metrics.callEdges,
    elapsedMs: result.metrics.elapsedMs,
    locQualification: result.locQualification,
    entry,
    callChain: result.evidence.callChain,
    modificationPoint,
    passed: result.passed,
  };
}
