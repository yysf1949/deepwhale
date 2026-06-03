/**
 * Session JSONL — append-only 持久化 + crash recovery
 *
 * 协议（pi 借鉴）：
 * - 每条消息 = 1 行 JSON
 * - 行分隔符 = '\n'（不带 \r）
 * - 写入：append + fsync（保证不丢消息）
 * - 读取：行扫描，**自动截断不完整行**（crash recovery 关键）
 *
 * Sprint 0.2 范围：
 * - SessionWriter（append + fsync + flush）
 * - SessionReader（line-by-line + partial line truncation）
 * - SessionEvent 联合类型（4 种核心：user/assistant/tool/tool_result）
 * - v2.0 升级到 Session DAG（DAG 与 Planner 同链路，arch §3.5）
 *
 * Sprint 1+ 扩展：
 * - 压缩（compaction 钩子）
 * - 索引（按 messageId 加速查询）
 * - 分片（>100MB 自动切文件）
 */

import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Session 事件 v1.0 = Linear（arch §2.3 红线：v1.0 = Linear，不做 DAG） */
export type SessionEvent =
  | { kind: 'user'; ts: number; content: string; meta?: Record<string, unknown> }
  | {
      kind: 'assistant';
      ts: number;
      content: string;
      tool_calls?: ReadonlyArray<{ id: string; name: string; args: Record<string, unknown> }>;
      meta?: Record<string, unknown>;
    }
  | {
      kind: 'tool';
      ts: number;
      tool_call_id: string;
      name: string;
      result: { success: boolean; content: string; error?: string };
      duration_ms: number;
      meta?: Record<string, unknown>;
    }
  | { kind: 'system'; ts: number; content: string; meta?: Record<string, unknown> };

/**
 * JSONL Writer — append + fsync。
 *
 * 使用方式：
 *   const w = new SessionWriter('/path/to/session.jsonl');
 *   await w.open();
 *   await w.append({ kind: 'user', ts: Date.now(), content: 'hello' });
 *   await w.close();
 *
 * 关键：每次 append 都 fsync（v1.0 = 单人本地，可接受开销；v2.0 引入 batch fsync）
 */
export class SessionWriter {
  private handle: FileHandle | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async open(): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    this.handle = await fs.open(this.path, 'a');
  }

  /** 追加一条事件（fsync 后返回） */
  async append(event: SessionEvent): Promise<void> {
    if (!this.handle) {
      throw new Error('SessionWriter: must call open() before append()');
    }
    // 串行化写：避免并发 fsync 乱序
    this.writeQueue = this.writeQueue.then(() => this.doAppend(event));
    return this.writeQueue;
  }

  private async doAppend(event: SessionEvent): Promise<void> {
    const handle = this.handle;
    if (!handle) throw new Error('SessionWriter: handle closed');
    const line = JSON.stringify(event) + '\n';
    await handle.write(line);
    await handle.sync(); // fsync — 保证数据落盘
  }

  async close(): Promise<void> {
    // 关键：先 await writeQueue 排空，否则 doAppend 中的 handle.write/sync
    // 会在 handle.close() 之后执行，触发 'EBADF' / 'file closed' 错误。
    // 复现：append 后立刻 close（不 await）→ write 撞上 closed handle
    await this.writeQueue;
    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }
  }
}

/**
 * JSONL Reader — line-by-line + 截断 partial line。
 *
 * Crash recovery 关键点：
 * - 写入中途 crash → 最后一行可能是 partial JSON
 * - read() 检测到不完整行 → 截断 + 警告 + 返回前面的完整行
 * - 不抛错（让 agent 启动不卡死）
 *
 * 截断策略：把最后一行（无论完整与否）从文件删除
 */
export class SessionReader {
  constructor(private readonly path: string) {}

  /** 读取所有完整事件（自动 truncate partial last line） */
  async readAll(): Promise<ReadonlyArray<SessionEvent>> {
    let text: string;
    try {
      text = await fs.readFile(this.path, 'utf8');
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    return this.parseLines(text);
  }

  private parseLines(text: string): SessionEvent[] {
    const events: SessionEvent[] = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.length === 0) continue;
      try {
        const parsed = JSON.parse(line) as SessionEvent;
        events.push(parsed);
      } catch {
        // 不完整行 / 损坏行：截断掉（crash recovery）
        // 后面 truncate() 会把这一行从文件删除
        this.lastIncompleteLineIndex = i;
        break;
      }
    }
    return events;
  }

  private lastIncompleteLineIndex = -1;

  /** 截断文件到最后一个完整事件（crash recovery） */
  async truncate(): Promise<{ truncated: number }> {
    if (this.lastIncompleteLineIndex < 0) {
      return { truncated: 0 };
    }
    const text = await fs.readFile(this.path, 'utf8');
    const lines = text.split('\n');
    const keep = lines.slice(0, this.lastIncompleteLineIndex).join('\n') + '\n';
    const truncatedBytes = Buffer.byteLength(text, 'utf8') - Buffer.byteLength(keep, 'utf8');
    await fs.writeFile(this.path, keep, 'utf8');
    return { truncated: truncatedBytes };
  }
}

/**
 * 便捷工厂 — 组合 open + read + truncate + close
 */
export async function readSessionEvents(path: string): Promise<ReadonlyArray<SessionEvent>> {
  const reader = new SessionReader(path);
  const events = await reader.readAll();
  if (reader['lastIncompleteLineIndex'] >= 0) {
    await reader.truncate();
  }
  return events;
}
