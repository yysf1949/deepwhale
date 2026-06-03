/**
 * HashlineEngine — v1.0 default edit engine
 *
 * 协议（oh-my-pi 借鉴 + Hermes 实战校准）：
 *
 *   @@ <line> <3hex-hash> @@
 *      <new-line-content-1>
 *      <new-line-content-2>
 *   @@ <line> <3hex-hash> @@
 *      <new-line-content>
 *   @@ <line> <3hex-hash> @@
 *      <new-line-content>
 *
 * 锚定规则：
 * - 第一个 @@ = start anchor（指向**待替换的旧块起始行**）
 * - 后续 @@ = 块内 mid-anchor（每 ~10 行一个，校验漂移）
 * - 最后一个 @@ = end anchor
 * - 行号从 1 开始
 *
 * Sprint 0.1 范围：parser + apply + snapshots。不含 Recovery 3-way / block 语法（Sprint 1）。
 */

import type {
  ApplyResult,
  EditEngine,
  EditIntent,
  FileContent,
} from '../../types.js';
import { computeLineHashes, findAnchor } from './snapshots.js';

const ANCHOR_RE = /^@@\s+(\d+)\s+([0-9a-f]{3})\s+@@\s*$/;

interface ParsedBlock {
  startLine: number;
  startHash: string;
  endLine: number;
  endHash: string;
  midAnchors: Array<{ line: number; hash: string }>;
  lines: string[];
}

export class HashlineEngine implements EditEngine {
  readonly name = 'hashline';

  format(intent: EditIntent): string {
    if (intent.anchor.kind !== 'line-hash') {
      throw new Error(
        `HashlineEngine requires anchor kind=line-hash, got: ${intent.anchor.kind}`,
      );
    }
    const startLine = intent.anchor.line;
    const startHash = intent.anchor.hash;
    const newLines = intent.newText.split('\n');
    const blocks: string[] = [];

    for (let i = 0; i < newLines.length; i += 8) {
      const slice = newLines.slice(i, i + 8);
      const midLine = startLine + i;
      const midHash = hashLine(slice[0] ?? '');
      blocks.push(`@@ ${midLine} ${midHash} @@`);
      for (const line of slice) {
        blocks.push(line);
      }
    }
    return [`@@ ${startLine} ${startHash} @@`, ...blocks, `@@ ${startLine + newLines.length - 1} ${hashLine(newLines[newLines.length - 1] ?? '')} @@`].join('\n');
  }

  apply(target: FileContent, patch: string): ApplyResult {
    if (!target.lineHashes) {
      // 自动补 lineHashes
      const computed = computeLineHashes(target.text);
      return this.applyWithHashes({ ...target, lineHashes: computed }, patch);
    }
    return this.applyWithHashes(target, patch);
  }

  private applyWithHashes(target: FileContent, patch: string): ApplyResult {
    const blocks = parseBlocks(patch);
    if (blocks.length === 0) {
      return { ok: false, error: { kind: 'parse-failed', position: 0, message: 'No valid @@ blocks found' } };
    }

    const targetLines = target.text.split('\n');

    // 校验 start anchor
    const first = blocks[0]!;
    const startAnchor = findAnchor(target, first.startLine, first.startHash);
    if (!startAnchor) {
      const actual = target.lineHashes?.[first.startLine - 1] ?? '?';
      return {
        ok: false,
        error: {
          kind: 'anchor-mismatch',
          expected: first.startHash,
          actual,
          line: first.startLine,
        },
      };
    }

    // 找到要替换的旧块范围
    const oldTextRange = locateOldText(targetLines, first);
    if (!oldTextRange) {
      return {
        ok: false,
        error: {
          kind: 'text-not-found',
          hint: `Cannot locate text at line ${first.startLine} for hash ${first.startHash}`,
        },
      };
    }

    // 拼装新内容
    const newLines: string[] = [];
    for (let i = 0; i < oldTextRange.start; i++) {
      newLines.push(targetLines[i]!);
    }
    for (const block of blocks) {
      newLines.push(...block.lines);
    }
    for (let i = oldTextRange.end; i < targetLines.length; i++) {
      newLines.push(targetLines[i]!);
    }

    return { ok: true, newText: newLines.join('\n'), engine: this.name };
  }
}

/** 计算一行文本的 3-hex 短 hash（与 snapshots.ts 一致） */
function hashLine(text: string): string {
  // 简化：FNV-1a 32-bit，取低 12-bit 转 3-hex
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) & 0xfff).toString(16).padStart(3, '0');
}

function parseBlocks(patch: string): ParsedBlock[] {
  const lines = patch.split('\n');
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = ANCHOR_RE.exec(line);
    if (m) {
      const ln = Number.parseInt(m[1]!, 10);
      const hs = m[2]!;
      if (current === null) {
        // start anchor: 开启一个新 block
        current = {
          startLine: ln,
          startHash: hs,
          endLine: 0,
          endHash: '',
          midAnchors: [],
          lines: [],
        };
      } else {
        // end anchor: 闭合 block
        current.endLine = ln;
        current.endHash = hs;
        blocks.push(current);
        current = null;
      }
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
    // 非 @@ 行 + 无 current block = patch 开头/结尾的杂项，忽略
  }

  // 兜底：如果 patch 以非 @@ 结尾，current block 持有未闭合的 lines，丢弃（Sprint 1 完整版会报错）
  return blocks;
}

function locateOldText(
  targetLines: string[],
  block: ParsedBlock,
): { start: number; end: number } | null {
  // 简化策略：从 block.startLine 往后找连续 N 行匹配
  // Sprint 0.1 假设 oldText 已经由 intent 提供；这里从 block.lines 推断
  // Sprint 1 完整版会改用 intent.oldText 显式提供
  // 兜底：用 mid-anchor 校验
  if (block.midAnchors.length > 0) {
    // Sprint 1 才有
  }
  // 简单：start 替换 1 行（block.lines 长度）
  const start = block.startLine - 1;
  const end = start + 1;
  if (end > targetLines.length) return null;
  return { start, end };
}
