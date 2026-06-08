/**
 * profile_store — `~/.deepwhale/profiles/<name>/config.json` 1 source of truth (D-31.3.6, 2026-06-08).
 *
 * 拍板: 1 profile = 1 directory, 1 file `config.json`. 跟 D-30.3 cron-store
 *   `~/.deepwhale/cron/jobs.json` 1:1 协议 (file-system 持久化, 注入 dir).
 *   "current" 状态存 `~/.deepwhale/profiles/.current` 单字段文件 (跨进程可读).
 * - list:     列出所有 profile 名
 * - create:   创 profile + 写 config
 * - switch:   切 current → name, 返 config
 * - current:  返 current profile + config
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (写本地).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface ProfileConfig {
  model?: string;
  theme?: string;
  [key: string]: unknown;
}

export interface ProfileMeta {
  name: string;
  config: ProfileConfig;
}

export class ProfileStore {
  constructor(private readonly opts: { profilesDir: string }) {}

  private get profilesDir(): string { return this.opts.profilesDir; }
  private profileDir(name: string): string { return join(this.profilesDir, name); }
  private configPath(name: string): string { return join(this.profileDir(name), 'config.json'); }
  private currentPath(): string { return join(this.profilesDir, '.current'); }

  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.profilesDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort();
    } catch {
      return [];
    }
  }

  async create(name: string, config: ProfileConfig): Promise<void> {
    if (name.startsWith('.') || name.includes('/') || name.includes('\\')) {
      throw new Error(`invalid-profile-name: ${name}`);
    }
    await fs.mkdir(this.profileDir(name), { recursive: true });
    await fs.writeFile(this.configPath(name), JSON.stringify(config, null, 2), 'utf8');
  }

  async read(name: string): Promise<ProfileConfig> {
    try {
      const buf = await fs.readFile(this.configPath(name), 'utf8');
      return JSON.parse(buf) as ProfileConfig;
    } catch {
      throw new Error(`not-found: ${name}`);
    }
  }

  async switch(name: string): Promise<ProfileConfig> {
    const cfg = await this.read(name);
    await fs.mkdir(this.profilesDir, { recursive: true });
    await fs.writeFile(this.currentPath(), name, 'utf8');
    return cfg;
  }

  async current(): Promise<ProfileMeta | null> {
    let name: string;
    try {
      name = (await fs.readFile(this.currentPath(), 'utf8')).trim();
    } catch {
      return null;
    }
    if (!name) return null;
    try {
      const cfg = await this.read(name);
      return { name, config: cfg };
    } catch {
      return null;
    }
  }
}
