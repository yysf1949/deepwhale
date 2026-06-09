#!/usr/bin/env node
/**
 * Gate-1.5 Browser Viability Harness (D-33.3.5, 2026-06-09)
 *
 * Fixture-based dry-run: reads --fixture JSON (array of {id, status} tasks),
 * calls evaluateBrowserGate15, writes --json + --md reports.
 *
 * NO live browser automation, NO real MCP subprocess. Pure report logic.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k || !v) throw new Error(`bad arg pair near index ${i}`);
    if (!k.startsWith('--')) throw new Error(`flag must start with --: ${k}`);
    out[k.slice(2)] = v;
  }
  for (const required of ['fixture', 'json', 'md']) {
    if (!out[required]) throw new Error(`missing required flag --${required}`);
  }
  return out;
}

async function importEvaluator() {
  const runtimePath = resolve(__dirname, '../src/browser/gate15.ts');
  return await import(pathToFileUrl(runtimePath));
}

function pathToFileUrl(p) {
  return new URL(`file:///${p.replace(/\\/g, '/')}`).href;
}

function buildMarkdown(result, fixturePath) {
  const pct = (result.successRate * 100).toFixed(1);
  return [
    '# Gate-1.5 Browser Viability',
    '',
    `- **fixture**: \`${fixturePath}\``,
    `- **decision**: \`${result.decision}\``,
    `- **successes**: ${result.successes}`,
    `- **failures**: ${result.failures}`,
    `- **success rate**: ${pct}%`,
    '',
    '> Pure dry-run harness. No live browser automation. (D-33.3.5)',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePath = resolve(process.cwd(), args.fixture);
  const jsonPath = resolve(process.cwd(), args.json);
  const mdPath = resolve(process.cwd(), args.md);

  const raw = await readFile(fixturePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.tasks)) throw new Error('fixture must have { tasks: [...] }');

  const { evaluateBrowserGate15 } = await importEvaluator();
  const result = evaluateBrowserGate15(data.tasks);

  const jsonBody = JSON.stringify({ ...result, fixture: args.fixture }, null, 2);
  const mdBody = buildMarkdown(result, args.fixture);

  await mkdir(dirname(jsonPath), { recursive: true });
  await mkdir(dirname(mdPath), { recursive: true });
  await writeFile(jsonPath, jsonBody + '\n');
  await writeFile(mdPath, mdBody + '\n');

  process.stdout.write(
    `[gate15] decision=${result.decision} rate=${(result.successRate * 100).toFixed(1)}% (${result.successes}/${result.successes + result.failures})\n`,
  );
  process.stdout.write(`[gate15] wrote ${jsonPath}\n`);
  process.stdout.write(`[gate15] wrote ${mdPath}\n`);
}

main().catch((e) => {
  process.stderr.write(`[gate15] error: ${e?.stack ?? e}\n`);
  process.exit(1);
});
