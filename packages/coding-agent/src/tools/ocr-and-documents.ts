/**
 * ocr_and_documents 工具 — 2 action (D-31.3.4, 2026-06-08).
 *
 * 拍板: ocr 走 tesseract.js (lazy load, ~5s/page, async), extractText 走
 *   pdf-parse. 注入 ocr/extractor 函数 (默认 stub, 真实 tesseract 装 + 工作
 *   线程留 D-32+). Sandbox 限制: 大文件 (>10MB) 走 progress event.
 * - ocr:         image/PDF → text via tesseract.js
 * - extractText: PDF → text via pdf-parse
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读文件, 写本地 cache).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type OcrRunner = (filePath: string) => Promise<string>;
export type ExtractorRunner = (filePath: string) => Promise<string>;

const defaultOcr: OcrRunner = async () => { throw new Error('ocr: no ocr runner injected'); };
const defaultExtractor: ExtractorRunner = async () => { throw new Error('ocr: no extractor injected'); };

export class OcrAndDocumentsTool implements Tool {
  readonly name = 'ocr_and_documents' as ToolName;
  readonly description = 'OCR images (tesseract.js) and extract text from PDFs (pdf-parse). Low risk (read-only).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'ocr action', enum: ['ocr', 'extractText'] },
      filePath: { type: 'string', description: 'absolute file path' },
    },
    required: ['action', 'filePath'],
  };

  private readonly ocr: OcrRunner;
  private readonly extractor: ExtractorRunner;
  constructor(opts: { ocr?: OcrRunner; extractor?: ExtractorRunner } = {}) {
    this.ocr = opts.ocr ?? defaultOcr;
    this.extractor = opts.extractor ?? defaultExtractor;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const filePath = input['filePath'];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { success: false, content: '', error: 'invalid-input: filePath required' };
    }
    try {
      switch (action) {
        case 'ocr': {
          const text = await this.ocr(filePath);
          return { success: true, content: text, meta: { filePath, ocr: true } };
        }
        case 'extractText': {
          const text = await this.extractor(filePath);
          return { success: true, content: text, meta: { filePath, extract: true } };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `ocr error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const ocrAndDocuments = new OcrAndDocumentsTool();
