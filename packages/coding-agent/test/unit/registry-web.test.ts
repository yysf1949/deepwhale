/**
 * D-30.1γ.4: Tool registry 注入 3 web tools.
 *
 * 拍板 (D-30.1γ): createDefaultRegistry 装 web_search / web_extract / browser_navigate,
 * 跟 6 工具 1:1 同形态 (先 register, 跟现有 6 个 1:1 顺序).
 */
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('tool registry (web tools, D-30.1γ.4)', () => {
  it('includes 3 web tools', () => {
    const registry = createDefaultRegistry();
    expect(registry.get('web_search')).toBeDefined();
    expect(registry.get('web_extract')).toBeDefined();
    expect(registry.get('browser_navigate')).toBeDefined();
  });

  it('registry total size = 6 + 3 = 9', () => {
    const registry = createDefaultRegistry();
    expect(registry.size()).toBe(9);
  });
});
