/**
 * REPL y/N confirmation prompt — Sprint 1c-revive-3-D-15 (2026-06-05).
 *
 * 拍板 (D-15, 2026-06-05):
 *   - 工厂函数, 接受 mock input/output + abort signal, 便于单测 (R-4 拍板)
 *   - prompt 格式: "Allow <tool_name>? (<reason>) [y/N]: "  (D-15 plan §Decision 2)
 *   - 输入识别: y/yes/Y/YES → true; n/no/N/NO/空/other → false; EOF/abort → null (D-15 plan §Decision 3)
 *   - 不读原始 args, prompt 字符串只含 tool name + reason (红线)
 *   - abort signal 触发立即 resolve null (dismissed)
 *
 * 拍板 (D-15 plan §Risk R-1): child readline + terminal:false (跟主 rl 一致, pipe 友好),
 * rl.question 拿到 answer 后立刻 rl.close() 释放 stdin 监听, 让主 rl (REPL) 继续.
 * 单测用 PassThrough mock, 不依赖真 stdin.
 *
 * 拍板 (D-15 plan §NOT in scope): 不接 RPC confirmedTools (D-17), 不接 user policy
 * config (D-16), 不做 TUI (D-18). D-15 0 改 tool-loop.ts / chain.ts / static-rules.ts /
 * core (D-13 已 ship 接口 + 异步分支).
 */

import { createInterface, type Interface as RLInterface } from 'node:readline';

export interface ReplConfirmOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export interface ReplConfirmCallOptions {
  signal?: AbortSignal;
}

export type ReplConfirm = (
  prompt: string,
  options?: ReplConfirmCallOptions,
) => Promise<boolean | null>;

export function createReplConfirm(opts: ReplConfirmOptions): ReplConfirm {
  return async (prompt, callOpts) => {
    return new Promise<boolean | null>((resolve) => {
      // 拍板 (D-15 plan §Risk R-1): terminal:false 跟主 rl 一致, pipe 友好.
      const rl: RLInterface = createInterface({
        input: opts.input,
        terminal: false,
        output: opts.output,
      });
      let settled = false;
      const settle = (v: boolean | null): void => {
        if (settled) return;
        settled = true;
        // 关键: rl.close() 释放 stdin 监听, 让主 rl (REPL) 继续
        try {
          rl.close();
        } catch {
          /* close 失败 best-effort */
        }
        resolve(v);
      };

      // abort signal — 立即 resolve null (dismissed)
      if (callOpts?.signal) {
        if (callOpts.signal.aborted) {
          settle(null);
          return;
        }
        callOpts.signal.addEventListener('abort', () => settle(null), { once: true });
      }

      // prompt 格式 (D-15 plan §Decision 2): "<prompt> [y/N]: "
      // tool-loop 注入的 prompt 是 "Allow <tool_name>? (<sanitized_reason>)",
      // 我们在末尾追加 [y/N] 提示默认值 (跟 git/npm 风格一致, 空输入默认 N fail-closed).
      const fullPrompt = `${prompt} [y/N]: `;
      rl.question(fullPrompt, (answer) => {
        const a = answer.trim().toLowerCase();
        if (a === 'y' || a === 'yes') {
          settle(true);
        } else if (a === 'n' || a === 'no' || a === '') {
          settle(false);
        } else {
          // 拍板 (D-15 plan §Decision 3): other 当 N 处理 (不打扰)
          settle(false);
        }
      });

      // EOF (e.g. Ctrl+D / input.end 无 write) → null (dismissed)
      // 拍板: rl.question 已 resolve 时这个 listener 也会触发, 但 settle 内部
      // settled 守卫会拦下 (避免重复 resolve).
      rl.on('close', () => {
        settle(null);
      });
    });
  };
}
