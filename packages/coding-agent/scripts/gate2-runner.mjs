#!/usr/bin/env tsx
/**
 * Gate-2 LIVE runner CLI (D-36).
 *
 * Usage:
 *   tsx scripts/gate2-runner.mjs --llm-config llm.json --task-config task.json --json out.json --md out.md
 *   tsx scripts/gate2-runner.mjs --mock --json out.json --md out.md
 *
 * Mutual exclusion: --llm-config and --mock cannot be combined.
 * Missing both: errors out.
 *
 * In live mode the runner NEVER falls back to mock; if apiKey is empty or
 * the LLM call fails, the report's `source` is `live-llm` and `passed_live`
 * is `false`, with `liveError` populated. The mock path is the ONLY path
 * that uses `buildMockGate2Transcript` and the ONLY path that can produce
 * `passed_mock=true`.
 */
import { resolve } from 'node:path';

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
  console.error('usage: gate2-runner.mjs (--llm-config <path> --task-config <path> | --mock) --json <out.json> --md <out.md>');
  process.exit(2);
}

const jsonOut = resolve(process.cwd(), args.json);
const mdOut = resolve(process.cwd(), args.md);

const llmConfigPath = typeof args['llm-config'] === 'string' ? resolve(process.cwd(), args['llm-config']) : undefined;
const taskConfigPath = typeof args['task-config'] === 'string' ? resolve(process.cwd(), args['task-config']) : undefined;
const mock = args.mock === true;

const { runMock } = await import('./gate2-runner-mock.js');
const { runLive } = await import('./gate2-runner-live.js');

const spec = {
  source: mock ? 'mock' : 'live-llm',
  ...(llmConfigPath !== undefined ? { llmConfigPath } : {}),
  ...(taskConfigPath !== undefined ? { taskConfigPath } : {}),
  ...(mock ? { mock: true } : {}),
  jsonOutPath: jsonOut,
  mdOutPath: mdOut,
};

try {
  const result = mock
    ? await runMock(spec)
    : await runLive(spec);
  console.log(`gate2-runner: source=${result.report.source} passed_live=${result.report.passed_live} passed_mock=${result.report.passed_mock} toolCalls=${result.report.toolCalls}`);
  process.exit(result.report.passed_live ? 0 : 1);
} catch (err) {
  console.error(`gate2-runner: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(3);
}
