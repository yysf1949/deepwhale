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
 */
export function resolveSandboxRunnerFromEnv(
  config: SandboxEnvConfig,
  env: NodeJS.ProcessEnv = process.env,
): SandboxRunner {
  const mode = env['DEEPWHALE_SANDBOX'] ?? 'local';
  if (mode === 'docker') {
    const image = env['DEEPWHALE_DOCKER_IMAGE'] ?? 'node:22-alpine';
    const networkEnv = env['DEEPWHALE_DOCKER_NETWORK'] ?? 'none';
    const network: 'none' | 'bridge' = networkEnv === 'bridge' ? 'bridge' : 'none';
    return new DockerSandboxRunner({
      sandboxRoot: config.sandboxRoot,
      image,
      network,
      defaultTimeoutMs: DOCKER_DEFAULT_TIMEOUT_MS,
    });
  }
  // 显式非 docker → local
  return new LocalSandboxRunner();
}
