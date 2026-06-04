/**
 * vitest setupFile — 跨包测试启动时跑一次.
 *
 * Sprint 1c-revive-2-D-7 (review, 2026-06-04): 跟 vitest.config.ts 顶部 import
 * 是同一份 (loadProjectEnv) — vitest 启动时**先** import config, **后**跑
 * setupFiles, 两次调 loadProjectEnv() 都幂等 (??= 决定第二次 no-op).
 *
 * 拍板走 setupFile 形式 (而不是 config 顶部 IIFE) 的原因:
 *   - vitest 文档推荐 setupFiles 干这活 (它比 config import 副作用更显式)
 *   - 跨包 (coding-agent / llm / edit-engine / core) 启动测试都覆盖
 *   - 跟推荐者给的样板一致
 *
 * 红线 (跟 llm/test 红线 1 一致): 只补缺, 不覆盖. CI / shell `export` 优先级
 * 永远最高 — .env 不会覆盖已有 process.env.
 *
 * 拍板: setupFile 路径在 vitest.config.ts 里用绝对 resolve() 锁住, import
 * 走 coding-agent/test 自己的相对路径 '../src/env/...' — vitest 跨包跑时
 * setupFile 仍按 setupFile 自己的 fs 位置解析 import (跟 vitest 启动 cwd 无关).
 */

import { loadProjectEnv } from '../src/env/load-project-env.js';

loadProjectEnv();
