/**
 * Canonical Schema (Prefix-cache 机制 4)
 *
 * 借鉴自 Reasonix `schema_canonicalize.go:10-67` —— OAI function-calling
 * tool schema 在 build 前必须 key 顺序稳定, 否则 LLM 端 hash cache 抖动 →
 * prefix-cache 命中率归零。
 *
 * 关键不变量:
 * - object properties 字母序
 * - required 数组字母序
 * - enum 数组保持原序(enum 是有限值集合, 顺序是协议语义, 不能动)
 * - 递归: nested object / array of object / array items
 * - 纯函数 + 0 副作用 + 0 外部依赖
 *
 * Sprint 1b 范围: LLM 层, 不依赖 Tool 运行时类型
 * (canonicalize 是 LLM wire-level 概念, 归属 @deepwhale/llm)
 */

import type { LLMToolSchema, LLMToolParametersSchema, LLMToolParamSchema } from './types.js';

/**
 * 把任意顺序的 tool schema 变成 key 顺序稳定的等价 schema。
 *
 * 返回**新**对象(深拷贝), 不修改入参。
 * 同一 input 跑 N 次, output 严格相等(稳定性是 prefix-cache 的命根子)。
 *
 * @example
 *   canonicalizeSchema({
 *     name: 'read',
 *     description: '...',
 *     parameters: {
 *       type: 'object',
 *       properties: { path: {...}, encoding: {...} },
 *       required: ['encoding', 'path'],  // 任意顺序
 *     },
 *   })
 *   // =>
 *   // properties: { encoding: {...}, path: {...} }  字母序
 *   // required: ['encoding', 'path']                 字母序
 */
export function canonicalizeSchema(schema: LLMToolSchema): LLMToolSchema {
  return {
    name: schema.name,
    description: schema.description,
    parameters: canonicalizeParameters(schema.parameters),
  };
}

function canonicalizeParameters(p: LLMToolParametersSchema): LLMToolParametersSchema {
  // properties 字母序
  const sortedPropKeys = Object.keys(p.properties).sort();
  const sortedProperties: Record<string, LLMToolParamSchema> = {};
  for (const k of sortedPropKeys) {
    const v = p.properties[k];
    if (v !== undefined) {
      sortedProperties[k] = canonicalizeParam(v);
    }
  }

  // required 字母序(如果存在)
  // LLMToolParametersSchema.required 是 readonly, 必须构造新对象
  const out: { type: 'object'; properties: Record<string, LLMToolParamSchema>; required?: ReadonlyArray<string> } = {
    type: 'object',
    properties: sortedProperties,
  };
  if (p.required !== undefined) {
    out.required = [...p.required].sort();
  }
  return out;
}

function canonicalizeParam(p: LLMToolParamSchema): LLMToolParamSchema {
  // 联合 narrowing: LLMToolParamSchema 没有 type='object' (object 用 LLMToolParametersSchema)
  // 这里只处理 string/number/boolean/array
  if (p.type === 'array') {
    return { type: 'array', description: p.description, items: canonicalizeParam(p.items) };
  }
  if (p.type === 'string') {
    if (p.enum !== undefined) {
      // enum 保持原序: enum 是有限集合, 顺序是协议语义(后端可能按 index dispatch)
      return { type: 'string', description: p.description, enum: [...p.enum] };
    }
    return { type: 'string', description: p.description };
  }
  if (p.type === 'number') {
    const out: { type: 'number'; description: string; minimum?: number; maximum?: number } = {
      type: 'number',
      description: p.description,
    };
    if (p.minimum !== undefined) out.minimum = p.minimum;
    if (p.maximum !== undefined) out.maximum = p.maximum;
    return out;
  }
  // boolean
  return { type: 'boolean', description: p.description };
}
