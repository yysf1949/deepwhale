/**
 * Sprint 1c-revive-3-D-13 (2026-06-05)
 *
 * 用户拍板 (2026-06-05): "reason 可以写自然语言, 但不能包含完整文件内容或 secret"
 * D-13 MVP 拍板: 长度上限 200 + 换行折叠 + 去 NUL. 真正的 secret detection 留给 D-15.
 *
 * 拍板红线: sanitized reason 进 SessionEvent policy_decision 落盘, 一旦写错字段
 * 整个 session 不可读. 拍 board 安全优先.
 */

const MAX_REASON_LEN = 200;
const TRUNCATED_MARKER = '…[truncated]'; // 13 chars (ellipsis counts as 1 utf-16 unit)

export function sanitizeReason(reason: string): string {
  // 1. 折叠换行 (\r?\n → ' / '), 单行显示
  let r = reason.replace(/\r?\n/g, ' / ');
  // 2. 去 NUL (JSON 写入安全, 防 null byte 注入)
  // eslint-disable-next-line no-control-regex
  r = r.replace(/\u0000/g, '');
  // 3. 长度上限 + 标 truncated
  if (r.length > MAX_REASON_LEN) {
    r = r.slice(0, MAX_REASON_LEN - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
  }
  return r;
}
