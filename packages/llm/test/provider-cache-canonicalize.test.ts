/**
 * D-33.1.3 — provider cache contract (canonicalize-schema) companion test.
 *
 * 拍板: 把 master plan A.2 "canonicalizeSchema 确定性" 断言 pin 住, 跟
 * provider-cache-contract.test.ts 互补. 既有 canonicalize-schema.test.ts 覆盖
 * properties / required / enum 顺序无关 + 100 次稳定性, 这条新测试用 master
 * plan 字面 shape 简化版 (顶层 properties key 排序) 直接断言确定性.
 */
import { describe, expect, it } from 'vitest';
import { canonicalizeSchema } from '../src/canonicalize-schema.js';
import type { LLMToolSchema } from '../src/types.js';

describe('provider cache contract — canonicalizeSchema determinism (D-33.1.3)', () => {
  it('sorts top-level properties alphabetically regardless of input order', () => {
    const input: LLMToolSchema = {
      name: 'example',
      description: 'example',
      parameters: {
        type: 'object',
        properties: {
          b: { type: 'boolean', description: 'b' },
          a: { type: 'boolean', description: 'a' },
        },
      },
    };
    const out = canonicalizeSchema(input);
    expect(Object.keys(out.parameters.properties)).toEqual(['a', 'b']);
  });
});
