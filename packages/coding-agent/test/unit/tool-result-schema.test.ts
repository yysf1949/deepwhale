/**
 * D-33.1.1 — v1.0 normalized tool result contract.
 *
 * Master plan §A.0 + Task 1.1: 6 core tools' `execute()` 返回的 raw ToolResult
 * 可以用 `normalizeToolResult({ ok, summary, error? })` 包成 v1.0 NormalizedToolResult
 * (status / summary / artifacts / next_actions / recovery).
 *
 * 拍板: normalizeToolResult 是**纯函数**, 不替换 raw ToolResult 类型, 仅在 tool-loop
 * 边界消费时 wrap. 6 core tools 的 return type **不** 变.
 */
import { describe, expect, it } from 'vitest';
import { normalizeToolResult } from '../../src/tools/result-schema.js';
import { ReadFileTool } from '../../src/tools/read-file.js';
import { WriteFileTool } from '../../src/tools/write-file.js';
import { EditFileTool } from '../../src/tools/edit-file.js';
import { BashTool } from '../../src/tools/bash.js';
import { FindTool } from '../../src/tools/find.js';
import { GrepTool } from '../../src/tools/grep.js';

describe('normalizeToolResult', () => {
  it('returns observation and recovery fields for successful tools', () => {
    expect(normalizeToolResult({ ok: true, summary: 'read 3 lines' })).toEqual({
      status: 'ok',
      summary: 'read 3 lines',
      artifacts: [],
      next_actions: [],
      recovery: null,
    });
  });

  it('returns recovery guidance for failed tools', () => {
    expect(normalizeToolResult({ ok: false, summary: 'missing file', error: 'ENOENT' })).toEqual({
      status: 'error',
      summary: 'missing file',
      artifacts: [],
      next_actions: [],
      recovery: {
        root_cause_hint: 'ENOENT',
        safe_retry: false,
        stop_condition: 'input must change before retry',
      },
    });
  });
});

describe('tool result normalization across 6 core tools (D-33.1.1)', () => {
  const allTools = [ReadFileTool, WriteFileTool, EditFileTool, BashTool, FindTool, GrepTool];

  it("each tool's execute output can be normalized into the v1.0 contract", async () => {
    for (const ToolClass of allTools) {
      const tool = new ToolClass();
      const result = await tool.execute({ path: 'D:/this/path/definitely/does/not/exist/12345.xyz' });
      // raw.content 可能为空 (e.g. WriteFileTool 不写返回) — 走 result.error / 默认 placeholder
      const summary =
        result.content.split('\n')[0]?.trim() ||
        (result.success ? `${tool.name} ok` : `${tool.name} failed`);
      const normalized = normalizeToolResult({
        ok: result.success,
        summary,
        ...(result.success ? {} : { error: result.error ?? 'unknown' }),
      });
      expect(normalized.status).toBe(result.success ? 'ok' : 'error');
      expect(normalized.summary.length).toBeGreaterThan(0);
    }
  });
});
