/**
 * vision_analyze 工具 — 本地图片 base64 + URL 透传 + vision runner (D-30.4.1, 2026-06-07).
 *
 * 拍板 (D-30.4): 跟 15 工具 1:1 同形态 (Tool class, schema JSON object,
 *   ToolResult success/error union). runner 注入 (默认 echo "[vision-stub] <source>",
 *   单测覆盖本地 base64 / URL / 错误). 真接 LLM vision 留 D-30.4.5+.
 * - source: 本地路径 → base64 data URL; URL → 透传
 * - prompt: 可选, 默认 "describe this image"
 * - 0 改业务, 5 红线 0 触碰
 * - risk: medium (网络/本地 IO)
 */

import { promises as fs } from 'node:fs';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

/** 注入的 vision 执行器 — 默认 echo stub, 单测覆盖 base64 / URL. */
export type VisionRunner = (source: string, prompt: string) => Promise<string>;

const defaultRunner: VisionRunner = async (source, prompt) =>
  `[vision-stub] prompt="${prompt}" source=${source}`;

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export class VisionAnalyzeTool implements Tool {
  readonly name = 'vision_analyze' as ToolName;
  readonly description =
    'Analyze an image (local path → base64 data URL, or URL → pass-through) using a vision-capable LLM. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Image local path or URL' },
      prompt: { type: 'string', description: 'Analysis prompt (default: "describe this image")' },
    },
    required: ['source'],
  };

  constructor(private readonly runner: VisionRunner = defaultRunner) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const source = input['source'];
    const prompt = input['prompt'];

    if (typeof source !== 'string' || source.length === 0) {
      return { success: false, content: '', error: 'invalid-input: source is required' };
    }
    const finalPrompt = typeof prompt === 'string' && prompt.length > 0 ? prompt : 'describe this image';

    try {
      let dataSource = source;
      if (!source.startsWith('http')) {
        const buf = await fs.readFile(source);
        const base64 = buf.toString('base64');
        dataSource = `data:${mimeFor(source)};base64,${base64}`;
      }
      const out = await this.runner(dataSource, finalPrompt);
      return { success: true, content: out, meta: { source: dataSource.slice(0, 32), prompt: finalPrompt } };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `vision error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}

export const visionAnalyze = new VisionAnalyzeTool();
