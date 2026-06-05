# D-15 REPL Tool Confirmation / y/N Permission Prompt — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Sprint 编号: **D-15** (Sprint 1c-revive-3 续 D-13.5, 不插子编号 — D-15 是 1c 拍板里已经显式留的口, 不是 review follow-up).

**Goal:** 补 REPL 真实 y/N confirmation prompt。用户在 REPL 内逐次批准或拒绝 destructive tool call (`write_file` / `edit_file` / 危险 bash)。D-13 MVP 留 `staticToolPolicy.confirm = undefined` 导致 REPL 现状 fail-closed deny (跟 print/rpc 一致, 但 UX 不通), D-15 注入真 confirm 让 REPL 走 y/N 拍板。

**Architecture:** **零侵入 tool-loop.ts / chain.ts / static-rules.ts / core** (D-13 拍板已预留 `ToolPolicy.confirm?(prompt) => Promise<boolean | null>` 接口, tool-loop.ts:365-386 已实现 confirm 异步分支). D-15 只做:
1. 新文件 `src/repl/repl-confirm.ts` — `createReplConfirm(opts) => ToolPolicy['confirm']` 工厂, 内部用 readline 单行 `rl.question` 拿 y/N
2. 改 `src/repl/repl.ts` — `runAgentTurn` 构造 `replPolicy = { ...staticToolPolicy, confirm: createReplConfirm({...}) }` 注入 runToolLoop
3. 新测试 2 文件 (unit repl-confirm + integration REPL turn 走通)
4. 改 1 个 D-13 集成测 (行 297 "REPL + yes=false → fail-closed deny" 改成 "REPL + yes=false + 真 confirm 注入 y → 放行", 保留 1 个 "无 confirm 实现 → deny" 的 sibling 测)
5. README D-15 文档更新 (4 处: 行 333 表格 / 行 339-347 REPL 现状段 / 行 415-417 验收红线 #5 / 行 437 集成测计数)

**Tech Stack:** TypeScript 5.7 (strict), Node 22 `node:readline` (复用现有 readline, 不引新 dep), AbortController 复用 (复用 repl.ts 已持有的 `ac`), Session JSONL append-only 协议 (复用 D-13 `appendPolicyDecisionEvent`).

---

## Decision points for user (4 决策点, 拍板基于 evidence)

1. **REPL 现有 readline 模型怎么处理嵌套 prompt**: 我建议**临时建 child readline + `rl.question`**, 不抢主 readline (`runAgentTurn` 期间主 rl 不 consume line — line 事件被 await 阻塞, child rl 创建后 `rl.question` 内部用一次性 line 监听, close 后主 rl 恢复). **风险**: child rl + main rl 同 stdin 理论会冲突. 拍板走方案 A — child rl **临时** (`createInterface({input, terminal:false})` + `rl.question` + `rl.close()` 一次). R-1 风险: 如果用户在 LLM 流式 chunk 期间打字, 字会被 child rl 抢先 emit 拿作 answer 还是被主 rl queue 留 turn 间? 实测下来 `rl.question` 调后会 emit 'line' 一次给 child rl, 主 rl 收到同一个 line 后会 emit 给当前 await 完成的 turn, 实际行为依赖 Node 版本 + readline 实现, **单测不依赖真 stdin, 用 PassThrough mock**.
2. **prompt 格式**: 我建议 `Allow <tool_name>? (<sanitized_reason>) [y/N]: ` (跟 tool-loop.ts:367 默认 prompt 一致, 显式加 `[y/N]` 提示默认值, 跟 git/npm 风格对齐). **理由**: 空输入默认 N (跟 git push --force 风格一致, fail-closed); reason 由 tool-loop 注入时已经过 `sanitizeReason()` (≤200 chars + 换行折叠 + NUL 去), D-15 不再二次 sanitize.
3. **输入识别**: `y` / `yes` / `Y` / `YES` → true; `n` / `no` / `N` / `NO` / 空 → false; 其它输入 (e.g. `maybe`, `foo`, `bar`) → false (不打扰, 当 N 处理); EOF / Ctrl+D → null (dismissed, 走 user_denied + tool 不执行). **风险**: 误判 (e.g. 用户打 `yikes` 被当 N) — 拍板接受, 跟 D-13 `staticToolPolicy` "宁多弹" 一致.
4. **replConfirm 返回 false / null 时怎么落 session event**: 跟 tool-loop.ts:368-386 已实现的契约对齐 — `ok === true` → `user_approved`, `ok === false` → `user_denied` (reason: `user denied confirmation`), `ok === null` → `user_denied` (reason: `user dismissed confirmation`). D-15 0 改 tool-loop.

---

## NOT in scope (D-15 红线)

- **不**接 RPC `confirmedTools` (RPC 模式 confirm 留 D-17, D-15 plan 写明: RPC 端目前是 isInteractive=false + 无 confirm, 走 fail-closed deny).
- **不**接 user policy config (`~/.deepwhale/policy.yaml` D-16 拍板, D-15 plan 写明: D-16 引入 user-supplied ToolPolicy 注入 REPL 跟 D-15 replPolicy 替换 staticToolPolicy).
- **不**做 TUI (raw ANSI cursor 控制留 D-18, D-15 用 readline 纯文本 prompt, 在 `\n` 之前 print prompt 字符串, 跟 `out.write(t('cli.prompt'))` 一致).
- **不**改 print/rpc 行为 (D-13.5 已 ship: print/rpc + isInteractive=false → 默认 deny, --yes bypass 走 user_approved; D-15 plan 明确: 0 改 print 入口 + RPC dispatch).
- **不**改 tool-loop.ts (D-13 已 ship confirm 异步分支, D-15 0 改).
- **不**改 policy/types.ts / policy/chain.ts / policy/static-rules.ts (D-13 已 ship 接口 + static.confirm 留 undefined, D-15 0 改).
- **不**改 core session event schema (D-13 已 ship `policy_decision` 4 字段 + `decision` 4 联合, D-15 0 改).

---

## Risks (拍板已知)

- **R-1**: child readline + main readline 同 stdin 冲突. **缓解**: 单测用 PassThrough mock, 不依赖真 stdin; REPL 端用 `terminal: false` (跟主 rl 一致), 短窗口 `rl.question` + `rl.close` 后立刻释放, 不在 prompt 期间挂 long-lived 监听.
- **R-2**: LLM 流式 chunk 期间用户输入会跟 confirm prompt 竞争 stdin. **缓解**: tool-loop 在等 confirm 时**不再调 LLM** (policy gate 在 execute 之前, LLM 已返回 tool_calls 在 waiting confirm), 竞争窗口窄. **最坏 case**: 用户在 confirm prompt 期间打多行, readline 缓冲所有行, 下一行变下个 confirm 的 answer 或下个 turn 的 user input — 都是 "落后一拍", 不破坏状态机.
- **R-3**: prompt 不暴露 tool args 原文 (红线). tool-loop 注入的 prompt 字符串是 `Allow <tool_name>? (<sanitized_reason>)` — **没有** 原始 args. D-15 replConfirm 不接收原始 args, 也不打印 argsDigest 到 stdout (argsDigest 落 session, **不**到 stdout).
- **R-4**: 单元测在 CI 上跑时, 无人值守 stdin 会立刻 EOF → null → user_denied. **缓解**: 单测**不**调真 replConfirm, 调 mock confirm policy (e.g. `{confirm: async () => true}`) 跑 runToolLoop, 测真 replConfirm 在 vitest 内**不**能跑 (除非 background 真 stdin 模拟), 所以 D-15 单元测只测 createReplConfirm **factory** 的 prompt 字符串 + input/output 流挂接, **不**测 rl.question 真实 readline 行为. 端到端真 stdin prompt 留给 manual 测.
- **R-5**: --yes + 真 confirm 注入 同时存在. **拍板**: --yes 永远先于 confirm (D-13.5 P1 重排拍板), D-15 0 改 — `--yes=true` 时 tool-loop 走 ctx.yes 分支, 不到 policy.confirm. replConfirm 实际不被调用.

---

## Tests (D-15 必须覆盖, 6 类)

| # | 类型 | 文件 | 描述 | 拍板点 |
|---|---|---|---|---|
| 1 | unit | `test/repl/repl-confirm.test.ts` | `createReplConfirm({input, output})` 工厂: y/yes/Y/YES → true, n/no/N/NO/空 → false, other → false, 接受 abort signal 立即 resolve null. **不**调真 readline, 传 mock input = `PassThrough` stream + spy output. | 拍板 3 |
| 2 | unit | `test/repl/repl-confirm.test.ts` | `createReplConfirm` prompt 字符串格式: `Allow <tool_name>? (<reason>) [y/N]: `, 不含原始 args, 不含 secret. | 拍板 2 |
| 3 | integration | `test/integration/repl-tool-loop-confirm.test.ts` | REPL turn: 真 policy.confirm 注入, 用户输 `y` → write_file 真落盘 + session 落 `user_approved` event. | D-15 主线 |
| 4 | integration | `test/integration/repl-tool-loop-confirm.test.ts` | REPL turn: 真 policy.confirm 注入, 用户输 `n` → 工具不执行 + session 落 `user_denied` (reason: `user denied confirmation`) event. | D-15 主线 |
| 5 | integration | `test/integration/repl-tool-loop-confirm.test.ts` | REPL turn: 真 policy.confirm 注入, 用户空输入 → 工具不执行 + session 落 `user_denied` (reason: `user dismissed confirmation`) event. | D-15 主线 |
| 6 | integration (regression) | `test/integration/tool-loop-policy.test.ts` (改行 297) | REPL + isInteractive=true + yes=false + policy.confirm 注入 y → 落 user_approved (替代原 "no confirm impl → deny" 测, 保留 1 个 sibling 测 "policy.confirm 显式 undefined → no confirm impl → deny" 测原意). | D-15 vs D-13 兼容 |
| 7 | integration (regression) | `test/integration/tool-loop-policy.test.ts` (新加) | --yes=true + policy.confirm 注入 mock → 走 ctx.yes 分支, confirm 函数**不**被调用, 落 user_approved (bypassedByYes:true). | 拍板 1 + 拍板 R-5 |

**总计**: 4 个新 test (2 unit file + 2 integration file) + 1 个 D-13 测改 + 1 个 D-13 测 sibling + 1 个 D-13 测新加 → **净 +6 it**, tool-loop-policy 测从 13 → 14 it.

---

## Tasks

### Task 1: 新建 `src/repl/repl-confirm.ts` — REPL y/N confirm factory (RED → GREEN)

**Files:**
- Create: `packages/coding-agent/src/repl/repl-confirm.ts`
- Test: `packages/coding-agent/test/repl/repl-confirm.test.ts`

**Step 1: Write failing test (RED)**

```ts
// packages/coding-agent/test/repl/repl-confirm.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { createReplConfirm } from '../../src/repl/repl-confirm.js';

describe('repl/repl-confirm (D-15)', () => {
  function setup(inputStr: string) {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (c: Buffer) => chunks.push(c));
    const confirm = createReplConfirm({ input, output });
    return { input, confirm, getOutput: () => Buffer.concat(chunks).toString() };
  }

  it('factory returns a function (ToolPolicy.confirm shape)', () => {
    const { confirm } = setup('');
    expect(typeof confirm).toBe('function');
  });

  it('prompt format: "Allow <tool_name>? (<reason>) [y/N]: "', async () => {
    const { input, confirm, getOutput } = setup('y\n');
    const p = confirm('Allow write_file? (writes to filesystem)');
    setImmediate(() => input.write('y\n'));
    const r = await p;
    expect(r).toBe(true);
    expect(getOutput()).toMatch(/Allow write_file\?\s*\(writes to filesystem\)\s*\[y\/N\]:\s*$/);
  });

  it('y → true', async () => {
    const { input, confirm } = setup('y\n');
    const p = confirm('x');
    setImmediate(() => input.write('y\n'));
    expect(await p).toBe(true);
  });

  it('yes → true', async () => {
    const { input, confirm } = setup('yes\n');
    const p = confirm('x');
    setImmediate(() => input.write('yes\n'));
    expect(await p).toBe(true);
  });

  it('Y / YES (大小写) → true', async () => {
    const { input, confirm } = setup('Y\n');
    const p = confirm('x');
    setImmediate(() => input.write('Y\n'));
    expect(await p).toBe(true);
    // sibling
    const p2 = confirm('x');
    setImmediate(() => input.write('YES\n'));
    expect(await p2).toBe(true);
  });

  it('n / no / N / NO → false (reason: user denied)', async () => {
    for (const ans of ['n', 'no', 'N', 'NO']) {
      const { input, confirm } = setup(ans + '\n');
      const p = confirm('x');
      setImmediate(() => input.write(ans + '\n'));
      expect(await p).toBe(false);
    }
  });

  it('empty input → false (default N, fail-closed)', async () => {
    const { input, confirm } = setup('\n');
    const p = confirm('x');
    setImmediate(() => input.end()); // 模拟回车空输入
    expect(await p).toBe(false);
  });

  it('other input (e.g. "maybe") → false (不打扰, 当 N)', async () => {
    const { input, confirm } = setup('maybe\n');
    const p = confirm('x');
    setImmediate(() => input.write('maybe\n'));
    expect(await p).toBe(false);
  });

  it('EOF (input.end 无 input.write) → null (dismissed)', async () => {
    const { input, confirm } = setup('');
    const p = confirm('x');
    setImmediate(() => input.end()); // 立刻 EOF
    expect(await p).toBe(null);
  });

  it('abort signal 触发 → null', async () => {
    const { confirm } = setup('');
    const ac = new AbortController();
    const p = confirm('x', { signal: ac.signal });
    setImmediate(() => ac.abort());
    expect(await p).toBe(null);
  });

  it('prompt 不含原始 args / secret (红线)', async () => {
    const { input, confirm, getOutput } = setup('y\n');
    const p = confirm('Allow write_file? (writes to filesystem)');
    setImmediate(() => input.write('y\n'));
    await p;
    // prompt 字符串就只是 tool name + reason, 没有 args
    const out = getOutput();
    expect(out).not.toMatch(/path=/); // 即使 reason 写错也不暴露
    expect(out).not.toMatch(/api[_-]?key/i);
    expect(out).not.toMatch(/sha256:/);
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/repl/repl-confirm.test.ts
```

Expected: FAIL — `createReplConfirm` 模块找不到.

**Step 3: Write minimal implementation (GREEN)**

```ts
// packages/coding-agent/src/repl/repl-confirm.ts
/**
 * Sprint 1c-revive-3-D-15 (2026-06-05): REPL y/N confirmation prompt.
 *
 * 拍板 (D-15, 2026-06-05):
 *   - 工厂函数, 接受 mock input/output + abort signal, 便于单测
 *   - prompt 格式: "Allow <tool_name>? (<reason>) [y/N]: "
 *   - 输入识别: y/yes/Y/YES → true; n/no/N/NO/空/other → false; EOF/abort → null
 *   - 不读原始 args, prompt 字符串只含 tool name + reason (红线)
 *   - abort signal 触发立即 resolve null (dismissed)
 *
 * 拍板 (D-15 plan §Decision 1): 用 readline.createInterface + rl.question 单行
 * 监听, 拿到 answer 后立刻 rl.close() 释放. 不抢主 readline (REPL 端 runAgentTurn
 * 期间主 rl 不 consume line — line 事件被 await 阻塞).
 *
 * 拍板 (D-15 plan §Risk R-4): 单测用 PassThrough mock, 不依赖真 stdin.
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

      // abort signal
      if (callOpts?.signal) {
        if (callOpts.signal.aborted) {
          settle(null);
          return;
        }
        callOpts.signal.addEventListener('abort', () => settle(null), { once: true });
      }

      // prompt 格式 (D-15 plan §Decision 2)
      const fullPrompt = `${prompt} [y/N]: `;
      rl.question(fullPrompt, (answer) => {
        const a = answer.trim().toLowerCase();
        if (a === 'y' || a === 'yes') {
          settle(true);
        } else if (a === 'n' || a === 'no' || a === '') {
          settle(false);
        } else {
          // 拍板 (D-15 plan §Decision 3): other 当 N 处理
          settle(false);
        }
      });

      rl.on('close', () => {
        // 拍板 (D-15 plan §Decision 3): EOF → null (dismissed)
        settle(null);
      });
    });
  };
}
```

**Step 4: Run test to verify pass**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/repl/repl-confirm.test.ts
```

Expected: 11 it PASS (2 prompt 格式 + 6 输入识别 + 1 EOF + 1 abort + 1 secret 排除).

---

### Task 2: 改 `src/repl/repl.ts` — 注入 replConfirm 到 runToolLoop

**Files:**
- Modify: `packages/coding-agent/src/repl.ts` (3 处微改: import + runAgentTurn 构造 policy + 透传)

**Step 1: 改 import (行 54 后)**

```ts
import { staticToolPolicy } from './policy/static-rules.js';
import { createReplConfirm } from './repl/repl-confirm.js'; // D-15: REPL y/N confirm 工厂
```

**Step 2: 改 runAgentTurn 内部 policy 构造 (行 445, 462)**

D-15 拍板: `runAgentTurn` 接收 `out` + `signal` + `ac` 已有, 增加**内部构造** `replPolicy`:

```ts
// 拍板 (D-15, 2026-06-05): REPL = 交互模式, 注入真 confirm 实现 (readline y/N prompt).
// D-13 MVP 留 staticToolPolicy.confirm = undefined → REPL fail-closed deny, D-15 修.
// 拍板: --yes 永远先于 confirm (D-13.5 P1 重排), replConfirm 只在 yes=false 才被调.
const replPolicy = {
  ...staticToolPolicy,
  confirm: createReplConfirm({
    input: options.input ?? stdin,
    output: options.output ?? stdout,
  }),
};
```

然后两处 `policy: staticToolPolicy` (行 445, 462) 都改成 `policy: replPolicy`. **同时** 透传 signal 给 confirm: `createReplConfirm({...})` 内部用 `callOpts.signal`, tool-loop 在 confirm 调用时**不传** signal (current tool-loop.ts:367 `await policy.confirm(prompt)` 不接 signal), 所以 D-15 暂时**不**接 abort signal 到 confirm — 留 D-17 RPC 用 (RPC 用 abort signal 跟 transport 联动).

**Step 3: 跑现有 D-13 集成测**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/integration/tool-loop-policy.test.ts
```

Expected: 13/13 PASS — D-15 改 replPolicy 注入**不**影响 tool-loop.ts, 现有测**不**依赖 repl.ts 的 replPolicy. **如果失败**: 说明我对 tool-loop.ts 契约理解有误, 必须先修 tool-loop.ts 才能继续 D-15.

---

### Task 3: 改 `test/integration/tool-loop-policy.test.ts` (1 改 + 1 sibling + 1 新加)

**Step 1: 改行 297 的 "no confirm impl → deny" 测**

原文测名 `bash mv a b + isInteractive=true + yes=false (REPL 无 --yes 默认): policy 走 no confirm impl → deny (R-3 拍板)`. 改成 sibling 测:

```ts
it('REPL + isInteractive=true + yes=false + policy.confirm 注入 (mock 返 y): 走 confirm 分支, 落 user_approved (D-15)', async () => {
  // 拍板 (D-15, 2026-06-05): REPL 注入真 confirm 后, 不再走 no confirm impl → deny,
  // 而是调 confirm 函数. 这里用 mock confirm = () => true 模拟用户输 y.
  const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
  try {
    const target = join(dir, 'target.txt');
    const sessionPath = join(dir, 'session.jsonl');
    const writer = new SessionWriter(sessionPath);
    await writer.open();
    let confirmCalls = 0;
    const confirmPolicy: ToolPolicy = {
      ...staticToolPolicy,
      confirm: async (_prompt: string) => {
        confirmCalls += 1;
        return true; // 模拟用户输 y
      },
    };
    const client = makeMockClient({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'repl-confirmed' },
    });
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: confirmPolicy,
      isInteractive: true, // REPL
      yes: false, // 无 --yes
      writer,
      onChunk: () => {},
    });
    const toolResult = getToolStepResult(result);
    expect(toolResult!.success).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('repl-confirmed');
    expect(confirmCalls).toBe(1); // 调了 1 次
    await writer.close();
    const events = await readSessionEvents(sessionPath);
    const policyEvents = events.filter((e) => e.kind === 'policy_decision');
    expect(policyEvents).toHaveLength(1);
    const ev = policyEvents[0]!;
    if (ev.kind === 'policy_decision') {
      expect(ev.decision).toBe('user_approved');
      expect(ev.name).toBe('write_file');
      expect(ev.reason).toBe('user approved');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 2: 保留 sibling 测 "no confirm impl → deny"**

把行 297 测改名 (原意不变):

```ts
it('REPL + isInteractive=true + yes=false + policy.confirm 显式 undefined: 走 no confirm impl → deny (D-13 兼容)', async () => {
  // 拍板 (D-15, 2026-06-05): D-13 旧测是 REPL 现状 fail-closed 拍板, D-15 注入 confirm 后
  // 这条测的"原意"变成 "未注入 confirm 实现 → 兜底 deny" — D-13 兼容测, 留作 D-15 后人可验证
  // 静态 ToolPolicy 不动还能 fail-closed.
  const client = makeMockClient({
    id: 'c1',
    name: 'bash',
    args: { command: 'mv', args: ['a', 'b'] },
  });
  // 显式 policy 没 confirm 字段
  const policyNoConfirm: ToolPolicy = {
    evaluate: staticToolPolicy.evaluate,
  };
  const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
    registry: createDefaultRegistry(),
    policy: policyNoConfirm,
    isInteractive: true,
    yes: false,
    onChunk: () => {},
  });
  const toolResult = getToolStepResult(result);
  expect(toolResult!.success).toBe(false);
  expect(toolResult!.error).toMatch(/policy_blocked: no confirm impl/);
});
```

**Step 3: 新加 --yes bypass confirm 测**

```ts
it('--yes + policy.confirm 注入 mock: ctx.yes 优先, confirm 函数**不**被调, 落 user_approved (D-15 R-5)', async () => {
  // 拍板 (D-15, 2026-06-05): --yes 永远先于 confirm (D-13.5 P1 重排), 注入 confirm 后
  // 也要验证 --yes 走 ctx.yes 分支, confirm 0 调用, 落 user_approved.
  const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
  try {
    const target = join(dir, 'target.txt');
    const sessionPath = join(dir, 'session.jsonl');
    const writer = new SessionWriter(sessionPath);
    await writer.open();
    let confirmCalls = 0;
    const confirmPolicy: ToolPolicy = {
      ...staticToolPolicy,
      confirm: async (_prompt: string) => {
        confirmCalls += 1;
        return true;
      },
    };
    const client = makeMockClient({
      id: 'c1',
      name: 'write_file',
      args: { path: target, content: 'yes-bypass' },
    });
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: confirmPolicy,
      isInteractive: true,
      yes: true, // --yes 拍板
      writer,
      onChunk: () => {},
    });
    const toolResult = getToolStepResult(result);
    expect(toolResult!.success).toBe(true);
    expect(confirmCalls).toBe(0); // confirm 0 调用
    await writer.close();
    const events = await readSessionEvents(sessionPath);
    const policyEvents = events.filter((e) => e.kind === 'policy_decision');
    expect(policyEvents).toHaveLength(1);
    const ev = policyEvents[0]!;
    if (ev.kind === 'policy_decision') {
      expect(ev.decision).toBe('user_approved');
      expect((ev as { meta?: { bypassedByYes?: boolean } }).meta?.bypassedByYes).toBe(true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 4: 跑测**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/integration/tool-loop-policy.test.ts
```

Expected: 14/14 PASS (原 13 + 1 改 + 1 sibling + 1 新加, **净 +2 it** = 15, 但 1 测被改成 sibling, 实际是 13 + 1 改 -1 删 +1 sibling +1 新加 = 15; 重新算: 原 13 it, 改 1 测(行 297) 不增不减, 加 1 sibling + 1 新加 = 15 it. **等等**: 改 1 测是用 patch 改, 测名变了但行数仍是 1, **净 +2 it** = 15. 拍板:**tool-loop-policy.test.ts 从 13 → 15 it**.)

---

### Task 4: 新建 `test/integration/repl-tool-loop-confirm.test.ts` — REPL turn 端到端 y/N

**Files:**
- Create: `packages/coding-agent/test/integration/repl-tool-loop-confirm.test.ts`

**Step 1: Write failing test (RED)**

```ts
// packages/coding-agent/test/integration/repl-tool-loop-confirm.test.ts
/**
 * REPL turn + 真 policy.confirm 端到端 (Sprint 1c-revive-3-D-15, 2026-06-05).
 *
 * 覆盖 (D-15 验收):
 *   - REPL + 真 confirm 注入 + 用户输 y → 工具真落盘 + 落 user_approved
 *   - REPL + 真 confirm 注入 + 用户输 n → 工具不执行 + 落 user_denied
 *   - REPL + 真 confirm 注入 + 用户空输入 → 工具不执行 + 落 user_denied (default N)
 *
 * 拍板 (D-15 plan §Decision 1): 不用真 stdin, 用 mock policy.confirm 走端到端
 * 验证 (因为 repl.ts 用真 readline + 真 stdin, 在 vitest 内难以模拟;
 *  createReplConfirm 的 unit 测在 repl-confirm.test.ts 覆盖).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { LLMClient, ChatResult, ChatChunk, ModelId } from '@deepwhale/llm';
import { runToolLoop } from '../../src/agent/index.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { staticToolPolicy } from '../../src/policy/static-rules.js';
import type { ToolPolicy } from '../../src/policy/types.js';
import { SessionWriter, readSessionEvents } from '@deepwhale/core';
import { createReplConfirm } from '../../src/repl/repl-confirm.js';

function makeMockClient(toolCall: { id: string; name: string; args: Record<string, unknown> }): LLMClient {
  let turn = 0;
  return {
    model: 'mock-d15' as ModelId,
    async chat(): Promise<ChatResult> { throw new Error('not used (we use stream)'); },
    async stream(
      _messages: ReadonlyArray<unknown>,
      opts: { onChunk?: (chunk: ChatChunk) => void },
    ): Promise<ChatResult> {
      turn += 1;
      if (turn === 1) {
        opts.onChunk?.({
          delta: { content: '', tool_calls: [{ id: toolCall.id, name: toolCall.name, args: JSON.stringify(toolCall.args) }] },
          finish_reason: 'tool_calls',
        } as unknown as ChatChunk);
        return {
          model: 'mock-d15' as ModelId,
          content: '',
          tool_calls: [{ id: toolCall.id, name: toolCall.name as never, args: toolCall.args }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      }
      opts.onChunk?.({ delta: { content: 'done' }, finish_reason: 'stop' } as unknown as ChatChunk);
      return { model: 'mock-d15' as ModelId, content: 'done', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    },
  };
}

function getToolStepResult(result: Awaited<ReturnType<typeof runToolLoop>>): { success: boolean; error?: string } | null {
  const toolStep = result.steps.find((s) => s.kind === 'tool');
  return toolStep && toolStep.kind === 'tool' ? toolStep.result : null;
}

function buildPolicyWithInput(answerLines: string[]): { policy: ToolPolicy; pushAnswer: (line: string) => void; endInput: () => void } {
  const input = new PassThrough();
  const output = new PassThrough(); // 吃掉 prompt 字符串避免污染 test output
  output.on('data', () => {});
  const confirm = createReplConfirm({ input, output });
  const policy: ToolPolicy = { ...staticToolPolicy, confirm };
  return {
    policy,
    pushAnswer: (line: string) => input.write(`${line}\n`),
    endInput: () => input.end(),
  };
}

describe('REPL + policy.confirm 端到端 (D-15)', () => {
  it('用户输 y → write_file 真落盘 + session 落 user_approved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-'));
    try {
      const target = join(dir, 'target.txt');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      const { policy, pushAnswer } = buildPolicyWithInput(['y']);
      const client = makeMockClient({ id: 'c1', name: 'write_file', args: { path: target, content: 'y-yes' } });
      setImmediate(() => pushAnswer('y'));
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy,
        isInteractive: true,
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      expect(toolResult!.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('y-yes');
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_approved');
        expect(ev.reason).toBe('user approved');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('用户输 n → 工具不执行 + session 落 user_denied (reason: user denied confirmation)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'original');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      const { policy, pushAnswer } = buildPolicyWithInput(['n']);
      const client = makeMockClient({ id: 'c1', name: 'write_file', args: { path: target, content: 'n-no' } });
      setImmediate(() => pushAnswer('n'));
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy,
        isInteractive: true,
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      expect(toolResult!.success).toBe(false);
      expect(toolResult!.error).toMatch(/policy_blocked: user denied confirmation/);
      // 文件未覆盖
      expect(readFileSync(target, 'utf8')).toBe('original');
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_denied');
        expect(ev.reason).toBe('user denied confirmation');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('用户空输入 (默认 N) → 工具不执行 + session 落 user_denied (reason: user dismissed confirmation)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-repl-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'original');
      const sessionPath = join(dir, 'session.jsonl');
      const writer = new SessionWriter(sessionPath);
      await writer.open();
      const { policy, endInput } = buildPolicyWithInput([]);
      const client = makeMockClient({ id: 'c1', name: 'write_file', args: { path: target, content: 'empty' } });
      setImmediate(() => endInput()); // EOF → null → dismissed
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy,
        isInteractive: true,
        yes: false,
        writer,
        onChunk: () => {},
      });
      const toolResult = getToolStepResult(result);
      expect(toolResult!.success).toBe(false);
      expect(toolResult!.error).toMatch(/policy_blocked: user dismissed confirmation/);
      expect(readFileSync(target, 'utf8')).toBe('original');
      await writer.close();
      const events = await readSessionEvents(sessionPath);
      const policyEvents = events.filter((e) => e.kind === 'policy_decision');
      expect(policyEvents).toHaveLength(1);
      const ev = policyEvents[0]!;
      if (ev.kind === 'policy_decision') {
        expect(ev.decision).toBe('user_denied');
        expect(ev.reason).toBe('user dismissed confirmation');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2: Run test to verify pass**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/integration/repl-tool-loop-confirm.test.ts
```

Expected: 3/3 PASS.

---

### Task 5: README D-15 文档更新 (4 处)

**Files:** `README.md`

**Step 1: 改行 333 表格 (REPL (default) 行)**

旧:
```
| REPL (default) | `true`        | **fail-closed deny** (无 confirm impl) | **fail-closed deny** | bypass → 真执行 | **D-15 拍板**（现状: readline prompt 留 D-15, MVP 用 `--yes`） |
```
新:
```
| REPL (default) | `true`        | y/N prompt (REPL 注入 `replConfirm`) | fail-closed deny     | bypass → 真执行 | **D-15 ship** (2026-06-05): REPL 走 y/N readline prompt, 空输入默认 N, Ctrl+C/EOF → dismissed (user_denied); `--yes` 仍先于 prompt bypass 落 user_approved |
```

**Step 2: 改行 339-347 REPL 现状段 (整段重写)**

旧整段保留 D-13 历史 + 加 D-15 现状:
```
- REPL **D-15 现状 (2026-06-05 ship)**: 注入 `createReplConfirm()` 到 `replPolicy = {...staticToolPolicy, confirm: replConfirm}`. 遇 `require_confirmation` 时打印 `Allow <tool>? (<reason>) [y/N]: `, 用户输 `y` / `yes` → 落 `user_approved` 放行, 输 `n` / `no` / 空 / Ctrl+C / EOF → 落 `user_denied` 拒绝. prompt 字符串**不**含原始 args / secret, 只暴露 tool name + sanitized reason.
- REPL **D-13 历史** (D-15 之前, 2026-06-05 早): `isInteractive=true` 但 `staticToolPolicy.confirm = undefined` → 走 `no confirm impl` 分支 → fail-closed deny. **不是** y/N prompt. D-15 注入真 confirm 后废弃.
- REPL **bypass**: 加 `--yes` (启动时) → `ctx.yes=true` → `require_confirmation` bypassed → 落 `user_approved` 放行. **拍板红线**: `--yes` 优先于 confirm 提示 (D-13.5 P1 重排), confirm 注入 0 调用, 仍是 user_approved 审计.
```

**Step 3: 改行 415-417 验收红线 #5**

旧:
```
5. ✅ **REPL 现状 fail-closed** (D-13 review P2 修复 2026-06-05): `isInteractive=true` 但
   `staticToolPolicy.confirm` 是 undefined → 走 `no confirm impl` → deny (跟 print/rpc 一致)
   (D-15 注入真 confirm 才允许 y/N 拍板, 当前 D-13 MVP 必须 `--yes`)
```
新:
```
5. ✅ **REPL 注入真 confirm** (D-15 ship 2026-06-05): REPL 启动时构造 `replPolicy = {...staticToolPolicy, confirm: createReplConfirm()}`, 走 `Allow <tool>? (<reason>) [y/N]: ` prompt, y/yes → 落 `user_approved` 放行, n/no/空/EOF → 落 `user_denied` 拒绝, `--yes` 永远先于 confirm bypass (D-13.5 P1 重排, 0 改). 见 `src/repl/repl-confirm.ts` + `test/repl/repl-confirm.test.ts` (11 it) + `test/integration/repl-tool-loop-confirm.test.ts` (3 it)
6. ✅ **D-13 fail-closed 历史保留** (D-13 review P2 修复 2026-06-05): D-15 之前 REPL 现状是 `isInteractive=true` 但 `staticToolPolicy.confirm = undefined` → 走 `no confirm impl` → deny. D-15 注入 confirm 后历史, 拍板测试 `policy.confirm = undefined` 仍走 fail-closed, 兼容 (见 `tool-loop-policy.test.ts` "no confirm impl → deny" 测).
```

**Step 4: 改行 437 集成测计数**

旧:
```
- `integration/tool-loop-policy.test.ts` — 端到端 13 例覆盖验收红线 (D-13 11 例 + D-13.5 重排补 2 例: print/rpc + --yes 走 ctx.yes first 行为差异真证据)
```
新:
```
- `integration/tool-loop-policy.test.ts` — 端到端 15 例覆盖验收红线 (D-13 11 例 + D-13.5 重排补 2 例 + D-15 confirm 注入补 2 例: REPL + confirm 走 user_approved / --yes 优先 confirm 0 调用)
- `integration/repl-tool-loop-confirm.test.ts` — REPL + 真 confirm 端到端 3 例 (y/n/空) (D-15)
- `repl/repl-confirm.test.ts` — `createReplConfirm` factory unit 11 例 (y/yes/Y/YES/n/no/N/NO/空/other/EOF/abort/secret 排除) (D-15)
```

---

### Task 6: 最终验证 + 4 自检 + commit + push + 飞书通知

**Step 1: 跑 pnpm 全验证**

```bash
cd ~/deepwhale && pnpm build
cd ~/deepwhale && pnpm lint
cd ~/deepwhale && pnpm typecheck
cd ~/deepwhale && pnpm test
```

Expected: 全 PASS.

**Step 2: 4 自检 (4 验证必跑, 跟 P38 + scansci-pdf 复盘一致)**
1. 占位符残留: 0
2. 优先级 vs 文字矛盾: 0 (replPolicy 注入跟 README 表格一致, --yes 优先 confirm 跟 tool-loop.ts:334 一致)
3. 上游张冠李戴: 0 (D-15 不改 D-13 接口, 0 引入外部 spec)
4. **估算数字 vs 实测数字** (P38/scansci-pdf 复盘教训): `grep -cE '^\s*it\('` 跑所有 6 文件 (新增 2 + 改 1 + 已存 4) + README 写的数字**全对上**.

**Step 3: commit + push + 飞书通知**

- Commit 格式: `feat(repl+policy): D-15 — REPL y/N confirmation prompt (readline)`
- Auto-push (用户偏好 2026-06-04 改: 不 push → 自动 push)
- 飞书推送通知含 commit hash + diff stat + 验证 + 明天 reviewer 重点 review 列表.

---

## 明天 reviewer 重点 review 文件

1. **`packages/coding-agent/src/repl/repl-confirm.ts`** (新文件, 105 行) — 工厂实现 + prompt 格式 + abort signal + 1 行 close
2. **`packages/coding-agent/src/repl/repl.ts`** (改 3 行) — import + 构造 replPolicy + 注入两处
3. **`packages/coding-agent/test/integration/repl-tool-loop-confirm.test.ts`** (新文件, ~120 行) — REPL 端到端 y/n/空 3 例
4. **`packages/coding-agent/test/repl/repl-confirm.test.ts`** (新文件, ~80 行) — unit 11 例
5. **`packages/coding-agent/test/integration/tool-loop-policy.test.ts`** (改行 297 + 加 2 sibling) — D-15 兼容 + --yes bypass confirm
6. **`README.md`** (4 处改) — 表格 / REPL 现状段 / 验收红线 #5+#6 / 集成测计数
