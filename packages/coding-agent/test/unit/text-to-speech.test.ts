/**
 * D-30.4.2: text_to_speech 工具.
 *
 * 拍板 (D-30.4): 跟 15 工具 1:1 同形态 (Tool class, schema JSON object,
 *   ToolResult success/error union). 默认写到 ~/.deepwhale/tts/out-<ts>.wav
 *   (text stub, 真接 edge-TTS 留 D-30.4.5+). rootDir 注入 (跟 plan / todo
 *   store 1:1 形态, 测试用 tmpdir).
 * - text: 必传
 * - voice: 可选
 * - outputPath: 可选, 不传 = ~/.deepwhale/tts/out-<ts>.wav
 * - risk: medium (写本地文件)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TextToSpeechTool } from '../../src/tools/text-to-speech.js';

describe('TextToSpeechTool (D-30.4.2)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'tts-test-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns error when text is missing', async () => {
    const tool = new TextToSpeechTool({ rootDir: dir });
    const r = await tool.execute({});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/text/);
    }
  });

  it('writes text to outputPath when provided', async () => {
    const tool = new TextToSpeechTool({ rootDir: dir });
    const out = join(dir, 'out.wav');
    const r = await tool.execute({ text: 'hello world', outputPath: out });
    expect(r.success).toBe(true);
    const written = await fs.readFile(out, 'utf8');
    expect(written).toBe('hello world');
  });

  it('creates default path under <rootDir>/tts/out-<ts>.wav', async () => {
    const tool = new TextToSpeechTool({ rootDir: dir });
    const r = await tool.execute({ text: 'auto path' });
    expect(r.success).toBe(true);
    expect(r.meta?.['path']).toMatch(/tts[\\/]+out-\d+\.wav$/);
    if (r.meta && typeof r.meta['path'] === 'string') {
      const written = await fs.readFile(r.meta['path'] as string, 'utf8');
      expect(written).toBe('auto path');
    }
  });

  it('creates the parent directory if missing', async () => {
    const tool = new TextToSpeechTool({ rootDir: dir });
    const nested = join(dir, 'a', 'b', 'c', 'out.wav');
    const r = await tool.execute({ text: 'nested', outputPath: nested });
    expect(r.success).toBe(true);
    const written = await fs.readFile(nested, 'utf8');
    expect(written).toBe('nested');
  });

  it('captures IO errors gracefully', async () => {
    const tool = new TextToSpeechTool({ rootDir: dir });
    // Simulate by passing an outputPath that points to an existing directory
    const r = await tool.execute({ text: 'x', outputPath: dir });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/tts/);
    }
  });

  it('exposes risk=medium', () => {
    const tool = new TextToSpeechTool({ rootDir: dir });
    expect(tool.risk).toBe('medium');
  });
});
