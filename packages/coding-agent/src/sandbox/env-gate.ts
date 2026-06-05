/**
 * env gate helper — 从环境变量解析 sandbox 配置
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05). MVP 入口, 跟 BashTool 解耦, 后续可换 config.toml.
 *
 * 支持的 env:
 * - DEEPWHALE_SANDBOX=local|docker — 选 runner. 缺省 = local (BashTool 现状行为)
 * - DEEPWHALE_DOCKER_IMAGE — 容器镜像. 缺省 = 'node:22-alpine'
 * - DEEPWHALE_DOCKER_NETWORK=none|bridge — 容器网络. 缺省 = 'none' 禁网
 *
 * 安全: 不传 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN 等敏感 env 到 docker 容器
 * (DockerSandboxRunner 默认只透 process.env, **不** 注入 .env / API key).
 */

import type { SandboxRunner } from './types.js';
import { LocalSandboxRunner } from './local-runner.js';
import { DockerSandboxRunner, DOCKER_DEFAULT_TIMEOUT_MS } from './docker-runner.js';

export interface SandboxEnvConfig {
  readonly sandboxRoot: string;
}

/**
 * 解析 env → 选 sandbox runner. 缺省 = LocalSandboxRunner (BashTool 现状).
 * env DEEPWHALE_SANDBOX=docker 时返 DockerSandboxRunner, 镜像/网络用对应 env.
 *
 * Sprint 1c-revive-3-D-12 review P1 修复 (2026-06-05): 严格 enum, 未知值 throw.
 * 之前 `mode !== 'docker'` 全部 fallback local, 拼错 `dokcer` 之类会静默本地执行
 * — fail-open, 安全红线. 修法: 只接受 unset / `local` / `docker`, 其他值抛错.
 * 入口 (CLI / REPL 启动) 应当把 throw 转到 stderr + exit 1, 不静默.
 */
export function resolveSandboxRunnerFromEnv(
  config: SandboxEnvConfig,
  env: NodeJS.ProcessEnv = process.env,
): SandboxRunner {
  const raw = env['DEEPWHALE_SANDBOX'];
  // unset / 空字符串 = 默认 local (跟 README 一致)
  if (raw === undefined || raw === '') {
    return new LocalSandboxRunner();
  }
  if (raw === 'local') {
    return new LocalSandboxRunner();
  }
  if (raw === 'docker') {
    const image = env['DEEPWHALE_DOCKER_IMAGE'] ?? 'node:22-alpine';
    // Sprint 1c-revive-4-D-20.1 (2026-06-05) review-fix: 跟 DEEPWHALE_SANDBOX 一致
    // fail-closed, 不静默 fallback. 之前 raw !== 'bridge' 静默 → 'none', 拼错
    // 'bridgee' 之类会"以防网跑" (跟用户本意"放行"相反, 安全红线).
    const networkEnv = env['DEEPWHALE_DOCKER_NETWORK'];
    if (networkEnv !== undefined && networkEnv !== '' && networkEnv !== 'none' && networkEnv !== 'bridge') {
      throw new Error(
        `invalid DEEPWHALE_DOCKER_NETWORK=${JSON.stringify(networkEnv)}, expected unset|none|bridge`,
      );
    }
    const network: 'none' | 'bridge' = networkEnv === 'bridge' ? 'bridge' : 'none';
    return new DockerSandboxRunner({
      sandboxRoot: config.sandboxRoot,
      image,
      network,
      defaultTimeoutMs: DOCKER_DEFAULT_TIMEOUT_MS,
    });
  }
  // 未知值 — fail-closed. 抛出的 message 拼齐提示, 入口能直接 stderr 打印给用户.
  throw new Error(`invalid DEEPWHALE_SANDBOX=${JSON.stringify(raw)}, expected unset|local|docker`);
}
