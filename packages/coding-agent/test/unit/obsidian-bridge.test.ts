import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObsidianBridge } from '../../src/skills/obsidian-bridge.js';

describe('obsidian_bridge', () => {
  let vault = '';
  beforeEach(async () => {
    vault = await fs.mkdtemp(join(tmpdir(), 'obs-'));
    await fs.writeFile(join(vault, 'note1.md'), '# Hello\nWorld body');
    await fs.writeFile(join(vault, 'note2.md'), '# Second\nAnother body');
    await fs.mkdir(join(vault, 'sub'), { recursive: true });
    await fs.writeFile(join(vault, 'sub', 'note3.md'), '# Third\nSub body');
  });
  afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }); });

  it('listNotes enumerates vault md files', async () => {
    const bridge = new ObsidianBridge({ vaultPath: vault });
    const r = await bridge.listNotes();
    expect(r.length).toBe(3);
    expect(r.some(n => n.path.includes('note1.md'))).toBe(true);
  });

  it('readNote returns file content', async () => {
    const bridge = new ObsidianBridge({ vaultPath: vault });
    const r = await bridge.readNote('note1.md');
    expect(r).toContain('# Hello');
    expect(r).toContain('World body');
  });

  it('search finds notes by query', async () => {
    const bridge = new ObsidianBridge({ vaultPath: vault });
    const r = await bridge.search('Another');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].path).toContain('note2.md');
  });

  it('readNote rejects missing file', async () => {
    const bridge = new ObsidianBridge({ vaultPath: vault });
    await expect(bridge.readNote('nope.md')).rejects.toThrow(/not-found/);
  });
});
