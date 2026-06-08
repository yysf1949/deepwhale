/**
 * obsidian_bridge skill — read-only Obsidian vault bridge (D-31.4.3, 2026-06-08).
 *
 * 拍板: read-only, 走 vault 路径 env `OBSIDIAN_VAULT_PATH`. 0 写 (write 留
 *   D-32+). forward-slash 路径兼容 Windows (windowsPath → posixPath 转换).
 *   跟 D-30.5 `requesting-code-review` skill 同形态 (engine module, 非
 *   Hermes-skill 格式).
 * - listNotes: 递归 walk vault, 返 {path, title, mtime}[]
 * - readNote:  读指定 path 内容
 * - search:    grep 全文 (case-insensitive substring), 返 [{path, snippet}]
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读).
 */

import { promises as fs } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

export interface ObsidianNote {
  path: string;
  title: string;
  mtime: number;
}

export interface ObsidianHit {
  path: string;
  snippet: string;
}

export class ObsidianBridge {
  constructor(private readonly opts: { vaultPath: string }) {}

  private get vaultPath(): string { return this.opts.vaultPath; }

  /** Convert native path to posix for cross-platform keying. */
  private toPosix(p: string): string {
    return p.split(sep).join(posix.sep);
  }

  async listNotes(): Promise<ObsidianNote[]> {
    const out: ObsidianNote[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        // D-31.4 review B-3 (2026-06-08): skip hidden dirs (e.g. `.obsidian/`
        // plugin cache, `.git/`, `.trash/`). 它们 不 是 user note, walk
        // 它们 = 浪费 I/O, 污染 listNotes 结果.
        if (e.isDirectory() && !e.name.startsWith('.')) {
          await walk(full);
        } else if (
          e.isFile() &&
          // D-31.4 review B-6 (2026-06-08): skip symlinks, 防 walk 进入 infinite
          // loop (例如 vault 内 symlink 指向 自己). `Dirent.isSymbolicLink()`
          // 跟 `Dirent.isFile()` 是 mutually exclusive on most platforms, 但
          // 检查 显式 更 安全.
          !e.isSymbolicLink() &&
          e.name.endsWith('.md')
        ) {
          const stat = await fs.stat(full);
          const rel = this.toPosix(relative(this.vaultPath, full));
          const title = e.name.replace(/\.md$/, '');
          out.push({ path: rel, title, mtime: stat.mtimeMs });
        }
      }
    };
    await walk(this.vaultPath);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readNote(relPath: string): Promise<string> {
    const safe = this.toPosix(relPath);
    if (safe.includes('..')) throw new Error('invalid-path: .. not allowed');
    const full = join(this.vaultPath, safe);
    try {
      return await fs.readFile(full, 'utf8');
    } catch {
      throw new Error(`not-found: ${relPath}`);
    }
  }

  async search(query: string): Promise<ObsidianHit[]> {
    const q = query.toLowerCase();
    const notes = await this.listNotes();
    const hits: ObsidianHit[] = [];
    for (const n of notes) {
      let content: string;
      try {
        content = await fs.readFile(join(this.vaultPath, n.path), 'utf8');
      } catch {
        continue;
      }
      const lower = content.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(content.length, idx + q.length + 30);
        hits.push({ path: n.path, snippet: content.slice(start, end).replace(/\n/g, ' ') });
      }
    }
    return hits;
  }
}
