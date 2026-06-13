#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  inventoryGate1Targets,
  writeGate1TargetInventoryReport,
} from '../src/gate1-targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const values = parseArgs(process.argv.slice(2));

const targetsRoot = resolve(repoRoot, values.get('targets-root') ?? '.gate-targets');
const jsonOut = resolve(repoRoot, values.get('json') ?? 'docs/superpowers/gate-1-preferred-targets.json');
const mdOut = resolve(repoRoot, values.get('md') ?? 'docs/superpowers/gate-1-preferred-targets.md');
const minimumLoc = readNumber(values.get('minimum-loc'), 50_000);
const preferredLoc = readNumber(values.get('preferred-loc'), 100_000);
const maxDepth = readNumber(values.get('max-depth'), 8);

const report = await inventoryGate1Targets({ targetsRoot, minimumLoc, preferredLoc, maxDepth });
await writeGate1TargetInventoryReport(report, jsonOut, mdOut);

console.log(`gate1-target-inventory: status=${report.status} preferredTargets=${report.preferredTargets.length}`);
console.log(`[gate1-target-inventory] wrote ${jsonOut}`);
console.log(`[gate1-target-inventory] wrote ${mdOut}`);

function parseArgs(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`invalid arg: ${arg}`);
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    values.set(key, value);
    i += 1;
  }
  return values;
}

function readNumber(raw, fallback) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid numeric flag: ${raw}`);
  return value;
}
