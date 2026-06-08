import { describe, it, expect, beforeEach } from 'vitest';
import { OcrAndDocumentsTool } from '../../src/tools/ocr-and-documents.js';

describe('ocr_and_documents', () => {
  let tool: OcrAndDocumentsTool;
  beforeEach(() => {
    tool = new OcrAndDocumentsTool({
      ocr: async (_path) => 'extracted text from image',
      extractor: async (_path) => 'extracted text from pdf',
    });
  });

  it('ocr returns recognized text', async () => {
    const r = await tool.execute({ action: 'ocr', filePath: '/tmp/a.png' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('extracted text from image');
  });

  it('extractText returns PDF text', async () => {
    const r = await tool.execute({ action: 'extractText', filePath: '/tmp/a.pdf' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('extracted text from pdf');
  });

  it('ocr rejects missing filePath', async () => {
    const r = await tool.execute({ action: 'ocr' });
    expect(r.success).toBe(false);
  });

  it('extractText rejects missing filePath', async () => {
    const r = await tool.execute({ action: 'extractText' });
    expect(r.success).toBe(false);
  });
});
