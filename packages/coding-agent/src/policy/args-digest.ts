/**
 * Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * 稳定 JSON (key 排序) + sha256 前 12 位. 不存原始 args.
 *
 * 用户拍板 (2026-06-05): "argsDigest 不存原始 args, 先用稳定 JSON + sha256 前 12 位;
 *  reason 可以写自然语言, 但不能包含完整文件内容或 secret"
 *
 * 注: stable JSON 自己实现, 不引 fast-json-stable-stringify 等 dep, MVP 范围.
 *     实现注意: 走 string 拼接避免大量递归 JSON.parse/stringify 调用.
 */

import { createHash } from 'node:crypto';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function computeArgsDigest(args: Record<string, unknown>): string {
  const json = stableStringify(args);
  const hash = createHash('sha256').update(json, 'utf8').digest('hex');
  return `sha256:${hash.slice(0, 12)}`;
}
