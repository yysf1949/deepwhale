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

import type { ApplyResult, EditEngine, EditIntent, FileContent } from '../../types.js';
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
      throw new Error(`HashlineEngine requires anchor kind=line-hash, got: ${intent.anchor.kind}`);
    }
    const startLine = intent.anchor.line;
    const startHash = intent.anchor.hash;
    const newLines = intent.newText.split('\n');

    // Sprint 0.1 协议（简化版）：
    //   @@ <line> <hash> @@
    //   <new-line-1>
    //   <new-line-2>
    //   ...
    // mid-anchor（每 ~10 行一个校验点）挪到 Sprint 1，因为本版 parseBlocks
    // 把任何相邻 @@ 配对成 start+end，会把首 block 的 lines 吃成空数组。
    // end-anchor 同样隐式化：下一个 @@ 即 block 边界，patch 末尾的最后一个
    // block 持有余下所有非 @@ 行。
    return [`@@ ${startLine} ${startHash} @@`, ...newLines].join('\n');
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
      return {
        ok: false,
        error: { kind: 'parse-failed', position: 0, message: 'No valid @@ blocks found' },
      };
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
      if (current !== null) {
        // 任何相邻 @@ 都闭合当前 block（end 隐式 = 下一个 anchor）
        // Sprint 1 会改成显式 end-anchor + mid-anchor 校验
        current.endLine = ln;
        current.endHash = hs;
        blocks.push(current);
      }
      current = {
        startLine: ln,
        startHash: hs,
        endLine: 0,
        endHash: '',
        midAnchors: [],
        lines: [],
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
    // 非 @@ 行 + 无 current block = patch 开头/结尾的杂项，忽略
  }

  // 兜底：Sprint 0.2 简化版接受"无显式 end-anchor 的末尾 block"。
  // 协议：end 隐式 = 下一个 @@ 或 patch 末尾。
  // Sprint 1 会改成"end-anchor 缺失则报错"以检测 patch 截断。
  if (current !== null) {
    blocks.push(current);
  }
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
