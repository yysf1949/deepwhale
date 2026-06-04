/**
 * @deepwhale/coding-agent — 轻量 `.env` loader (项目根目录)
 *
 * 拍板 (Sprint 1c-revive-2-D-7 review, 2026-06-04):
 *   - 读项目根的 `.env` (用户**自己**负责放, 跟 .gitignore 一致不入仓)
 *   - 只补缺, 不覆盖 (`process.env[key] ??= value`)
 *     → CI / PowerShell `$env:VAR=...` / shell `export VAR=...` 优先级永远最高
 *     → 安全: 不会因为 .env 里的旧值误覆盖生产/CI 显式设的 key
 *   - 解析规则 (跟 dotenv 简化版一致, 不引 dep):
 *     - 空行 / `#` 注释跳过
 *     - `KEY=VALUE` 形式, `=` 第一次出现分界
 *     - VALUE 头尾成对 `"..."` 或 `'...'` → 去引号
 *     - `export KEY=...` 前缀 → 忽略前缀 (dotenv 兼容)
 *     - `KEY=` 后无值 → 设为空字符串 (但仍占位置, 不再被覆盖)
 *   - 文件不存在 / 读失败 → silent return (不抛, 不污染启动)
 *   - **不**读 `~/.deepwhale/.env` (那条路径是 user-managed secret store,
 *     跟 .env loader 职责分离 — 跟 llm/test 红线 1 一致: test 代码不直接读 secret 文件)
 *
 * 用法:
 *   - CLI 入口: `bin/deepwhale.js` 在 import dist 之前调一次
 *   - vitest setupFile: 跨包测试也用
 *   - 不用动 callers — 一行 import + 一行调用
 *
 * 不变量:
 *   - 不会 throw (加载失败当 .env 不存在处理)
 *   - 不会 log 任何 key 值 (跟 .env loader 红线一致: 永不 echo 凭据)
 *   - 同步实现, 不阻塞 — .env 一般 < 10 行, sync readFileSync 完全够
 *
 * @module @deepwhale/coding-agent/load-project-env
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 从项目根目录加载 `.env`, 补缺到 `process.env`.
 *
 * 拍板: 缺文件的 .env 不会报错 — silent skip, 跟生产/CI 行为保持一致.
 * 重复调用安全 — 第二次调时所有 key 都已存在 (`??=` 不会改), 实际是 no-op.
 *
 * @param cwd 解析 `.env` 路径的基准. 默认 `process.cwd()`. 显式传为了单测.
 */
export function loadProjectEnv(cwd: string = process.cwd()): void {
  const envPath = resolve(cwd, '.env');
  if (!existsSync(envPath)) return;

  let text: string;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    // 权限 / IO 失败 → 静默 (跟 dotenv 缺文件同语义, 不污染启动)
    return;
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;

    // 兼容 dotenv 的 `export KEY=...` 前缀 (PowerShell 不会写这个, 但 shell 可能)
    const stripped = line.startsWith('export ') ? line.slice('export '.length).trim() : line;

    const eq = stripped.indexOf('=');
    if (eq <= 0) continue; // 没 `=` / `=` 在最前 (无 key) → 跳过
    const key = stripped.slice(0, eq).trim();
    if (!key) continue;

    let value = stripped.slice(eq + 1).trim();
    // 头尾成对引号 → 去引号
    if (value.length >= 2) {
      const first = value[0]!;
      const last = value[value.length - 1]!;
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }

    // 拍板红线: 只补缺, 不覆盖. CI / shell `export` 永远优先.
    process.env[key] ??= value;
  }
}
