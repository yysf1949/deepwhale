/**
 * D-30.1δ.1: memory store — MEMORY.md / USER.md 读写 + 追加.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../../src/util/memory-store.js';

describe('memory store (D-30.1δ.1)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-mem-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates MEMORY.md and USER.md on first read', async () => {
    const store = new MemoryStore(dir);
    expect(await store.readMemory()).toBe('');
    expect(await store.readUser()).toBe('');
    // Files should now exist as 0-byte placeholders
    expect(readFileSync(join(dir, 'memory', 'MEMORY.md'), 'utf8')).toBe('');
    expect(readFileSync(join(dir, 'memory', 'USER.md'), 'utf8')).toBe('');
  });

  it('appends to MEMORY.md with timestamp block', async () => {
    const store = new MemoryStore(dir);
    await store.appendMemory('user prefers concise answers');
    const content = await store.readMemory();
    expect(content).toContain('user prefers concise answers');
    expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}T/m);
  });

  it('appends to USER.md in list format', async () => {
    const store = new MemoryStore(dir);
    await store.appendUser('frontend engineer');
    await store.appendUser('works on AI agents');
    const content = await store.readUser();
    expect(content).toContain('- frontend engineer');
    expect(content).toContain('- works on AI agents');
  });

  it('multiple memory appends accumulate', async () => {
    const store = new MemoryStore(dir);
    await store.appendMemory('first fact');
    await store.appendMemory('second fact');
    const content = await store.readMemory();
    expect(content).toContain('first fact');
    expect(content).toContain('second fact');
  });
});
