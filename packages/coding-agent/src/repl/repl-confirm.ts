/**
 * REPL y/N confirmation prompt — Sprint 1c-revive-3-D-19 (2026-06-05).
 *
 * 历史:
 *   D-15 (2026-06-05): 工厂函数 + 内部 createInterface, 用 rl.question 收 y/N.
 *     留 P1 (review blocker): 同流上主 rl + 子 rl 抢同一行, 用户输 y 时主 rl
 *     会把 y 当新 chat turn 启动 (实测 Node repro 确认).
 *   D-19 (2026-06-05): 拆掉自创 readline, 改成 "caller 喂 line" 的纯 resolver.
 *     主 REPL 的 rl.on('line') 是唯一 stdin 消费者, 确认期间把 line 喂给
 *     pending resolver, 解析完才放行, P1 串行化彻底.
 *
 * 拍板 (D-19, 2026-06-05):
 *   - API 形状: createReplConfirm(opts) 返回的 confirm() 不再内部读 stdin,
 *     而是用 offerLine(rawLine) + 内部 Promise<boolean | null> 状态机.
 *   - prompt 格式: caller 拼好 "Allow <tool_name>? (<reason>) [y/N]: ",
 *     confirm() 内部只负责 "收一行 → 解析 → resolve".
 *   - 输入识别: y/yes/Y/YES → true; n/no/N/NO/空/other → false; abort → null.
 *   - abort signal 触发立即 resolve null (dismissed).
 *   - 同时只能有一个 pending 确认 (REPL 串行 chat-turn 拓扑保证).
 *   - offerLine 二次调用 = 抛错 (caller bug, 不能丢 silent).
 *
 * 拍板 (D-19 §out of scope): 不接 RPC confirmedTools (D-17), 不接 user policy
 * config (D-16), 不做 TUI (D-18).
 */

export interface ReplConfirmOptions {
  /**
   * REPL 的 out (拿 prompt 字符出口). 用 NodeJS.WritableStream 是为了兼容
   * startRepl 传进来的 NodeJS.WritableStream 类型 (vs node:stream Writable).
   * D-19 内部只写 prompt, 不读.
   */
  output: NodeJS.WritableStream;
}

export interface ReplConfirmCallOptions {
  /** AbortSignal — 触发时 confirm 立即 resolve null (dismissed). D-19 修 Ctrl+C 链路. */
  signal?: AbortSignal;
}

export type ReplConfirm = (
  prompt: string,
  options?: ReplConfirmCallOptions,
) => Promise<boolean | null>;

interface PendingConfirm {
  prompt: string;
  resolve: (v: boolean | null) => void;
  abortHandler: (() => void) | null;
}

export interface ReplConfirmController {
  /** 提示用户 (写到 output, 加 [y/N]: 后缀). 内部 start 一个 pending. */
  confirm: ReplConfirm;
  /** REPL 主 line handler 拿到 line 后调: 若有 pending → 喂给 confirm; 若无 → false (caller 走 chat). */
  offerLine: (rawLine: string) => boolean;
  /** 当前是否有 in-flight 确认 (caller 用此守卫主 rl.line). */
  hasPending: () => boolean;
  /** 强制取消 (caller 进程退出/EOF/cleanup). */
  dismiss: () => void;
}

export function createReplConfirm(opts: ReplConfirmOptions): ReplConfirmController {
  let pending: PendingConfirm | null = null;

  const settle = (v: boolean | null): void => {
    if (!pending) return;
    const p = pending;
    pending = null;
    if (p.abortHandler && p.abortHandler !== null) {
      // no-op: signal listener 已被 offerLine / abortHandler 清理
    }
    p.resolve(v);
  };

  const confirm: ReplConfirm = (prompt, callOpts) => {
    if (pending) {
      // 拍板 (D-19): 同时只能有一个 pending, 二次 confirm 抛错 (caller bug).
      return Promise.reject(
        new Error(
          'repl-confirm: confirm() called while another confirmation is in flight. ' +
            'Caller must serialize via hasPending() guard.',
        ),
      );
    }
    // 拍板 (D-19): caller 拼好 prompt, 我们只追加 [y/N]: 后缀.
    const fullPrompt = `${prompt} [y/N]: `;
    opts.output.write(fullPrompt);

    return new Promise<boolean | null>((resolve) => {
      const p: PendingConfirm = {
        prompt: fullPrompt,
        resolve,
        abortHandler: null,
      };
      pending = p;

      // abort signal — 立即 resolve null (dismissed)
      if (callOpts?.signal) {
        if (callOpts.signal.aborted) {
          settle(null);
          return;
        }
        const handler = (): void => settle(null);
        callOpts.signal.addEventListener('abort', handler, { once: true });
        p.abortHandler = handler;
      }
    });
  };

  const offerLine = (rawLine: string): boolean => {
    if (!pending) return false;
    const answer = rawLine.trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      settle(true);
    } else if (answer === 'n' || answer === 'no' || answer === '') {
      settle(false);
    } else {
      // 拍板 (D-15 §Decision 3, D-19 沿用): other 当 N 处理 (不打扰)
      settle(false);
    }
    return true;
  };

  const hasPending = (): boolean => pending !== null;

  const dismiss = (): void => {
    if (pending) settle(null);
  };

  return { confirm, offerLine, hasPending, dismiss };
}
