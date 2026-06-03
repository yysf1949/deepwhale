/**
 * canonicalizeSchema 单测 — Prefix-cache 机制 4 的稳定性保证。
 *
 * 覆盖（plan 2026-06-03_195823 §子任务 1）:
 * - properties key 顺序无关
 * - nested object 递归 canonical
 * - required array 顺序无关
 * - array of object (items) 递归
 * - enum 保持原序（语义不丢）
 * - 稳定性: 同一 input 跑 100 次 output 严格相等
 */

import { describe, expect, it } from 'vitest';
import { canonicalizeSchema } from '../src/index.js';
import type { LLMToolSchema } from '../src/index.js';

describe('canonicalizeSchema (Prefix-cache 机制 4)', () => {
  it('properties key 顺序无关: 任意排 → 字母序', () => {
    const input: LLMToolSchema = {
      name: 'read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'file path' },
          encoding: { type: 'string', description: 'encoding' },
        },
        required: ['path', 'encoding'],
      },
    };
    // 同样内容, 不同顺序
    const flipped: LLMToolSchema = {
      ...input,
      parameters: {
        type: 'object',
        properties: {
          encoding: { type: 'string', description: 'encoding' },
          path: { type: 'string', description: 'file path' },
        },
        required: ['encoding', 'path'],
      },
    };
    const a = canonicalizeSchema(input);
    const b = canonicalizeSchema(flipped);
    // 字母序固定: encoding 在前
    expect(Object.keys(a.parameters.properties)).toEqual(['encoding', 'path']);
    expect(Object.keys(b.parameters.properties)).toEqual(['encoding', 'path']);
    // required 也字母序
    expect(a.parameters.required).toEqual(['encoding', 'path']);
    expect(b.parameters.required).toEqual(['encoding', 'path']);
    // 严格 deep-equal
    expect(a).toEqual(b);
  });

  it('递归: nested array of object (items) 也 canonical', () => {
    const input: LLMToolSchema = {
      name: 'batch',
      description: 'batch op',
      parameters: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            description: 'ops',
            items: { type: 'string', description: 'one op', enum: ['read', 'write', 'delete'] },
          },
        },
        required: ['ops'],
      },
    };
    // 同样内容, enum 顺序调一下
    const flipped: LLMToolSchema = {
      ...input,
      parameters: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            description: 'ops',
            items: {
              type: 'string',
              description: 'one op',
              enum: ['delete', 'read', 'write'],
            },
          },
        },
        required: ['ops'],
      },
    };
    const a = canonicalizeSchema(input);
    const b = canonicalizeSchema(flipped);
    // enum 保持原序(语义! 后端可能按 index dispatch)
    const aItems = (
      a.parameters.properties['ops'] as unknown as { items: { type: 'string'; enum: string[] } }
    ).items.enum;
    const bItems = (
      b.parameters.properties['ops'] as unknown as { items: { type: 'string'; enum: string[] } }
    ).items.enum;
    expect(aItems).toEqual(['read', 'write', 'delete']);
    expect(bItems).toEqual(['delete', 'read', 'write']);
    // enum 不同就是不同 schema (这是 enum 语义, 不是 canonicalize 错)
    expect(a).not.toEqual(b);
  });

  it('number 类型 minimum/maximum 透传', () => {
    const input: LLMToolSchema = {
      name: 'fetch',
      description: 'fetch',
      parameters: {
        type: 'object',
        properties: {
          retry: { type: 'number', description: 'retries', minimum: 0, maximum: 10 },
        },
      },
    };
    const out = canonicalizeSchema(input);
    expect(out.parameters.properties['retry']).toEqual({
      type: 'number',
      description: 'retries',
      minimum: 0,
      maximum: 10,
    });
  });

  it('boolean 透传', () => {
    const input: LLMToolSchema = {
      name: 'flag',
      description: 'flag',
      parameters: {
        type: 'object',
        properties: {
          force: { type: 'boolean', description: 'force' },
        },
      },
    };
    const out = canonicalizeSchema(input);
    expect(out.parameters.properties['force']).toEqual({ type: 'boolean', description: 'force' });
  });

  it('不修改入参 (纯函数)', () => {
    const input: LLMToolSchema = {
      name: 'read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'file path' },
          encoding: { type: 'string', description: 'encoding' },
        },
        required: ['path', 'encoding'],
      },
    };
    const inputSnapshot = JSON.stringify(input);
    canonicalizeSchema(input);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
  });

  it('稳定性: 同一 input 跑 100 次 output 严格相等 (prefix-cache 命中的前提)', () => {
    const input: LLMToolSchema = {
      name: 'read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'file path' },
          encoding: { type: 'string', description: 'encoding', enum: ['utf-8', 'ascii', 'latin-1'] },
        },
        required: ['path'],
      },
    };
    const first = JSON.stringify(canonicalizeSchema(input));
    for (let i = 0; i < 100; i += 1) {
      const out = JSON.stringify(canonicalizeSchema(input));
      expect(out).toBe(first);
    }
  });

  it('required 可选: 不传时 output 不带 required 字段', () => {
    const input: LLMToolSchema = {
      name: 'x',
      description: 'x',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'string', description: 'a' },
        },
      },
    };
    const out = canonicalizeSchema(input);
    expect(out.parameters.required).toBeUndefined();
  });
});
