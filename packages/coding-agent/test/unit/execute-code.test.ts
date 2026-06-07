/**
 * D-30.2.5: execute_code 工具 (Python/Node sandbox via spawn + 30s timeout).
 *
 * 拍板 (D-30.2): 走 Node 子进程 (subprocess + tmp file + 30s timeout),
 * 不接 D-12 docker 避免依赖重. Sprint 2 升级到 docker sandbox.
 * - language: 'python' (走 python3) | 'javascript' (走 node)
 * - 30s timeout → SIGTERM kill
 * - 退出码 0 = success, 非 0 = failure
 * - risk: medium (执行任意 code, 跟 bash 同档)
 */
import { describe, it, expect } from 'vitest';
import { ExecuteCodeTool } from '../../src/tools/execute-code.js';

describe('ExecuteCodeTool (D-30.2.5)', () => {
  it('executes a simple JavaScript snippet', async () => {
    const tool = new ExecuteCodeTool();
    const r = await tool.execute({ language: 'javascript', code: 'console.log("hello exec")' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.content.trim()).toBe('hello exec');
    }
  });

  it('executes a simple Python snippet', async () => {
    const tool = new ExecuteCodeTool();
    const r = await tool.execute({ language: 'python', code: 'print("hello py")' });
    // python3 必须在 PATH, 否则 graceful 失败
    if (r.success) {
      expect(r.content.trim()).toBe('hello py');
    } else {
      // skip 风格: python 不可用时不 fail CI
      expect(r.error).toMatch(/not found|python3/i);
    }
  });

  it('returns error for non-zero exit code', async () => {
    const tool = new ExecuteCodeTool();
    const r = await tool.execute({
      language: 'javascript',
      code: 'process.exit(7);',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/exit 7/);
    }
  });

  it('returns error for invalid language', async () => {
    const tool = new ExecuteCodeTool();
    const r = await tool.execute({ language: 'ruby' as 'python' | 'javascript', code: 'puts 1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/language|invalid/i);
    }
  });
});
