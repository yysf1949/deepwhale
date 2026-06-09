#!/usr/bin/env tsx
/**
 * Gate-2 live runner (D-34).
 * Runs a 30-50 tool-call task (real or scripted) and writes Gate-2 evidence.
 *
 * Usage:
 *   tsx scripts/gate2-live-runner.mjs --mock --json out.json --md out.md
 *   tsx scripts/gate2-live-runner.mjs --llm-config llm.json --json out.json --md out.md
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMockGate2Transcript, evaluateGate2Result } from './gate2-live-runner-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.json || !args.md) {
  console.error('usage: gate2-live-runner.mjs [--mock] [--llm-config path] --json out.json --md out.md');
  process.exit(2);
}

const jsonPath = resolve(projectRoot, args.json);
const mdPath = resolve(projectRoot, args.md);

let llmSource = 'scripted-mock (real LLM runner TODO when api key wired)';
let transcript;

if (args['llm-config']) {
  // LLM config provided — for now still emit scripted mock and note the source.
  // TODO: wire a real DeepSeek/HTTP client and stream runToolLoopWithReview steps.
  try {
    const cfgRaw = await readFile(resolve(projectRoot, args['llm-config']), 'utf8');
    const cfg = JSON.parse(cfgRaw);
    if (cfg.apiKey) {
      llmSource = `llm-config: model=${cfg.model ?? 'unknown'} baseUrl=${cfg.baseUrl ?? 'unknown'} (real LLM runner TODO)`;
    }
  } catch {
    llmSource = `llm-config: ${args['llm-config']} unreadable; falling back to scripted-mock`;
  }
} else if (args.mock) {
  llmSource = 'scripted-mock (--mock flag)';
}

transcript = buildMockGate2Transcript({ toolCalls: 35, retries: 1, goalDrift: false });

const result = evaluateGate2Result(transcript);

await mkdir(dirname(jsonPath), { recursive: true });
await mkdir(dirname(mdPath), { recursive: true });
await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n');
await writeFile(mdPath, [
  '# Gate-2 Long-Horizon Live Report (D-34)',
  '',
  `- generated_at: ${new Date().toISOString()}`,
  `- source: ${llmSource}`,
  `- tool_calls: ${result.toolCalls}`,
  `- retries: ${result.retries}`,
  `- goal_drift_detected: ${result.goalDriftDetected}`,
  `- passed: ${result.passed}`,
  result.reason ? `- reason: ${result.reason}` : '',
  '',
].filter(Boolean).join('\n'));

console.log(`gate2-live: passed=${result.passed} toolCalls=${result.toolCalls} retries=${result.retries}`);
process.exit(result.passed ? 0 : 1);
