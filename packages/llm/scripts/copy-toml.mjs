#!/usr/bin/env node
/**
 * @deepwhale/llm — copy-toml.mjs
 *
 * Sprint 1b.5 Step 2.5 (F2 拍板, review 2026-06-03):
 * `tsc -b` 不复制 .toml 资产到 dist/. DeepSeekClient / AnthropicClient 都按
 * `import.meta.url` 找同目录 `pricing.default.toml`, 没有 dist 资产 → loadPricingConfig
 * 静默失败 → cost 字段 absent → UI 显示 `cost ?` 误以为是用户缺配置.
 *
 * 修法: build 末尾跑这脚本, 从 src/pricing.default.toml 复制到 dist/pricing.default.toml.
 * 跨平台 (用 Node.js fs + path, 不用 cp).
 *
 * 错误行为:
 * - src 缺文件 → 抛错 (build fail, 不**静默** ship 缺资产)
 * - dist 缺目录 → mkdir -p
 * - 复制后内容**必须**一致 (用 sha256 验, 防止"复制失败但脚本 exit 0" 假绿)
 *
 * 设计原则 (R7 拍板 2026-06-03):
 * - 不**静默** fallback 到 hardcode pricing, 缺资产时 build fail
 * - 不**静默** skip copy, 一致性检查必须**真**做
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const srcPath = resolve(repoRoot, 'src', 'pricing.default.toml');
const distDir = resolve(repoRoot, 'dist');
const distPath = resolve(distDir, 'pricing.default.toml');

if (!existsSync(srcPath)) {
  console.error(`[copy-toml] FAIL: source not found at ${srcPath}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  console.error(`[copy-toml] FAIL: dist dir not found at ${distDir} (run tsc -b first)`);
  process.exit(1);
}

const srcContent = readFileSync(srcPath, 'utf-8');
mkdirSync(distDir, { recursive: true });
writeFileSync(distPath, srcContent, 'utf-8');

// 一致性检查: SHA-256 必须匹配
const srcHash = createHash('sha256').update(srcContent).digest('hex');
const distContent = readFileSync(distPath, 'utf-8');
const distHash = createHash('sha256').update(distContent).digest('hex');
if (srcHash !== distHash) {
  console.error(`[copy-toml] FAIL: hash mismatch. src=${srcHash} dist=${distHash}`);
  process.exit(1);
}

const srcSize = statSync(srcPath).size;
console.log(`[copy-toml] OK: ${srcPath} -> ${distPath} (${srcSize} bytes, sha256=${srcHash.slice(0, 12)}...)`);
