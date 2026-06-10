import type { Dirent } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { countSupportedLoc, type Gate1LocQualification } from './gate1.js';

export type Gate1TargetInventoryStatus = 'none' | 'below-minimum' | 'minimum-only' | 'preferred-available';

export interface Gate1TargetInventoryOptions {
  targetsRoot: string;
  minimumLoc?: number;
  preferredLoc?: number;
  maxDepth?: number;
}

export interface Gate1TargetSummary {
  name: string;
  path: string;
  loc: number;
  supportedFiles: number;
  locQualification: Gate1LocQualification;
}

export interface Gate1TargetInventoryReport {
  generatedAt: string;
  targetsRoot: string;
  minimumLoc: number;
  preferredLoc: number;
  status: Gate1TargetInventoryStatus;
  targets: Gate1TargetSummary[];
  preferredTargets: Gate1TargetSummary[];
  minimumTargets: Gate1TargetSummary[];
  bestAvailable?: Gate1TargetSummary;
  blocker?: string;
}

export async function inventoryGate1Targets(
  options: Gate1TargetInventoryOptions,
): Promise<Gate1TargetInventoryReport> {
  const targetsRoot = resolve(options.targetsRoot);
  const minimumLoc = options.minimumLoc ?? 50_000;
  const preferredLoc = options.preferredLoc ?? 100_000;
  const maxDepth = options.maxDepth ?? 8;
  const targets: Gate1TargetSummary[] = [];

  let entries: Dirent[];
  try {
    entries = await readdir(targetsRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const path = resolve(targetsRoot, entry.name);
    const stats = await countSupportedLoc(path, maxDepth);
    targets.push({
      name: entry.name,
      path,
      loc: stats.loc,
      supportedFiles: stats.files,
      locQualification: qualifyTarget(stats.loc, minimumLoc, preferredLoc),
    });
  }

  targets.sort((a, b) => b.loc - a.loc || a.name.localeCompare(b.name));
  const preferredTargets = targets.filter((target) => target.locQualification === 'preferred-100k');
  const minimumTargets = targets.filter(
    (target) => target.locQualification === 'minimum-50k' || target.locQualification === 'preferred-100k',
  );
  const bestAvailable = targets[0];
  const status = inventoryStatus(targets, minimumTargets, preferredTargets);
  const report: Gate1TargetInventoryReport = {
    generatedAt: new Date().toISOString(),
    targetsRoot,
    minimumLoc,
    preferredLoc,
    status,
    targets,
    preferredTargets,
    minimumTargets,
  };
  if (bestAvailable) report.bestAvailable = bestAvailable;
  const blocker = blockerForStatus(status, preferredLoc, bestAvailable);
  if (blocker) report.blocker = blocker;
  return report;
}

export function renderGate1TargetInventoryMarkdown(report: Gate1TargetInventoryReport): string {
  const lines = [
    '# Gate-1 Preferred Target Inventory',
    '',
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
    `Targets root: ${report.targetsRoot}`,
    `Minimum LOC: ${report.minimumLoc}`,
    `Preferred LOC: ${report.preferredLoc}`,
    '',
    '## Summary',
    '',
    `- Total targets: ${report.targets.length}`,
    `- Minimum-or-better targets: ${report.minimumTargets.length}`,
    `- Preferred targets: ${report.preferredTargets.length}`,
  ];
  if (report.bestAvailable) {
    lines.push(
      `- Best available: ${report.bestAvailable.name} (${report.bestAvailable.loc} LOC, ${report.bestAvailable.locQualification})`,
    );
  }
  if (report.blocker) {
    lines.push('', '## Blocker', '', `- ${report.blocker}`);
  }
  lines.push('', '## Targets', '');
  if (report.targets.length === 0) {
    lines.push('- (none)');
  } else {
    for (const target of report.targets) {
      lines.push(
        `- ${target.name}: ${target.loc} LOC, ${target.supportedFiles} supported files, ${target.locQualification}`,
      );
    }
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- `minimum-50k` is enough for the formal Gate-1 minimum.',
    '- `preferred-100k` is required before claiming preferred Code Intel maturity.',
    '- This inventory does not itself prove Gate-1 pass on a target; it only proves target availability.',
  );
  return `${lines.join('\n')}\n`;
}

export async function writeGate1TargetInventoryReport(
  report: Gate1TargetInventoryReport,
  jsonPath: string,
  mdPath: string,
): Promise<void> {
  await mkdir(dirname(resolve(jsonPath)), { recursive: true });
  await mkdir(dirname(resolve(mdPath)), { recursive: true });
  await writeFile(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(resolve(mdPath), renderGate1TargetInventoryMarkdown(report), 'utf8');
}

function qualifyTarget(loc: number, minimumLoc: number, preferredLoc: number): Gate1LocQualification {
  if (loc < minimumLoc) return 'below-minimum';
  if (loc < preferredLoc) return 'minimum-50k';
  return 'preferred-100k';
}

function inventoryStatus(
  targets: ReadonlyArray<Gate1TargetSummary>,
  minimumTargets: ReadonlyArray<Gate1TargetSummary>,
  preferredTargets: ReadonlyArray<Gate1TargetSummary>,
): Gate1TargetInventoryStatus {
  if (targets.length === 0) return 'none';
  if (preferredTargets.length > 0) return 'preferred-available';
  if (minimumTargets.length > 0) return 'minimum-only';
  return 'below-minimum';
}

function blockerForStatus(
  status: Gate1TargetInventoryStatus,
  preferredLoc: number,
  bestAvailable: Gate1TargetSummary | undefined,
): string | undefined {
  if (status === 'preferred-available') return undefined;
  if (status === 'none') return 'no local Gate-1 target directories found';
  if (!bestAvailable) return `no local preferred Gate-1 target found for preferred ${preferredLoc} LOC evidence`;
  return `no local preferred Gate-1 target found; best local target is ${bestAvailable.name} with ${bestAvailable.loc} LOC, below preferred ${preferredLoc} LOC`;
}
