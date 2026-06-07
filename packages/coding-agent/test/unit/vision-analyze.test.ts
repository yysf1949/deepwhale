/**
 * D-30.4.1: vision_analyze 工具.
 *
 * 拍板 (D-30.4): 跟 15 工具 1:1 同形态 (Tool class, schema JSON object,
 *   ToolResult success/error union). runner 注入 (默认 echo, 单测覆盖本地
 *   base64 / URL / 错误). 真接 LLM vision 留 D-30.4.5+.
 * - source: 本地路径 → base64 data URL; URL → 透传
 * - prompt: 可选, 默认 "describe this image"
 * - risk: medium (网络/本地 IO)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VisionAnalyzeTool, type VisionRunner } from '../../src/tools/vision-analyze.js';

describe('VisionAnalyzeTool (D-30.4.1)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vision-test-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns error when source is missing', async () => {
    const tool = new VisionAnalyzeTool();
    const r = await tool.execute({});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/source/);
    }
  });

  it('reads local file and converts to base64 data URL', async () => {
    const file = join(dir, 'img.png');
    await fs.writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const seen: Array<{ source: string; prompt: string }> = [];
    const runner: VisionRunner = async (source, prompt) => {
      seen.push({ source, prompt });
      return 'a cat';
    };
    const tool = new VisionAnalyzeTool(runner);
    const r = await tool.execute({ source: file, prompt: 'what is this?' });
    expect(r.success).toBe(true);
    expect(r.content).toBe('a cat');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.source).toMatch(/^data:image\/png;base64,/);
    expect(seen[0]!.source).toContain(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'));
    expect(seen[0]!.prompt).toBe('what is this?');
  });

  it('treats .jpg extension as image/jpeg', async () => {
    const file = join(dir, 'pic.jpg');
    await fs.writeFile(file, Buffer.from([0xff, 0xd8]));
    const seen: string[] = [];
    const runner: VisionRunner = async (s) => {
      seen.push(s);
      return 'ok';
    };
    const tool = new VisionAnalyzeTool(runner);
    await tool.execute({ source: file });
    expect(seen[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('passes URL through unchanged', async () => {
    const seen: string[] = [];
    const runner: VisionRunner = async (s) => {
      seen.push(s);
      return 'remote result';
    };
    const tool = new VisionAnalyzeTool(runner);
    const r = await tool.execute({ source: 'https://example.com/cat.png' });
    expect(r.success).toBe(true);
    expect(r.content).toBe('remote result');
    expect(seen[0]).toBe('https://example.com/cat.png');
  });

  it('uses default prompt when none given', async () => {
    let gotPrompt = '';
    const runner: VisionRunner = async (_s, prompt) => {
      gotPrompt = prompt;
      return 'x';
    };
    const tool = new VisionAnalyzeTool(runner);
    await tool.execute({ source: 'https://example.com/x.png' });
    expect(gotPrompt.length).toBeGreaterThan(0);
  });

  it('captures local file errors gracefully', async () => {
    const tool = new VisionAnalyzeTool(async () => 'unused');
    const r = await tool.execute({ source: join(dir, 'missing.png') });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/vision/);
    }
  });

  it('captures runner errors gracefully', async () => {
    const file = join(dir, 'ok.png');
    await fs.writeFile(file, Buffer.from([1, 2, 3]));
    const runner: VisionRunner = async () => {
      throw new Error('boom');
    };
    const tool = new VisionAnalyzeTool(runner);
    const r = await tool.execute({ source: file });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/boom/);
    }
  });

  it('exposes risk=medium', () => {
    const tool = new VisionAnalyzeTool();
    expect(tool.risk).toBe('medium');
  });
});
