/**
 * UnifiedDiffEngine — v1.0 stub
 *
 * 占位实现，**throw "not implemented"**。
 * 存在意义：
 * 1. 验证 EditEngine 抽象可承载多实现
 * 2. 未来切换时 0 改 LLM prompt 之外代码
 * 3. Sprint 0.1 单测能 mock 2 个 engine
 *
 * v1.0.x 启用（如果 hashline 出现真瓶颈）；v2.0 之前不动。
 */

import type { ApplyResult, EditEngine, EditIntent, FileContent } from '../../types.js';

export class UnifiedDiffEngine implements EditEngine {
  readonly name = 'unified-diff';

  format(_intent: EditIntent): string {
    throw new Error('UnifiedDiffEngine.format: not implemented (v1.0 stub)');
  }

  apply(_target: FileContent, _patch: string): ApplyResult {
    return {
      ok: false,
      error: {
        kind: 'unsupported',
        reason:
          'UnifiedDiffEngine.apply: not implemented in v1.0. Use HashlineEngine or set ENGINE=hashline explicitly.',
      },
    };
  }
}
