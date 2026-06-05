/**
 * policy/static-rules 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 */

import { describe, it, expect } from 'vitest';
import { staticToolPolicy, evaluateBashCommand } from '../../src/policy/static-rules.js';

const ctx = { isInteractive: true, yes: false, argsDigest: 'sha256:000000000000' };

describe('policy/static-rules', () => {
  describe('staticToolPolicy (按 tool name 分支)', () => {
    it('read_file / find / grep: 一律 allow', () => {
      for (const name of ['read_file', 'find', 'grep'] as const) {
        expect(
          staticToolPolicy.evaluate({ name, argsDigest: 'sha256:000000000000' }, ctx).decision,
        ).toBe('allow');
      }
    });

    it('write_file: require_confirmation', () => {
      const r = staticToolPolicy.evaluate(
        { name: 'write_file', argsDigest: 'sha256:000000000000' },
        ctx,
      );
      expect(r.decision).toBe('require_confirmation');
    });

    it('edit_file: require_confirmation (跟 write_file 同级)', () => {
      const r = staticToolPolicy.evaluate(
        { name: 'edit_file', argsDigest: 'sha256:000000000000' },
        ctx,
      );
      expect(r.decision).toBe('require_confirmation');
    });

    it('bash: 这层返 allow (bash 工具自身用 evaluateBashCommand 拍)', () => {
      const r = staticToolPolicy.evaluate({ name: 'bash', argsDigest: 'sha256:000000000000' }, ctx);
      expect(r.decision).toBe('allow');
    });
  });

  describe('evaluateBashCommand (bash 危险 regex)', () => {
    it('危险模式 → require_confirmation', () => {
      for (const cmd of [
        'rm -rf /tmp',
        'rm -rf /',
        'rm -fr /',
        'rm -rf ~',
        'mkfs.ext4 /dev/sda',
        'mkfs /dev/nvme0n1',
        'dd if=/dev/zero of=/dev/sda bs=1M',
        'shutdown -h now',
        'reboot',
        'echo hi > /dev/sda',
      ]) {
        expect(evaluateBashCommand(cmd, []).decision).toBe('require_confirmation');
      }
    });

    it('安全命令 → allow', () => {
      for (const cmd of [
        'ls -la',
        'git status',
        'pnpm test',
        'echo hello world',
        'cat README.md',
        'find . -name "*.ts"',
      ]) {
        expect(evaluateBashCommand(cmd, []).decision).toBe('allow');
      }
    });

    it('git rm 不误判 (substr 含 rm 但不是 rm -rf /)', () => {
      // 拍板: B1 接受误判走 require_confirmation, 不走 deny (用户 review 拍板 R-2)
      // git rm file.txt 应该是 allow, 但 regex 实际不 match (没 -rf + 路径)
      expect(evaluateBashCommand('git rm file.txt', []).decision).toBe('allow');
    });
  });
});
