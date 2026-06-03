/**
 * edit_file 工具 — 通过 EditEngine 抽象修改文件
 *
 * Sprint 0.2 关键设计：edit_file 内部**不直接 import hashline**，
 * 只走 EditEngine 接口（createDefaultEngine 工厂）。
 * 这是 arch §2.3.2 抽象不破的核心证据。
 *
 * Sprint 0.2 范围：单文件 edit（patch 文本含 file path）
 * Sprint 1 扩展：Recovery 3-way + multi-block + 跨文件 batch
 */

import { promises as fs } from 'node:fs';
import { createDefaultEngine } from '@deepwhale/edit-engine';
import type { FileContent, EditEngine } from '@deepwhale/edit-engine';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export class EditFileTool implements Tool {
  readonly name = 'edit_file' as ToolName;
  readonly description =
    'Edit a local file using a hashline-format patch (3-hex TAG anchors). The patch is applied through the EditEngine abstraction — engine can be swapped via EDIT_ENGINE env var.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file to edit' },
      patch: { type: 'string', description: 'Hashline-format patch (use edit_engine to generate)' },
    },
    required: ['path', 'patch'],
  };

  /** Sprint 0.2 工厂：默认用 hashline，未来走 createEngine(name) */
  private engine(): EditEngine {
    return createDefaultEngine();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'];
    const patch = input['patch'];
    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }
    if (typeof patch !== 'string' || patch.length === 0) {
      return { success: false, content: '', error: 'invalid-input: patch is required' };
    }

    let original: string;
    try {
      original = await fs.readFile(path, 'utf8');
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string };
      if (e.code === 'ENOENT') {
        return { success: false, content: '', error: `not-found: ${path}` };
      }
      return { success: false, content: '', error: `io-error: ${e.message}`, meta: { path } };
    }

    const target: FileContent = { path, text: original };
    const result = this.engine().apply(target, patch);

    if (!result.ok) {
      return {
        success: false,
        content: '',
        error: `apply-${result.error.kind}: ${JSON.stringify(result.error)}`,
        meta: { engine: this.engine().name },
      };
    }

    // Sprint 1 加原子写（write to tmp + rename）。Sprint 0.2 简化：直接写。
    try {
      await fs.writeFile(path, result.newText, 'utf8');
      return {
        success: true,
        content: `Applied patch via ${result.engine}. ${original.length} → ${result.newText.length} bytes.`,
        meta: { path, engine: result.engine, bytesBefore: original.length, bytesAfter: result.newText.length },
      };
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string };
      return { success: false, content: '', error: `io-error: ${e.message}`, meta: { path } };
    }
  }
}
