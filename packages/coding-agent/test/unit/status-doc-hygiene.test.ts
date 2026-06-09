import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS = ['README.md', 'ROADMAP.md', 'docs/ROADMAP_DECISIONS.md'] as const;
const MOJIBAKE_MARKERS = ['鈥', '锛', '馃', '涓', '寮€', '褰', '鐨', '浠'];

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function currentStatusBlock(text: string): string {
  const match = text.match(/<!-- status:current:start -->([\s\S]*?)<!-- status:current:end -->/);
  if (!match) return '';
  return match[1] ?? '';
}

function isAsciiText(value: string): boolean {
  return Array.from(value).every((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  });
}

describe('status documentation hygiene (D-56)', () => {
  it('keeps public docs anchored by a plain current-status block', () => {
    for (const path of DOCS) {
      const text = readRepoFile(path);
      const block = currentStatusBlock(text);

      expect(block, `${path} missing current status block`).toContain('Current Status');
      expect(isAsciiText(block), `${path} status block should be ASCII-only`).toBe(true);
      const firstScreen = text.split(/\r?\n/).slice(0, 80).join('\n');
      for (const marker of MOJIBAKE_MARKERS) {
        expect(block, `${path} status block contains mojibake marker ${marker}`).not.toContain(marker);
        expect(firstScreen, `${path} first 80 lines contain mojibake marker ${marker}`).not.toContain(marker);
      }
    }
  });

  it('keeps README status aligned with machine-readable gate evidence', () => {
    const readme = currentStatusBlock(readRepoFile('README.md'));
    const gate2 = JSON.parse(readRepoFile('docs/superpowers/gate-2-long-horizon-live.json')) as {
      passed_live: boolean;
      registryProfile?: string;
      toolCalls: number;
    };
    const gate1Targets = JSON.parse(readRepoFile('docs/superpowers/gate-1-preferred-targets.json')) as {
      status: string;
      preferredTargets: unknown[];
      blocker?: string;
    };

    expect(readme).toContain('Branch: feature/d36-gate2-live');
    expect(readme).toContain('Package version line: 2.2.0');
    expect(readme).toContain(`Gate-2 live evidence: passed_live=${String(gate2.passed_live)}`);
    expect(readme).toContain(`registryProfile=${gate2.registryProfile ?? 'unknown'}`);
    expect(readme).toContain(`toolCalls=${gate2.toolCalls}`);
    expect(readme).toContain(`Gate-1 preferred status: ${gate1Targets.status}`);
    expect(readme).toContain('preferred-100k is blocked');
    expect(gate1Targets.preferredTargets).toHaveLength(0);
    expect(gate1Targets.blocker).toMatch(/no local 100K\+ target/i);
  });

  it('does not overclaim v1-v4 or default non-coding capability exposure', () => {
    const combined = DOCS.map((path) => readRepoFile(path)).join('\n');

    expect(combined).not.toMatch(/v1-v4 production complete/i);
    expect(combined).not.toMatch(/preferred-100k[^.\n]*passed/i);
    expect(combined).not.toMatch(/Browser[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/Desktop[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/Channel[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/media[^.\n]*(is|are) default-enabled/i);
    expect(combined).not.toMatch(/productivity[^.\n]*(is|are) default-enabled/i);
    expect(currentStatusBlock(readRepoFile('README.md'))).toContain(
      'Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.',
    );
    expect(currentStatusBlock(readRepoFile('README.md'))).toContain(
      'v1-v4 are capability milestones, not a production-complete claim.',
    );
  });
});
