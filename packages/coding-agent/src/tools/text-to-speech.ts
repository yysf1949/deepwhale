/**
 * text_to_speech 工具 — 写 text stub 到 <rootDir>/tts/out-<ts>.wav (D-30.4.2, 2026-06-07).
 *
 * 拍板 (D-30.4): 跟 15 工具 1:1 同形态 (Tool class, schema JSON object,
 *   ToolResult success/error union). 默认写到 ~/.deepwhale/tts/out-<ts>.wav
 *   (text stub, 真接 edge-TTS 留 D-30.4.5+). rootDir 注入 (跟 plan / todo
 *   store 1:1 形态, 测试用 tmpdir).
 * - text: 必传
 * - voice: 可选 (留 stub, edge-TTS 集成后透传)
 * - outputPath: 可选, 不传 = <rootDir>/tts/out-<ts>.wav
 * - 0 改业务, 5 红线 0 触碰
 * - risk: medium (写本地文件)
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { deepwhaleRoot } from '../util/deepwhale-paths.js';

export interface TextToSpeechOptions {
  /** Root dir for default tts/ output. Defaults to ~/.deepwhale/. */
  readonly rootDir?: string;
}

export class TextToSpeechTool implements Tool {
  readonly name = 'text_to_speech' as ToolName;
  readonly description =
    'Convert text to speech audio (writes text stub to <rootDir>/tts/out-<ts>.wav; edge-TTS integration pending D-30.4.5+). Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to speak' },
      voice: { type: 'string', description: 'Voice id (optional, reserved for edge-TTS)' },
      outputPath: { type: 'string', description: 'Override output file path' },
    },
    required: ['text'],
  };

  constructor(private readonly options: TextToSpeechOptions = {}) {}

  private defaultPath(): string {
    const root = this.options.rootDir ?? deepwhaleRoot();
    return join(root, 'tts', `out-${Date.now()}.wav`);
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const text = input['text'];
    const outputPath = input['outputPath'];
    const voice = input['voice'];

    if (typeof text !== 'string' || text.length === 0) {
      return { success: false, content: '', error: 'invalid-input: text is required' };
    }

    const finalPath = typeof outputPath === 'string' && outputPath.length > 0
      ? outputPath
      : this.defaultPath();

    try {
      await fs.mkdir(join(finalPath, '..'), { recursive: true });
      // Stub: write text to file (no real TTS until edge-TTS integration).
      await fs.writeFile(finalPath, text, 'utf8');
      return {
        success: true,
        content: `wrote text stub to ${finalPath} (edge-TTS integration pending)`,
        meta: { path: finalPath, voice: typeof voice === 'string' ? voice : undefined },
      };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `tts error: ${e instanceof Error ? e.message : String(e)}`,
        meta: { path: finalPath },
      };
    }
  }
}

export const textToSpeech = new TextToSpeechTool();
