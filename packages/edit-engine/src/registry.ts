/**
 * Engine 注册表 — 单一入口创建 engine，避免散落。
 */

import { HashlineEngine } from './engines/hashline/index.js';
import { UnifiedDiffEngine } from './engines/unified-diff/index.js';
import type { EditEngine } from './types.js';

export function createDefaultEngine(): EditEngine {
  return new HashlineEngine();
}

export function createEngine(name: string): EditEngine {
  switch (name) {
    case 'hashline':
      return new HashlineEngine();
    case 'unified-diff':
      return new UnifiedDiffEngine();
    default:
      throw new Error(`Unknown edit engine: ${name}. Supported: hashline, unified-diff`);
  }
}
