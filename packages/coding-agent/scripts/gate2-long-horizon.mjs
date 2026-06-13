#!/usr/bin/env tsx
/**
 * Gate-2 long-horizon fixture runner.
 *
 * Reads a JSON transcript from --fixture, calls evaluateGate2Transcript,
 * writes JSON and Markdown reports to --json / --md.
 *
 * Usage:
 *   tsx scripts/gate2-long-horizon.mjs --fixture <path.json> --json <out.json> --md <out.md>
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate2Transcript } from '../src/long-horizon/gate2.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    out[key] = value;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.fixture || !args.json || !args.md) {
  console.error('usage: gate2-long-horizon.mjs --fixture <path> --json <out.json> --md <out.md>');
  process.exit(2);
}

const fixturePath = resolve(projectRoot, args.fixture);
const jsonPath = resolve(projectRoot, args.json);
const mdPath = resolve(projectRoot, args.md);

const raw = await readFile(fixturePath, 'utf8');
const transcript = JSON.parse(raw);
const result = evaluateGate2Transcript(transcript);

await mkdir(dirname(jsonPath), { recursive: true });
await mkdir(dirname(mdPath), { recursive: true });

await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n');

const md = [
  '# Gate-2 Long-Horizon Report',
  '',
  `- generated_at: ${new Date().toISOString()}`,
  `- fixture: ${args.fixture}`,
  `- goal: ${transcript.goal}`,
  `- tool_calls: ${result.toolCalls}`,
  `- retries: ${result.retries}`,
  `- goal_drift_detected: ${result.goalDriftDetected}`,
  `- passed: ${result.passed}`,
  result.reason ? `- reason: ${result.reason}` : '',
  '',
].filter(Boolean).join('\n');
await writeFile(mdPath, md);

console.log(`gate2: passed=${result.passed} toolCalls=${result.toolCalls} retries=${result.retries} drift=${result.goalDriftDetected}${result.reason ? ' reason=' + result.reason : ''}`);
process.exit(result.passed ? 0 : 1);
