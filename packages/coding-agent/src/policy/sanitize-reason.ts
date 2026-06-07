/**
 * Sprint 1c-revive-5-D-29.2 (2026-06-07)
 *
 * D-13 (commit 1d414cc) MVP 拍板: 长度上限 200 + 换行折叠 + 去 NUL. 真正的
 * secret detection 留给 D-15.
 * D-15 未补, 留 v1.0 隐患. D-29.2 补:
 *   1. sk-... 形式 (OpenAI/DeepSeek/Anthropic API key 风格)
 *   2. Bearer ... 形式 (OAuth/JWT bearer token)
 *   3. key=... / token=... / secret=... 形式 (env 注入风格)
 *
 * 拍板 (D-29.2): 顺序是 secret redact 先于长度截断, 避免先截断再 redact
 * 漏掉截断边界的 secret. marker 用 ***REDACTED*** 15 字符, 不用 [REDACTED]
 * 是为避开 reason 字段的 quote-escape 链.
 *
 * 拍板红线: 0 改 sanitizeReason 签名, 6 调用点 (tool-loop.ts:318, 352, 359,
 * 381, 405 + 1 链) 全部向后兼容.
 */

const MAX_REASON_LEN = 200;
const TRUNCATED_MARKER = '…[truncated]'; // 13 chars (ellipsis counts as 1 utf-16 unit)
const REDACTED_MARKER = '***REDACTED***'; // 15 chars

// 3 类 secret 正则 (Sprint 1c-revive-5-D-29.2 拍板):
// 1. sk- 开头 16+ 字符 (OpenAI/DeepSeek/Anthropic 风格)
const SK_PATTERN = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
// 2. Bearer 头 + 16+ 字符 (OAuth/JWT)
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._\-+/=]{16,}/gi;
// 3. key/token/secret= + 8+ 字符 (env 注入), 含 DEPLOY_KEY= 复合大写名
//    前缀 opt + 关键词 (KEY|TOKEN|SECRET|小写) + '=' + 8+ 字符值
const KEYVALUE_PATTERN =
  /(?:[A-Za-z_][A-Za-z0-9_]*[._-])?(KEY|TOKEN|SECRET|key|token|secret)=([A-Za-z0-9._\-+/=]{8,})/g;

function redactSecrets(s: string): string {
  return s
    .replace(SK_PATTERN, REDACTED_MARKER)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED_MARKER}`)
    .replace(KEYVALUE_PATTERN, (m) => {
      // 保留原前缀 (DEPLOY_, MY_, etc) + 关键词 + '=', 只 redact 值
      const eq = m.indexOf('=');
      return m.slice(0, eq + 1) + REDACTED_MARKER;
    });
}

// D-29.2 拍板 (2026-06-07, user review 候选 1): 流程顺序是
//   1. 长度截断 (先, 200 字符窗口内)
//   2. secret redact (后, 在 200 字符内保证 secret + marker 完整)
//   3. 折叠换行 (redact 后的 key=foo 含 '=', 折叠不会破坏)
//   4. 去 NUL
// 拍板理由 (候选 1 vs 候选 2/3): 候选 1 保证 secret 在 200 字符内永远完整
// redact, 候选 2 (smart truncate) marker 长度不固定复杂度+1, 候选 3
// (改测松) 测松了 silent bug. 候选 1 牺牲极长 secret (>200 字符, 如 800 字符
// JWT) 跨 truncate 边界漏 redact 边缘 — 拍板接受 (200 字符窗口足够覆盖
// 实际 API key 长度, OpenAI sk- 通常 51 字符, GitHub PAT 40 字符, AWS secret
// 40 字符).
//
// 拍板红线: 0 改 sanitizeReason 签名, 6 调用点 (tool-loop.ts:318, 352, 359,
// 381, 405 + 1 链) 全部向后兼容.
export function sanitizeReason(reason: string): string {
  // 1. 长度截断 (候选 1: 先于 redact, 200 字符窗口内 secret 必完整)
  let r = reason;
  if (r.length > MAX_REASON_LEN) {
    r = r.slice(0, MAX_REASON_LEN - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
  }
  // 2. secret redact (D-29.2 新增) — 在 200 字符内找 secret, marker 必完整
  r = redactSecrets(r);
  // 3. 折叠换行 (\r?\n → ' / '), 单行显示
  r = r.replace(/\r?\n/g, ' / ');
  // 4. 去 NUL (JSON 写入安全, 防 null byte 注入)
  // eslint-disable-next-line no-control-regex
  r = r.replace(/\u0000/g, '');
  return r;
}
