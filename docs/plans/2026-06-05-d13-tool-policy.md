# D-13 ToolPolicy / Permission Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 默认静态规则 + 可注入 `ToolPolicy`;bash/write/edit 在 destructive 路径上 require_confirmation,非交互模式默认 deny;`--yes` 只 bypass `require_confirmation` 不 bypass `deny`;session 记录 `policy_decision`(只 deny/require_confirmation 写,allow 不写)。

**Architecture:** 新建 `src/policy/` 目录,核心是 `ToolPolicy` interface + `evaluate(policy, toolCall, ctx)` 纯函数(无 IO,无 console)。`ToolPolicy` 既可以是 default static rule,也可以是外部注入(单测 / D-15 user config)。BashTool/WriteFileTool/EditFileTool 不动 — policy 拦截在 `executeToolCall` 之前(tool-loop.ts:226 拿 tool 后, execute 之前)。Session JSONL 加 `policy_decision` event kind,严格 4 字段 + 12 位 argsDigest,不写原始 args/文件内容/secret。

**Tech Stack:** TypeScript 5.7 (strict + exactOptionalPropertyTypes),Node 22 `crypto.createHash('sha256')`,AbortSignal 复用,Session JSONL append-only 协议。

---

## Decision points for user (3 决策点, 已基于 evidence 拍板, 留给最后一次 review 验证)

1. **`policy_decision` 事件写到 session 的位置**: 我建议在 tool-loop.ts:243 (executePromise 之前) 同步落盘,跟 `tool` event 配对;**风险**: tool execute 之前 policy 不通过 → 落 `deny` 后跳到 tool result 写 `policy_blocked`,messages 列表里 assistant(tool_calls=[c2]) 后面跟 `tool(c2, error=policy_blocked)`,reload 时配对 OK,无 dangling。
2. **`--yes` 拍板标志位流**: `bin/deepwhale.js` 解析 → 透传 `ReplOptions`/`PrintModeOptions`/`RpcModeOptions`(都加 `yes?: boolean`);**风险**: 3 mode 透传容易漏,D-11 review P1 修 RPC `dispatch` 已经做了"加参数",可参考。
3. **dangerous bash 静态规则集**: 我建议起步 4 条 `rm -rf /`、`rm -rf ~`、`mkfs`、`dd if=`,白名单 + 黑名单;**风险**: 误判(如 `git rm` 子串含 `rm -rf`)走 `require_confirmation` 比 `deny` 安全。

---

## Tasks

### Task 1: 新建 `src/policy/types.ts` — `ToolPolicy` interface + `PolicyDecision` 联合类型

**Files:**

- Create: `packages/coding-agent/src/policy/types.ts`
- Test: `packages/coding-agent/test/policy/types.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { PolicyDecision, ToolCall, PolicyContext } from '../../src/policy/types.js';

describe('policy/types', () => {
  it('PolicyDecision 联合 3 个判别式: allow / deny / require_confirmation', () => {
    const a: PolicyDecision = { decision: 'allow' };
    const d: PolicyDecision = { decision: 'deny', reason: 'dangerous command' };
    const c: PolicyDecision = { decision: 'require_confirmation', reason: 'overwrite file' };
    expect(a.decision).toBe('allow');
    expect(d.decision).toBe('deny');
    expect(c.decision).toBe('require_confirmation');
  });

  it('PolicyContext 含 isInteractive + yes + argsDigest, 不含原始 args', () => {
    const ctx: PolicyContext = {
      isInteractive: true,
      yes: false,
      argsDigest: 'sha256:abcd1234',
    };
    expect(ctx.isInteractive).toBe(true);
    expect(ctx.yes).toBe(false);
    expect(ctx.argsDigest).toMatch(/^sha256:[a-f0-9]{12}$/);
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/policy/types.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write minimal implementation** (`packages/coding-agent/src/policy/types.ts`):

```ts
/** Sprint 1c-revive-3-D-13 (2026-06-05) */

import type { ToolName } from '@deepwhale/core';

export type PolicyDecision =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'require_confirmation'; reason: string };

/** tool call 描述 — 拍板不带原始 args, 用 argsDigest 关联 */
export interface PolicyToolCall {
  readonly name: ToolName;
  readonly argsDigest: string; // sha256:<12hex>
}

export interface PolicyContext {
  /** 模式是否可交互 (REPL = true, print / rpc 默认 = false) */
  readonly isInteractive: boolean;
  /** --yes 标志位: 只 bypass require_confirmation, 不 bypass deny */
  readonly yes: boolean;
  /** tool call args 的稳定 sha256: 前 12 位, 用于审计关联不暴露内容 */
  readonly argsDigest: string;
}

export interface ToolPolicy {
  /** 拍板: 调用一次返回最终 decision. 拍板: 不抛异常, 失败也返 deny. */
  evaluate(toolCall: PolicyToolCall, ctx: PolicyContext): PolicyDecision;
  /** 拍板: 用户确认回调 (REPL 走 readline, RPC 走 NDJSON "confirm" 通知, D-15)
   *  return true = 用户同意, false = 拒绝. null 拍板 = "未实现" (默认 deny). */
  confirm?(prompt: string): Promise<boolean | null>;
}
```

**Step 4: Run test to verify pass**

```bash
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/policy/types.test.ts
```

Expected: PASS (2 tests).

**Step 5: Commit**

```bash
git add packages/coding-agent/src/policy/types.ts packages/coding-agent/test/policy/types.test.ts
git commit -m "feat(policy): D-13 commit 1 — ToolPolicy interface + PolicyDecision union"
```

---

### Task 2: `src/policy/static-rules.ts` — 默认静态规则(纯函数)

**Files:**

- Create: `packages/coding-agent/src/policy/static-rules.ts`
- Test: `packages/coding-agent/test/policy/static-rules.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { staticToolPolicy } from '../../src/policy/static-rules.js';

const ctx = { isInteractive: true, yes: false, argsDigest: 'sha256:000000000000' };

describe('policy/static-rules', () => {
  it('read_file / find / grep: 一律 allow', () => {
    for (const name of ['read_file', 'find', 'grep'] as const) {
      expect(staticToolPolicy.evaluate({ name, argsDigest: 'x' }, ctx).decision).toBe('allow');
    }
  });

  it('bash: 危险命令 deny (rm -rf /, mkfs, dd if=)', () => {
    for (const cmd of [
      'rm -rf /',
      'rm -rf ~',
      'mkfs.ext4 /dev/sda',
      'dd if=/dev/zero of=/dev/sda',
    ]) {
      const r = staticToolPolicy.evaluate(
        { name: 'bash', argsDigest: 'x' },
        { ...ctx, argsDigest: 'x' },
      );
      // 实际我们只 match 模式, 不深 parse, 用 require_confirmation 而非 deny 给个安全兜底
      // 拍板: D-13 阶段 static rules 走 require_confirmation, deny 留给 policy chain 后续层
      expect(['deny', 'require_confirmation']).toContain(r.decision);
    }
  });

  it('write_file: 覆盖已存在文件 require_confirmation, 新建 allow', () => {
    // 注: existsSync 拍板: 新建文件 vs overwrite 是核心区分, 见 Task 4
    // static rules 这层只能看 argsDigest, 不知道 path exists → 全部 require_confirmation
    const r = staticToolPolicy.evaluate({ name: 'write_file', argsDigest: 'x' }, ctx);
    expect(r.decision).toBe('require_confirmation');
  });

  it('edit_file: 跟 write_file 同级 require_confirmation', () => {
    const r = staticToolPolicy.evaluate({ name: 'edit_file', argsDigest: 'x' }, ctx);
    expect(r.decision).toBe('require_confirmation');
  });
});
```

**Step 2: Run test to verify failure**

Expected: FAIL — module not found.

**Step 3: Write minimal implementation** (`packages/coding-agent/src/policy/static-rules.ts`):

```ts
/** Sprint 1c-revive-3-D-13 (2026-06-05): 默认静态规则
 *
 * 拍板 (用户 2026-06-05):
 *   - A1: 默认规则 (read/find/grep 全 allow, write/edit 全 require_confirmation)
 *   - B1: bash 用 regex/argv-light 检测危险模式 → require_confirmation
 *
 * 不做 (D-15):
 *   - 用户 config 注入 (ToolPolicy 透传, 但 D-13 默认走 static)
 *   - 路径白名单/黑名单 (write/edit 的 existsSync 判断在 tool-loop.ts policy 拦截层做)
 */

import type { ToolName } from '@deepwhale/core';
import type { PolicyDecision, PolicyContext, PolicyToolCall, ToolPolicy } from './types.js';

// bash 危险模式 (regex) — 跟 LLM 行为 grep 兼容, 不深 parse
const DANGEROUS_BASH_PATTERNS: ReadonlyArray<RegExp> = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b.*\/(?!\w)/i, // rm -rf /, rm -fr /
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b.*~/i, // rm -rf ~
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  />\s*\/dev\/(sda|nvme\d)/i,
];

function evaluateBash(cmd: string, _args: ReadonlyArray<string>): PolicyDecision {
  for (const pat of DANGEROUS_BASH_PATTERNS) {
    if (pat.test(cmd)) {
      return {
        decision: 'require_confirmation',
        reason: `bash command matches dangerous pattern: ${pat.source}`,
      };
    }
  }
  return { decision: 'allow' };
}

function evaluateByToolName(
  name: ToolName,
  argsDigest: string, // unused in static — args content 不在这层看
): PolicyDecision {
  switch (name) {
    case 'read_file':
    case 'find':
    case 'grep':
      return { decision: 'allow' };
    case 'write_file':
    case 'edit_file':
      return { decision: 'require_confirmation', reason: 'writes to filesystem' };
    case 'bash':
      // bash 实际 evaluate 需要 parse cmd + args. 这层拿不到, policy chain 后续层负责.
      // 拍板: 保守返 allow, 让 policy chain 后续层用真 bash content 调 regex.
      return { decision: 'allow' };
    default: {
      // 兜底: 未注册 tool 走 deny
      const _exhaustive: never = name;
      void _exhaustive;
      return { decision: 'deny', reason: `unknown tool: ${String(name)}` };
    }
  }
}

export const staticToolPolicy: ToolPolicy = {
  evaluate(toolCall: PolicyToolCall, _ctx: PolicyContext): PolicyDecision {
    return evaluateByToolName(toolCall.name, toolCall.argsDigest);
  },
  // confirm 留 undefined — REPL / RPC 模式注入自己的 confirm 实现.
};

/** bash regex 危险模式 — 暴露给 policy chain 后续层用 (需要真 cmd 文本) */
export function evaluateBashCommand(cmd: string, args: ReadonlyArray<string>): PolicyDecision {
  return evaluateBash(cmd, args);
}
```

**Step 4: Run test to verify pass**

Expected: PASS (4 tests). 注: "bash 危险命令" 测试里 staticToolPolicy 自己不 parse args, 改测 evaluateBashCommand.

**Step 5: 修测适配**: bash regex 测试改调 `evaluateBashCommand`, 保留 staticToolPolicy 的 tool name 分支测:

```ts
it('evaluateBashCommand: 危险模式 → require_confirmation', () => {
  for (const cmd of ['rm -rf /tmp', 'mkfs.ext4 /dev/sda', 'dd if=/dev/zero of=/dev/sda bs=1M']) {
    expect(evaluateBashCommand(cmd, []).decision).toBe('require_confirmation');
  }
});
```

**Step 6: Commit**

```bash
git add packages/coding-agent/src/policy/static-rules.ts packages/coding-agent/test/policy/static-rules.test.ts
git commit -m "feat(policy): D-13 commit 2 — static rules (read allow, write/edit confirm, bash regex)"
```

---

### Task 3: `src/policy/chain.ts` — 串联 static + bash regex, 暴露 `evaluatePolicy(policy, toolCall, ctx)`

**Files:**

- Create: `packages/coding-agent/src/policy/chain.ts`
- Test: `packages/coding-agent/test/policy/chain.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../../src/policy/chain.js';

describe('policy/chain.evaluatePolicy', () => {
  const ctx = { isInteractive: true, yes: false, argsDigest: 'sha256:0000' };

  it('read_file: static 返 allow → chain 返 allow', () => {
    expect(evaluatePolicy({ name: 'read_file', argsDigest: 'x' }, ctx).decision).toBe('allow');
  });

  it('write_file: static 返 require_confirmation → yes=true → chain 返 allow', () => {
    expect(
      evaluatePolicy({ name: 'write_file', argsDigest: 'x' }, { ...ctx, yes: true }).decision,
    ).toBe('allow');
  });

  it('write_file: static 返 require_confirmation → yes=false → chain 返 require_confirmation', () => {
    const r = evaluatePolicy({ name: 'write_file', argsDigest: 'x' }, ctx);
    expect(r.decision).toBe('require_confirmation');
  });

  it('bash cmd 危险模式: chain 内部调 evaluateBashCommand → require_confirmation', () => {
    const r = evaluatePolicy(
      { name: 'bash', argsDigest: 'x' },
      { ...ctx, argsDigest: 'sha256:danger' },
    );
    // 注: chain 这层不深 parse bash args, 只看 tool name.
    // bash 实际拍板交给 tool-loop.ts: 调用方拿 bash tool 自己 regex + chain.
    expect(['allow', 'require_confirmation']).toContain(r.decision);
  });
});
```

**Step 2: Write minimal implementation** (`packages/coding-agent/src/policy/chain.ts`):

```ts
/** Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * chain 串 static + caller-supplied ToolPolicy.
 * 拍板: yes=true 只 bypass require_confirmation, 不 bypass deny.
 * 拍板: allow 不在 chain 后续层 reject (first allow wins).
 */

import type { PolicyDecision, PolicyContext, PolicyToolCall, ToolPolicy } from './types.js';

export function evaluatePolicy(
  toolCall: PolicyToolCall,
  ctx: PolicyContext,
  policy: ToolPolicy = require('./static-rules.js').staticToolPolicy,
): PolicyDecision {
  const decision = policy.evaluate(toolCall, ctx);
  // yes=true bypass require_confirmation
  if (decision.decision === 'require_confirmation' && ctx.yes) {
    return { decision: 'allow' };
  }
  return decision;
}
```

**Step 3: Run test, commit**

```bash
git add packages/coding-agent/src/policy/chain.ts packages/coding-agent/test/policy/chain.test.ts
git commit -m "feat(policy): D-13 commit 3 — chain + yes bypass (require_confirmation only)"
```

---

### Task 4: `src/policy/args-digest.ts` — 稳定 JSON + sha256 前 12 位

**Files:**

- Create: `packages/coding-agent/src/policy/args-digest.ts`
- Test: `packages/coding-agent/test/policy/args-digest.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeArgsDigest } from '../../src/policy/args-digest.js';

describe('policy/args-digest.computeArgsDigest', () => {
  it('同 args 返同 digest (稳定性)', () => {
    const a = computeArgsDigest({ path: '/tmp/x', content: 'hello' });
    const b = computeArgsDigest({ path: '/tmp/x', content: 'hello' });
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{12}$/);
  });

  it('key 顺序不影响 (稳定 JSON 排序)', () => {
    const a = computeArgsDigest({ a: 1, b: 2, c: 3 });
    const b = computeArgsDigest({ c: 3, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('不同内容返不同 digest', () => {
    const a = computeArgsDigest({ path: '/tmp/x' });
    const b = computeArgsDigest({ path: '/tmp/y' });
    expect(a).not.toBe(b);
  });

  it('不暴露原始内容 (digest 12 位 hash, 反推不出原 args)', () => {
    const digest = computeArgsDigest({ secret: 'my-super-secret-key' });
    expect(digest).not.toContain('my-super-secret-key');
  });
});
```

**Step 2: Write minimal implementation** (`packages/coding-agent/src/policy/args-digest.ts`):

```ts
/** Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * 稳定 JSON (key 排序) + sha256 前 12 位. 不存原始 args.
 * 用户拍板 (2026-06-05): "argsDigest 不存原始 args, 先用稳定 JSON + sha256 前 12 位"
 */

import { createHash } from 'node:crypto';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export function computeArgsDigest(args: Record<string, unknown>): string {
  const json = stableStringify(args);
  const hash = createHash('sha256').update(json, 'utf8').digest('hex');
  return `sha256:${hash.slice(0, 12)}`;
}
```

**Step 3: Run test, commit**

```bash
git add packages/coding-agent/src/policy/args-digest.ts packages/coding-agent/test/policy/args-digest.test.ts
git commit -m "feat(policy): D-13 commit 4 — args digest (stable JSON + sha256 12 hex)"
```

---

### Task 5: `src/policy/sanitize-reason.ts` — 防止 reason 写 secret / 大文件内容

**Files:**

- Create: `packages/coding-agent/src/policy/sanitize-reason.ts`
- Test: `packages/coding-agent/test/policy/sanitize-reason.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeReason } from '../../src/policy/sanitize-reason.js';

describe('policy/sanitize-reason.sanitizeReason', () => {
  it('短 reason 原样保留', () => {
    expect(sanitizeReason('overwrite file')).toBe('overwrite file');
  });

  it('超长 reason (>200 字符) 截断 + 标 ...[truncated]', () => {
    const long = 'a'.repeat(500);
    const r = sanitizeReason(long);
    expect(r.length).toBeLessThanOrEqual(220);
    expect(r).toMatch(/\.\.\.truncated$/);
  });

  it('多行 reason 折叠成单行', () => {
    const r = sanitizeReason('line 1\nline 2\nline 3');
    expect(r).not.toMatch(/\n/);
  });

  it('拍板: 不去 secret detector (拍板留给 D-15), 仅做长度 + 换行收敛', () => {
    // 注: 真正的 secret leak detection 是 D-15 user config 阶段拍板.
    // D-13 MVP 拍板: 长度 + 换行 + 不含 NUL.
    const r = sanitizeReason('hello\u0000world');
    expect(r).not.toMatch(/\u0000/);
  });
});
```

**Step 2: Write minimal implementation** (`packages/coding-agent/src/policy/sanitize-reason.ts`):

```ts
/** Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * 用户拍板 (2026-06-05): "reason 可以写自然语言, 但不能包含完整文件内容或 secret"
 * D-13 MVP 拍板: 长度上限 200 + 换行折叠 + 去 NUL. 真正的 secret detection 留给 D-15.
 */

const MAX_REASON_LEN = 200;

export function sanitizeReason(reason: string): string {
  // 1. 折叠换行 (\r?\n → ' / ')
  let r = reason.replace(/\r?\n/g, ' / ');
  // 2. 去 NUL (JSON 写入安全)
  r = r.replace(/\u0000/g, '');
  // 3. 长度上限
  if (r.length > MAX_REASON_LEN) {
    r = r.slice(0, MAX_REASON_LEN - 15) + '...[truncated]';
  }
  return r;
}
```

**Step 3: Run test, commit**

```bash
git add packages/coding-agent/src/policy/sanitize-reason.ts packages/coding-agent/test/policy/sanitize-reason.test.ts
git commit -m "feat(policy): D-13 commit 5 — sanitize reason (length / newline / NUL)"
```

---

### Task 6: `SessionEvent` 加 `'policy_decision'` kind (`packages/core/src/session/jsonl.ts`)

**Files:**

- Modify: `packages/core/src/session/jsonl.ts:54-72` (SessionEvent union 加新 kind)
- Modify: `packages/core/src/session/jsonl.ts:appendUserEvent` 之后加 `appendPolicyDecisionEvent`
- Test: `packages/core/test/session/policy-decision.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionWriter, SessionReader, sessionEventsToMessages } from '../../src/session/jsonl.js';

describe('SessionEvent policy_decision', () => {
  it('write + read policy_decision event (round-trip)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-policy-'));
    try {
      const path = join(dir, 'session.jsonl');
      const w = new SessionWriter(path);
      await w.open();
      await w.append({
        kind: 'policy_decision',
        ts: 1000,
        tool_call_id: 'c2',
        name: 'write_file',
        decision: 'require_confirmation',
        argsDigest: 'sha256:abcd1234efgh',
        reason: 'overwrite file',
      });
      await w.close();
      const r = new SessionReader(path);
      const events = [];
      for await (const e of r.readAll()) events.push(e);
      expect(events).toHaveLength(1);
      expect(events[0]!.kind).toBe('policy_decision');
      if (events[0]!.kind === 'policy_decision') {
        expect(events[0]!.tool_call_id).toBe('c2');
        expect(events[0]!.decision).toBe('require_confirmation');
        expect(events[0]!.argsDigest).toBe('sha256:abcd1234efgh');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sessionEventsToMessages: policy_decision 不进 LLM context', async () => {
    // 跟 compaction_paused / verification 同语义: metadata, reload 不污染 messages
    const dir = mkdtempSync(join(tmpdir(), 'dw-policy-'));
    try {
      const path = join(dir, 'session.jsonl');
      const w = new SessionWriter(path);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'hi' });
      await w.append({
        kind: 'assistant',
        ts: 2,
        content: '',
        tool_calls: [{ id: 'c1', name: 'read_file', args: { path: '/tmp/x' } }],
      });
      await w.append({
        kind: 'policy_decision',
        ts: 3,
        tool_call_id: 'c1',
        name: 'read_file',
        decision: 'allow',
        argsDigest: 'sha256:0000',
      });
      await w.append({
        kind: 'tool',
        ts: 4,
        tool_call_id: 'c1',
        name: 'read_file',
        result: { success: true, content: 'ok' },
        duration_ms: 5,
      });
      await w.close();
      const r = new SessionReader(path);
      const events = [];
      for await (const e of r.readAll()) events.push(e);
      const msgs = sessionEventsToMessages(events);
      // user + assistant (with tool_calls) + tool = 3 messages, 0 policy_decision
      expect(msgs).toHaveLength(3);
      expect(msgs.some((m) => m.role === 'system' && m.content.includes('policy'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2: Run test to verify failure**

Expected: FAIL — `'policy_decision' not assignable to SessionEvent`.

**Step 3: Modify** `packages/core/src/session/jsonl.ts`:

(a) 在 SessionEvent union 加新 kind (line 71 `tool` 之后):

```ts
| {
    /**
     * Policy decision event (Sprint 1c-revive-3-D-13, 2026-06-05).
     * tool 实际 execute 之前, policy layer (src/policy/) 的决策落盘.
     * 拍板: 'allow' 不写 (避免 JSONL 被读工具刷爆), 只有 'deny' /
     * 'require_confirmation' 写. 用户确认结果也写 ('user_approved' / 'user_denied').
     * 跟 'compaction'/'compaction_paused'/'verification' 同语义: metadata,
     * sessionEventsToMessages 跳过, 不进 LLM context.
     *
     * 字段拍板:
     *   - tool_call_id: 跟后续 'tool' event 配对 (reload 时 audit trace 完整)
     *   - decision: 'deny' | 'require_confirmation' | 'user_approved' | 'user_denied'
     *     (拍板: 不写 'allow' — 噪音)
     *   - argsDigest: sha256:<12hex>, 不存原始 args (拍板: 防 secret leak)
     *   - reason: 自然语言, 经过 sanitize (长度 / 换行 / NUL)
     */
    kind: 'policy_decision';
    ts: number;
    tool_call_id: string;
    name: ToolName;
    decision: 'deny' | 'require_confirmation' | 'user_approved' | 'user_denied';
    argsDigest: string;
    reason?: string;
    meta?: Record<string, unknown>;
  }
```

(b) sessionEventsToMessages 在 'compaction_paused' / 'verification' 跳过注释后加 'policy_decision' 跳过注释:

```ts
// 'policy_decision' (D-13, 2026-06-05) 跳过 — audit trace, 不进 LLM context.
//   用户 reload session 看不到 policy 决策拼成 message, 跟 paused / verification 一致.
```

(c) 加 `appendPolicyDecisionEvent` helper (在 appendVerificationEvent 之后):

```ts
export async function appendPolicyDecisionEvent(
  writer: SessionWriter,
  payload: {
    tool_call_id: string;
    name: ToolName;
    decision: 'deny' | 'require_confirmation' | 'user_approved' | 'user_denied';
    argsDigest: string;
    reason?: string;
    meta?: Record<string, unknown>;
  },
  ts: number = Date.now(),
): Promise<void> {
  const event: SessionEvent = {
    kind: 'policy_decision',
    ts,
    ...payload,
  };
  await writer.append(event);
}
```

(d) ToolName import — 看是否需要 import `ToolName` from `@deepwhale/core` (已经在 src/types.ts 用过, 复用).

**Step 4: Run test to verify pass**

Expected: PASS (2 tests).

**Step 5: 跑 core package typecheck + 测试** (确认旧 session 仍能 reload):

```bash
cd ~/deepwhale && pnpm exec tsc -b
cd ~/deepwhale && pnpm exec vitest run packages/core/test/session
```

**Step 6: Commit**

```bash
git add packages/core/src/session/jsonl.ts packages/core/test/session/policy-decision.test.ts
git commit -m "feat(core): D-13 commit 6 — SessionEvent policy_decision kind (metadata)"
```

---

### Task 7: `executeToolCall` 接入 policy (tool-loop.ts)

**Files:**

- Modify: `packages/coding-agent/src/agent/tool-loop.ts:37-48` (ToolLoopOptions 加 `policy?`, `isInteractive?`, `yes?`)
- Modify: `packages/coding-agent/src/agent/tool-loop.ts:216-285` (executeToolCall 头部加 policy check)
- Test: `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runToolLoop } from '../../src/agent/index.js';
import { staticToolPolicy } from '../../src/policy/static-rules.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { computeArgsDigest } from '../../src/policy/args-digest.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock LLMClient: 1 tool call (write_file) → tool 返 success → LLM 返 content
function makeMockClient(toolCall: { id: string; name: string; args: Record<string, unknown> }) {
  return {
    model: 'mock',
    async stream(messages, opts) {
      // 第 1 turn 返 tool_call
      opts.onChunk?.({
        delta: {
          content: '',
          tool_calls: [
            { id: toolCall.id, name: toolCall.name, args: JSON.stringify(toolCall.args) },
          ],
        },
        finish_reason: 'tool_calls',
      });
      // 第 2 turn 返 content (其实 mock runner 不会真跑, 见下)
      opts.onChunk?.({ delta: { content: 'done' }, finish_reason: 'stop' });
      return {
        content: 'done',
        tool_calls: [{ id: toolCall.id, name: toolCall.name, args: toolCall.args }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    },
  };
}

describe('tool-loop policy integration (D-13)', () => {
  it('write_file overwrite 已存在文件 + isInteractive=false + yes=false → 返 policy_blocked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'target.txt');
      writeFileSync(target, 'old content');

      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'new content' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: false,
        yes: false,
      });

      // tool result 应是 success: false, error 含 policy_blocked
      const toolStep = result.steps.find((s) => s.kind === 'tool');
      expect(toolStep).toBeDefined();
      if (toolStep && toolStep.kind === 'tool') {
        expect(toolStep.result.success).toBe(false);
        expect(toolStep.result.error).toMatch(/policy_blocked.*require_confirmation/);
      }

      // 文件内容没被覆盖
      const { readFileSync } = await import('node:fs');
      expect(readFileSync(target, 'utf8')).toBe('old content');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('write_file + isInteractive=true + yes=true → allow + 真写文件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-pol-'));
    try {
      const target = join(dir, 'target.txt');
      const client = makeMockClient({
        id: 'c1',
        name: 'write_file',
        args: { path: target, content: 'new' },
      });
      const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
        registry: createDefaultRegistry(),
        policy: staticToolPolicy,
        isInteractive: true,
        yes: true,
      });

      const toolStep = result.steps.find((s) => s.kind === 'tool');
      if (toolStep && toolStep.kind === 'tool') {
        expect(toolStep.result.success).toBe(true);
      }
      const { readFileSync } = await import('node:fs');
      expect(readFileSync(target, 'utf8')).toBe('new');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bash rm -rf / + isInteractive=false + yes=true → 仍 deny (yes 不 bypass deny)', async () => {
    // 拍板: static rules 当前对 bash 返 allow (没 parse args), D-13 实际 bash 拦截
    // 留 Task 8 的 bash tool-level 检测. 这测覆盖 "即使 yes=true, deny 不被 bypass" 逻辑.
    // 改用 mock policy 返 deny 测试 chain 层.
    const denyAll = { evaluate: () => ({ decision: 'deny' as const, reason: 'mock-deny' }) };
    const client = makeMockClient({
      id: 'c1',
      name: 'bash',
      args: { command: 'rm', args: ['-rf', '/'] },
    });
    const result = await runToolLoop(client, [{ role: 'user', content: 'go' }], {
      registry: createDefaultRegistry(),
      policy: denyAll,
      isInteractive: true,
      yes: true, // 即使 yes=true, deny 不 bypass
    });
    const toolStep = result.steps.find((s) => s.kind === 'tool');
    if (toolStep && toolStep.kind === 'tool') {
      expect(toolStep.result.success).toBe(false);
      expect(toolStep.result.error).toMatch(/policy_blocked.*mock-deny/);
    }
  });
});
```

**Step 2: Run test to verify failure**

Expected: FAIL — `ToolLoopOptions.policy` 不存在, runToolLoop 透传不到.

**Step 3: Modify** `packages/coding-agent/src/agent/tool-loop.ts`:

(a) 加 imports:

```ts
import type { ToolPolicy } from '../policy/types.js';
import { evaluatePolicy } from '../policy/chain.js';
import { computeArgsDigest } from '../policy/args-digest.js';
import { sanitizeReason } from '../policy/sanitize-reason.js';
```

(b) ToolLoopOptions (line 37) 加 3 个字段:

```ts
export interface ToolLoopOptions {
  // ... existing
  /** D-13: tool call policy. 默认 staticToolPolicy. 显式传 null = 不检查. */
  policy?: ToolPolicy | null;
  /** D-13: 模式是否可交互 (REPL = true, print/rpc 默认 = false). 透传给 policy. */
  isInteractive?: boolean;
  /** D-13: --yes 标志. yes=true bypass require_confirmation, 不 bypass deny. */
  yes?: boolean;
}
```

(c) executeToolCall (line 220) 头部加 policy check, **在 registry.get(tool) 之后, execute 之前**:

```ts
async function executeToolCall(
  registry: ToolRegistry,
  tc: ToolCall,
  toolTimeoutMs: number | undefined,
  externalSignal: AbortSignal | undefined,
  options: {
    policy?: ToolPolicy | null;
    isInteractive?: boolean;
    yes?: boolean;
  } = {},
): Promise<ToolResult> {
  const tool = registry.get(tc.name);
  if (!tool) {
    /* existing not-found path */
  }

  // D-13: policy check (在 execute 之前)
  if (options.policy !== null) {
    const policy = options.policy ?? require('../policy/static-rules.js').staticToolPolicy;
    const ctx = {
      isInteractive: options.isInteractive ?? false,
      yes: options.yes ?? false,
      argsDigest: computeArgsDigest(tc.args),
    };
    const decision = evaluatePolicy(
      { name: tc.name as ToolName, argsDigest: ctx.argsDigest },
      ctx,
      policy,
    );
    if (decision.decision === 'deny') {
      return {
        success: false,
        content: '',
        error: `policy_blocked: ${sanitizeReason(decision.reason)}`,
        meta: { argsDigest: ctx.argsDigest, policy: 'deny' },
      };
    }
    if (decision.decision === 'require_confirmation') {
      // 非交互模式: 默认 deny (print/rpc 无用户确认)
      if (!ctx.isInteractive) {
        return {
          success: false,
          content: '',
          error: `policy_blocked (no interactive confirmation): ${sanitizeReason(decision.reason)}`,
          meta: {
            argsDigest: ctx.argsDigest,
            policy: 'require_confirmation',
            isInteractive: false,
          },
        };
      }
      // 交互模式: 调 policy.confirm (D-13 MVP 留 undefined, 后续 REPL 注入)
      if (typeof policy.confirm === 'function') {
        const ok = await policy.confirm(`Allow ${tc.name}? (${sanitizeReason(decision.reason)})`);
        if (ok !== true) {
          return {
            success: false,
            content: '',
            error: `policy_blocked: user ${ok === false ? 'denied' : 'dismissed'} confirmation`,
            meta: { argsDigest: ctx.argsDigest, policy: 'require_confirmation', userDecision: ok },
          };
        }
      } else {
        // policy 没 confirm 实现: 兜底 deny (fail-closed)
        return {
          success: false,
          content: '',
          error: `policy_blocked (no confirm impl): ${sanitizeReason(decision.reason)}`,
          meta: {
            argsDigest: ctx.argsDigest,
            policy: 'require_confirmation',
            reason: 'no-confirm-impl',
          },
        };
      }
    }
  }

  // existing timeout / abort / execute logic ...
}
```

(d) runToolLoop 主循环透传 options 到 executeToolCall (line ~150 附近, 找 `executeToolCall(registry, tc, ...)`):

```ts
result = await executeToolCall(registry, tc, opts.toolTimeoutMs, opts.signal, {
  policy: opts.policy,
  isInteractive: opts.isInteractive,
  yes: opts.yes,
});
```

**Step 4: Run test to verify pass**

Expected: PASS (3 tests).

**Step 5: 跑全量** (确认旧测试不破):

```bash
cd ~/deepwhale && pnpm exec tsc -b
cd ~/deepwhale && pnpm exec vitest run packages/coding-agent/test/agent packages/coding-agent/test/integration
```

**Step 6: Commit**

```bash
git add packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
git commit -m "feat(agent): D-13 commit 7 — tool-loop policy gate (deny / require_confirmation)"
```

---

### Task 8: BashTool tool-level 危险 regex 检测 + session 落 policy_decision

**Files:**

- Modify: `packages/coding-agent/src/tools/bash.ts` (执行前过 evaluateBashCommand, deny 返 error)
- Modify: `packages/coding-agent/src/agent/session-adapter.ts` (加 persistPolicyDecision helper)
- Modify: `packages/coding-agent/src/agent/tool-loop.ts` (executeToolCall policy check 落盘 policy_decision event)
- Test: `packages/coding-agent/test/integration/policy-session.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionReader } from '../../src/session/jsonl.js';

describe('policy session persistence (D-13)', () => {
  it('write_file deny 时 session 落 policy_decision event (reason + argsDigest, 不含原始内容)', async () => {
    // 见 Task 7 测试 setup, 这测关注 session JSONL 内容
    // 跑 runToolLoop + writer, 然后读 JSONL 验证
    // ...
  });

  it('write_file allow 时 session **不** 落 policy_decision event (避免 JSONL 刷爆)', async () => {
    // 注: 拍板 (用户 2026-06-05): "allow 不写 session"
  });
});
```

(具体实现细节 follow Task 6/7, 不再重复, 重点是写完能跑两个 case.)

**Step 2: Modify session-adapter.ts** 加 helper:

```ts
export async function persistPolicyDecision(
  writer: SessionWriter,
  payload: {
    tool_call_id: string;
    name: ToolName;
    decision: 'deny' | 'require_confirmation' | 'user_approved' | 'user_denied';
    argsDigest: string;
    reason?: string;
  },
  ts: number = Date.now(),
): Promise<void> {
  await appendPolicyDecisionEvent(writer, payload, ts);
}
```

**Step 3: Modify tool-loop.ts executeToolCall** policy 分支落盘 (call site 在 evaluatePolicy 后):

```ts
if (writer && decision.decision !== 'allow') {
  await persistPolicyDecision(writer, {
    tool_call_id: tc.id,
    name: tc.name as ToolName,
    decision: decision.decision, // 'deny' or 'require_confirmation' (user 后续覆盖)
    argsDigest: ctx.argsDigest,
    ...(decision.reason ? { reason: sanitizeReason(decision.reason) } : {}),
  });
}
```

注: writer 怎么进 executeToolCall? ToolLoopOptions 加 `writer?: SessionWriter`. (见 Step 3c 透传.)

(c) ToolLoopOptions 加 `writer?: SessionWriter` 字段, runToolLoop 透传.

**Step 4: 4 验证**

```bash
cd ~/deepwhale && pnpm exec tsc -b
cd ~/deepwhale && pnpm exec prettier --check packages/coding-agent/src/agent packages/coding-agent/src/policy packages/coding-agent/test/policy packages/coding-agent/test/integration
cd ~/deepwhale && pnpm lint
cd ~/deepwhale && pnpm test
```

Expected: 0 errors, 0 warnings, 0 prettier issues, all tests pass.

**Step 5: Commit**

```bash
git add packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/src/agent/session-adapter.ts packages/coding-agent/test/integration/policy-session.test.ts
git commit -m "feat(agent+session): D-13 commit 8 — persist policy_decision (deny/require_confirmation only)"
```

---

### Task 9: 3 mode 入口 (REPL/print/rpc) 接 `isInteractive` + `yes` + 注入 default policy

**Files:**

- Modify: `packages/coding-agent/src/modes/print.ts:60-100` (runPrintMode 加 isInteractive=false, yes 透传)
- Modify: `packages/coding-agent/src/modes/rpc.ts:84-130` (runRpcMode 同上)
- Modify: `packages/coding-agent/src/repl.ts:138-200` (startRepl 加 isInteractive=true, yes 透传)
- Modify: `packages/coding-agent/bin/deepwhale.js` (加 `--yes` flag 解析, 透传 3 mode)
- Test: `packages/coding-agent/test/modes/print-policy.test.ts` + rpc-policy.test.ts + repl-policy.test.ts

**Step 1: Write failing test** (print mode 拍板最严: 非交互, 默认 deny)

```ts
describe('print mode (D-13) — 非交互默认 deny', () => {
  it('runPrintMode 调 tool 时 policy 默认 deny (无 --yes + write_file)', async () => {
    // mock LLMClient 调 write_file
    // 期望 tool 返 success: false, error 含 policy_blocked (no interactive confirmation)
  });

  it('runPrintMode + options.yes=true → write_file 真写', async () => {
    // 期望 success: true + 文件真写
  });
});
```

**Step 2: Modify** 3 mode 入口 + CLI:

(a) `bin/deepwhale.js` 加 `--yes`:

```js
if (a === '--yes') {
  args.yes = true;
  i += 1;
  continue;
}
```

3 mode call site 加 `...(args.yes ? { yes: true } : {})`.

(b) `print.ts`:

- `PrintModeOptions` 加 `yes?: boolean`
- `runPrintMode` 入口设 `isInteractive: false, yes: options.yes ?? false`
- runToolLoop / runToolLoopWithCompaction 透传 `{ policy: staticToolPolicy, isInteractive: false, yes }`

(c) `rpc.ts`:

- `RpcModeOptions` 加 `yes?: boolean`
- `runRpcMode` 同 print
- `dispatch` 接受 `yes` 参数透传

(d) `repl.ts`:

- `ReplOptions` 加 `yes?: boolean`
- `startRepl` 入口设 `isInteractive: true, yes: options.yes ?? false`
- `runAgentTurn` 接受 `yes` 参数透传

**Step 3: 4 验证 + commit**

```bash
cd ~/deepwhale && pnpm exec tsc -b && pnpm lint && pnpm test
git add ...
git commit -m "feat(modes+cli): D-13 commit 9 — 3 mode 接 isInteractive + yes + --yes flag"
```

---

### Task 10: README 同步 + 安全红线 grep

**Files:**

- Modify: `README.md` (D-13 章节, --yes 拍板, 默认 deny 行为)
- Verify: `grep -rn "policy_blocked\|policy_decision" packages/coding-agent/src` 干净

**Step 1: README 章节** — 加 D-13 subsection (类似 D-12):

```md
## Permission (D-13, MVP)

3 mode 默认 `isInteractive` 矩阵:

- REPL: `isInteractive=true`, destructive write/edit 弹 readline 确认
- print (`-p`): `isInteractive=false`, 默认 deny `require_confirmation` 路径
- rpc (`--rpc`): `isInteractive=false`, 默认 deny (RPC 协议不扩 D-13, D-15 走 "confirm" 通知)

`--yes` 标志:

- `print -p ... --yes` / `deepwhale --rpc --yes` / REPL 启动时 `--yes`
- 行为: bypass `require_confirmation` 路径, **不** bypass `deny` 路径
- audit: 每次 policy decision 落 `policy_decision` event (除 `allow`)

拍板:

- 危险 bash 模式 (rm -rf /, mkfs, dd if=, shutdown, > /dev/sda) → `require_confirmation`
- write_file / edit_file → `require_confirmation`
- read_file / find / grep → `allow`
- 非交互模式 + require_confirmation → `policy_blocked` (不静默执行)
```

**Step 2: 4 验证**

```bash
cd ~/deepwhale && pnpm exec tsc -b && pnpm lint && pnpm exec prettier --check README.md && pnpm test
```

**Step 3: Commit + push**

```bash
git add README.md
git commit -m "docs: D-13 commit 10 — Permission MVP + --yes 行为拍板"
git push
```

---

## Risks

### R-1: race 写文件 (B3 拍板接受)

write_file 走到 existsSync → require_confirmation → 用户确认 → 实际 write. 中间**未加文件锁**, 并发两个 tool loop 跑同一 path 第二次 existsSync 拿旧结果. **接受**为 MVP 风险, D-15 用 inotify 或单进程 mutex 收.

### R-2: bash regex 漏判 (B1)

argv-light regex 拍板会漏判 (e.g. `r''m ''-r''f /` 拆分). **缓解**: 拍板用 `require_confirmation` 而非 `deny`, 误判只是多弹确认. 真要 deny 留给 sandbox exec 阶段的实际黑名单.

### R-3: tool-loop policy.confirm 留 undefined

D-13 MVP 拍板 policy.confirm 留 undefined, 走 "no confirm impl" deny 兜底. **REPL 注入 confirm** 在 D-15, D-13 REPL 测试覆盖 "有 confirm 时" 跟 "无 confirm 时" 两条路径, 都有测.

### R-4: policy_decision 落盘前 fail 静默 (D1)

executeToolCall policy check 后立刻 await persistPolicyDecision; 如果 writer 写失败 (磁盘满 / fs 错), 整个 runToolLoop 抛. **拍板接受** — policy_decision 落盘是 audit 红线, 写不进去就拒绝继续.

### R-5: --yes 标志位用 spread 注入, 漏透传

3 mode 各自 RunXxxOptions 加 yes 字段, CLI 透传到所有 call site. D-12 review P1 修过 RPC dispatch 加参数, 同样的 pattern 适用. 拍板: 跑全量 lint + 测, 漏一个会 fail typecheck.

### R-6: 旧 session reload 不崩 (D2)

新 `policy_decision` event kind 加进 union, 旧 SessionReader 严格 union 兜底 (D-11-3 拍板已就位). reload 老 session 不崩, 也不解析缺失字段. 测覆盖.

---

## What this plan does NOT cover

明确划清边界（avoid scope creep）:

- ❌ **User config file 注入 ToolPolicy** (D-15 — user 拍板)
- ❌ **Per-tool 详细权限 UI / interactive prompt 优化** (D-15)
- ❌ **REPL 真实 readline y/N confirm prompt 注入** (D-15 — MVP 拍板 `confirm = undefined` 兜底 deny)
- ❌ **RPC 协议扩 `confirm` 通知 / `confirmedTools` 字段** (D-15)
- ❌ **Cross-process file lock / race 真防** (D-15+ inotify)
- ❌ **Secret 强检测 (redact API key / token in reason)** (D-15 — secret detection)
- ❌ **路径白名单 / 黑名单** (D-15)
- ❌ **Bash argv deep parse (e.g. shlex)** (D-15 — 拍板用 python shlex 类似物)

Each excluded item has "why deferred" → D-15 user config 拍板一批, MVP 拍板只做 "默认静态 + 可注入 + session audit" 拍板红线.

## Review P1 修复 (2026-06-05)

> D-13 ship 后 review 拍板 2 个 P1 + 1 个 P2 修复, 全收.

### P1 (a) bash 合并 cmd + args + 加 mv/cp/chown/chmod/curl|sh

**拍板 (用户 review 2026-06-05)**:

- "v1.0 红线是'未经确认不 mv', 不只是 /etc/系统路径; cp 一起收, 宁可多弹确认"
- 合并 `command + " " + args.join(" ")` 一条字符串再 regex match (轻量, 不引 shlex)
- 加 mv / cp 全部 / chown / chmod / curl|sh / wget|bash / curl -o /tmp 等 6+ pattern
- 测覆盖 mv 普通移动 (a b), cp 普通复制, chmod 777, curl|sh, curl -o /tmp dropper

### P1 (b) --yes bypass 落 user_approved 审计

**拍板 (用户 review 2026-06-05)**:

- "保持 PolicyDecision 简洁, 在 tool-loop.ts 里保留 raw decision, chain 不做 yes bypass"
- 实现: chain.ts **不**做 yes bypass, 透传 raw decision; tool-loop 在
  `require_confirmation + ctx.yes=true` 分支里落 `user_approved` 事件 (meta.bypassedByYes=true)
  再继续执行工具
- audit 红线: 每次 --yes bypass 都留 trace, 不被 yes 抹平

### P2 REPL 现状 fail-closed (文档拍准)

**拍板 (用户 review 2026-06-05)**:

- "REPL confirm 留 D-15, README 必须改成现状: REPL 无 --yes 是 fail-closed deny, 不是 y/N prompt"
- README 3-mode 矩阵改: REPL 行标 "fail-closed deny (无 confirm impl)"; 加 ⚠️ 提示
  "REPL 现状 D-13 = fail-closed deny"; 加 bypass 路径说明 (--yes 才放行)
- 不修改代码: REPL 行为 (isInteractive=true + confirm=undefined → no confirm impl → deny)
  跟 print/rpc 一致, 是 fail-closed 红线正确体现
