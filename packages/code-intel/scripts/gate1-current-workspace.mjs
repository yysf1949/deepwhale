#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatGate1Markdown, loadGate1CliConfig, runGate1 } from '../src/gate1.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const outDir = resolve(repoRoot, 'docs', 'superpowers');
const defaultJsonOut = resolve(outDir, 'gate-1-current-workspace-result.json');
const defaultMdOut = resolve(outDir, 'gate-1-current-workspace-result.md');

const defaultOptions = {
  repoPath: repoRoot,
  minLoc: 50_000,
  preferredLoc: 100_000,
  timeboxMs: 20 * 60 * 1000,
  entrySymbol: 'createDefaultRegistry',
  requiredCall: {
    callerSymbol: 'runAgentTurn',
    calleeSymbol: 'createDefaultRegistry',
  },
  modificationPoint: {
    file: 'packages/coding-agent/src/tools/registry.ts',
    symbol: 'createDefaultRegistry',
  },
};

const config = process.argv.length > 2
  ? await loadGate1CliConfig(process.argv.slice(2), repoRoot)
  : { options: defaultOptions };
const jsonOut = resolve(repoRoot, config.jsonOut ?? defaultJsonOut);
const mdOut = resolve(repoRoot, config.mdOut ?? defaultMdOut);
const result = await runGate1(config.options);

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(jsonOut), { recursive: true });
mkdirSync(dirname(mdOut), { recursive: true });
writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
writeFileSync(mdOut, formatGate1Markdown(result), 'utf8');

console.log(formatGate1Markdown(result));
console.log(`[gate1] wrote ${jsonOut}`);
console.log(`[gate1] wrote ${mdOut}`);

if (!result.passed) {
  process.exitCode = 1;
}
