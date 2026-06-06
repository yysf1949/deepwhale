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
 * - SessionEvent 联合类型（4 种核心：user/assistant/tool/system）
 * - v2.0 升级到 Session DAG（DAG 与 Planner 同链路，arch §3.5）
 *
 * Sprint 1c-revive-2-D-5 已落地（产线代码 packages/core/src/session/compaction.ts）：
 * - D-5-1 基础 compaction（shouldCompact + compact + 'compaction' event）
 *   触发：promptTokens >= window * compactRatio (默认 0.8, Reasonix compact.go 拍板)
 * - D-5-2 stuck latch（CompactionState + runCompactionWithLatch + 'compaction_paused' event）
 *   连续 N 次失败 (默认 2) → latch 暂停, 防 death loop
 * - D-5-3 tail token budget（resolveTail, tailMode='token_budget' 默认）
 *   拍板 source: Reasonix compact.go:271-289 (tail 按 token budget 而非 message count)
 *
 * SessionEvent union 当前 7 kind：
 *   user / assistant / tool / system / compaction / compaction_paused / verification
 * SessionReader 读 'compaction' / 'compaction_paused' / 'verification' 不重放进 LLM context
 * (compaction.ts 拍板: 这三种是 runtime/metadata, 不进 context).
 *
 * 'verification' event (Sprint 1c-revive-2-D-11-3, 2026-06-04): `deepwhale --verify`
 * 或 REPL `/verify` 跑完生成的 VerificationReport 摘要写到 session JSONL.
 *   - 跟 'compaction'/'compaction_paused' 同语义: metadata, 不重放进 LLM context.
 *     用户 reload session 看不到 verification event 拼成 message (跟 paused event 一致).
 *   - 字段: report (VerificationReport 形态) + status (passed / failed) — 给 viewer
 *     / audit log 留口.
 *   - Sprint 1c-revive-2-D-11-3 拍板: 旧 session 文件 (没有 verification event)
 *     reload 不崩, 因为 SessionReader 走 kind discriminator union type,
 *     旧 kind 解析流程不变. 新 kind 在旧 reader 读不到 (kind 不在 union),
 *     但新 reader 读旧 JSONL 也不会试图 parse 缺失字段 — 严格 union 兜底.
 *   - 拍板 (D-11, 2026-06-04): 不**不**新增 session event 子表 / 不**不**新建 verification.jsonl,
 *     跟 user/assistant/tool 同 append-only 1 JSONL 走, 简单且对旧 loader 透明.
 *
 * Sprint 1+ 仍待落地（待拍板）：
 * - 索引（按 messageId 加速查询）
 * - 分片（>100MB 自动切文件）
 * - 加密（at-rest AES-256-GCM）
 * - 压缩（gzip content > N byte）
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
      /**
       * Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 DeepSeek V4 thinking 400 bug):
       * DeepSeek V4 thinking mode 思维链. reload 时还原回 ChatMessage 给
       * 下次 LLM call, 保证多轮推理连续. 缺省 absent 表示 thinking 关 /
       * 非 thinking model (V3 旧 alias). 跟 AssistantEvent 的 content 同
       * 生命周期, 不影响旧 reader (新 union 字段向后兼容).
       */
      reasoning_content?: string;
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
  | { kind: 'system'; ts: number; content: string; meta?: Record<string, unknown> }
  | {
      /**
       * Compaction event (Sprint 1c-revive-2-D-5-1):
       * LLM context 超 window×0.8 触发, 总结前 N 条 message 写 1 条 summary event.
       * SessionReader 读到 kind='compaction' 时不重放进 LLM context (给 caller 拍板).
       *
       * 字段:
       *   - summary: 总结文本 (caller 用 LLM 生成)
       *   - replaced_range: [start, end) 索引, 拍板原 messages 哪段被替代
       *   - meta: 统计 (before/after token, message count) 供调试
       *
       * 不变量: replaced_range[1] - replaced_range[0] >= 1 (有东西被总结)
       */
      kind: 'compaction';
      ts: number;
      summary: string;
      replaced_range: readonly [number, number];
      meta?: Record<string, unknown>;
    }
  | {
      /**
       * Compaction paused event (Sprint 1c-revive-2-D-5-2):
       * 连续 N 次 compaction 失败 (默认 2) → latch 自动暂停, 写 1 条 paused event.
       * 防止 death loop (每次 LLM context 涨 → 触发 compact → 失败 → 再涨 → 再触发...).
       *
       * 字段:
       *   - consecutive_failures: 失败次数 (触发 latch 时 = 阈值)
       *   - reason: 拍板暂停原因 (给上层 UI/log 用)
       *   - last_error: 最后一次失败 error.message
       *
       * 不变量: SessionReader 读到 paused event 不重放进 LLM context
       * (caller 该决定是否重置 latch / 改配置 / 改 summaryFn 拍板).
       *
       * Reasonix compact.go:88-93 拍板 source: consecutiveCompacts >= 2 → latch compactStuck,
       * 自动暂停 + 拍板"say why, once".
       */
      kind: 'compaction_paused';
      ts: number;
      consecutive_failures: number;
      reason: string;
      last_error: string;
      meta?: Record<string, unknown>;
    }
  | {
      /**
       * Verification event (Sprint 1c-revive-2-D-11-3, 2026-06-04):
       * `deepwhale --verify` 或 REPL `/verify` 跑完生成的 VerificationReport 摘要
       * 写到 session JSONL. 跟 compaction_paused 同语义: metadata, 不重放进 LLM context.
       *
       * 字段:
       *   - status: 'passed' / 'failed' (整体结果, 跟 VerificationReport.overallStatus 一致)
       *   - durationMs: 整体耗时 (跟 VerificationReport.durationMs 一致)
       *   - command_count: 跑的 step 数 (e.g. 4 = build/lint/typecheck/test)
       *   - failed_count: 失败 step 数
       *   - summary: 人类可读 summary (跟 VerificationReport.summary 一致)
       *   - meta: 给 viewer / audit 留的可选扩展字段 (e.g. log file path, git sha)
       *
       * 不变量:
       *   - SessionReader 读 'verification' 不重放进 LLM context
       *     (跟 compaction_paused 一致, 跟 tool/user/assistant 不同).
       *   - 旧 session reload 不崩: 旧 event 没 'verification' kind, 新 reader union
       *     不会试图 parse 缺失字段; 新 reader 读旧 event 完全不感知.
       *   - stdout/stderrTail 不在 event 里 (cap 4KB 内嵌到 event 也会撑爆 JSONL);
       *     要看详细就 reload 时读 `meta.logFilePath` (后续 sprint 加).
       */
      kind: 'verification';
      ts: number;
      status: 'passed' | 'failed';
      durationMs: number;
      command_count: number;
      failed_count: number;
      summary: string;
      meta?: Record<string, unknown>;
    }
  | {
      /**
       * Policy decision event (Sprint 1c-revive-3-D-13, 2026-06-05).
       * tool 实际 execute 之前, policy layer (src/policy/) 的决策落盘.
       * 拍板 (用户 2026-06-05): 'allow' 不写 (避免 JSONL 被读工具刷爆), 只有
       *   'deny' / 'require_confirmation' / 用户确认结果 ('user_approved' / 'user_denied')
       *   写. 跟 'compaction' / 'compaction_paused' / 'verification' 同语义:
       *   metadata, sessionEventsToMessages 跳过, 不进 LLM context.
       *
       * 字段拍板:
       *   - tool_call_id: 跟后续 'tool' event 配对 (reload 时 audit trace 完整)
       *   - decision: 'deny' | 'require_confirmation' | 'user_approved' | 'user_denied'
       *     (拍板: 不写 'allow' — 噪音)
       *   - argsDigest: sha256:<12hex>, 不存原始 args (拍板: 防 secret leak)
       *   - reason: 自然语言, 已经过 sanitize (长度 / 换行 / NUL)
       */
      kind: 'policy_decision';
      ts: number;
      tool_call_id: string;
      name: string;
      decision: 'deny' | 'require_confirmation' | 'user_approved' | 'user_denied';
      argsDigest: string;
      reason?: string;
      meta?: Record<string, unknown>;
    };

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
    // Sprint 1c-revive-2-D-5+ (review P2, 2026-06-04): 入口清零 lastIncompleteLineIndex.
    // 拍板: 同一个 SessionReader 实例先读过损坏文件 (有 partial line), truncate()
    // 成功后, 再读修复后的文件, 旧 index 仍残留, 后续 truncate() 会按旧 index
    // 截断, 可能删掉有效 events. 拍 parseLines 入口重置 = "本次读决定
    // lastIncompleteLineIndex, 不会被前次污染".
    this.lastIncompleteLineIndex = -1;
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
    // Sprint 1c.6: temp file + atomic rename (修 1c.5 'w' flag 漏洞)
    //
    // 1c.5 用 fs.open(this.path, 'w') — 'w' = O_TRUNC 立即截 0 字节.
    // fsync 救不了"open → write"窗口: 进程在这段被杀, session 变 0 字节,
    // 比不 truncate 更坏. 1c.5 test 只验了"成功路径 stat().size",
    // 没覆盖最坏窗口, 是 R-G1 "test passed ≠ production works" 反例.
    //
    // 修法: write to temp + atomic rename. 关键不变量:
    //   - 写 temp 阶段崩 → 原文件**完整保留** (没动), 可能有 .tmp 垃圾待清理
    //   - rename 阶段崩 → POSIX 原子 (要么旧要么新, 没有中间态),
    //                    Windows MoveFileEx 覆盖原子
    //   - truncate 返回后, 文件系统状态 ∈ {原文件不变, 原文件 = keep}
    //     — 绝不会有 0 字节第三态
    //
    // temp path 唯一性: pid + timestamp + 随机, 避免并发 truncate 同文件
    // (v1.0 单人本地不并发, 但保险). 同 dir 保证 rename atomic.
    const tempPath = `${this.path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const handle = await fs.open(tempPath, 'w');
    try {
      await handle.writeFile(keep, 'utf8');
      await handle.sync();
    } catch (err) {
      // 写 temp 失败: 清理垃圾, 原文件**不动**, 抛错给 caller.
      // 拍板 (review P2, 2026-06-04): 失败**保留** lastIncompleteLineIndex,
      // caller 之后重试 truncate 仍能清掉这个 partial line. 抹掉的话会
      // "成功一次后忘记清" 反复 leak, 更难诊断.
      await handle.close().catch(() => {});
      await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
    await handle.close();
    // atomic rename: 旧文件要么没被替换 (进程在 rename 前被杀, 原文件 = 旧 keep+partial),
    // 要么被替换 (rename 完成, 原文件 = new keep). 不会有 0 字节.
    try {
      await fs.rename(tempPath, this.path);
    } catch (err) {
      // rename 失败: 清理 temp, 原文件**不动** (rename 没成功), 抛错给 caller.
      // 拍板: 同样**保留** lastIncompleteLineIndex, 跟写 temp 失败同语义.
      await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
    // 成功: 清零 lastIncompleteLineIndex (拍板 review P2, 2026-06-04).
    // 下次 parseLines 入口本来就会重置 (review P2 fix), 这里额外清零
    // 是给 truncate 后的二次调用兜底 (虽然实际不会发生, 但防御编程).
    this.lastIncompleteLineIndex = -1;
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
