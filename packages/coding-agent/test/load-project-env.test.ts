/**
 * @deepwhale/coding-agent — loadProjectEnv 单测
 *
 * Sprint 1c-revive-2-D-7 review, 2026-06-04.
 * 覆盖矩阵:
 *   1. 文件不存在 → silent return, 现有 process.env 不动
 *   2. 简单 KEY=VALUE 加载
 *   3. 已有 key 不被覆盖 (红线: CI / shell 优先)
 *   4. 头尾成对引号去引号
 *   5. 头尾不成对引号保留原样
 *   6. 空行 / 注释 / `export ` 前缀 跳过
 *   7. 多行混合 (含上面所有形态)
 *   8. KEY= (空 value) → 设为空字符串
 *   9. 没 `=` / `=` 在最前 → 跳过
 *
 * 不依赖任何外部 env, 全部用 tmp dir 写 .env 后调 loader.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectEnv } from '../src/env/load-project-env.js';

let tmpDir: string;
let envPath: string;
const originalGateEnv = {
  INTEGRATION: process.env['INTEGRATION'],
  DEEPSEEK_API_KEY: process.env['DEEPSEEK_API_KEY'],
  ANTHROPIC_AUTH_TOKEN: process.env['ANTHROPIC_AUTH_TOKEN'],
};

function restoreEnv(key: keyof typeof originalGateEnv): void {
  const value = originalGateEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'load-env-test-'));
  envPath = join(tmpDir, '.env');
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  // 清掉可能注入的 env vars
  delete process.env['LOAD_ENV_TEST_A'];
  delete process.env['LOAD_ENV_TEST_B'];
  delete process.env['LOAD_ENV_TEST_C'];
  delete process.env['LOAD_ENV_TEST_D'];
  delete process.env['LOAD_ENV_TEST_E'];
  delete process.env['LOAD_ENV_TEST_F'];
  delete process.env['LOAD_ENV_TEST_G'];
  delete process.env['LOAD_ENV_TEST_H'];
  delete process.env['LOAD_ENV_TEST_I'];
  delete process.env['LOAD_ENV_TEST_PRESET'];
  restoreEnv('INTEGRATION');
  restoreEnv('DEEPSEEK_API_KEY');
  restoreEnv('ANTHROPIC_AUTH_TOKEN');
});

function writeEnv(content: string): void {
  writeFileSync(envPath, content);
}

describe('loadProjectEnv', () => {
  it('1. 文件不存在 → silent return, process.env 不动', () => {
    // tmpDir 里没 .env (只创建了 tmpDir, 没 writeFile)
    expect(() => loadProjectEnv(tmpDir)).not.toThrow();
    expect(process.env['LOAD_ENV_TEST_A']).toBeUndefined();
  });

  it('2. 简单 KEY=VALUE → 加载到 process.env', () => {
    writeEnv('LOAD_ENV_TEST_A=hello\nLOAD_ENV_TEST_B=world\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('hello');
    expect(process.env['LOAD_ENV_TEST_B']).toBe('world');
  });

  it('3. 已有 key 不被覆盖 (红线: CI / shell export 优先)', () => {
    // 拍板: ??= 拍, 显式设的不动
    process.env['LOAD_ENV_TEST_PRESET'] = 'from-shell-export';
    writeEnv('LOAD_ENV_TEST_PRESET=from-dotenv-file\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_PRESET']).toBe('from-shell-export');
  });

  it('4. 头尾成对双引号 / 单引号 → 去引号', () => {
    writeEnv('LOAD_ENV_TEST_A="double quoted"\nLOAD_ENV_TEST_B=\'single quoted\'\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('double quoted');
    expect(process.env['LOAD_ENV_TEST_B']).toBe('single quoted');
  });

  it('5. 头尾不成对引号 → 保留原样 (不强行 strip)', () => {
    writeEnv('LOAD_ENV_TEST_A="unterminated\nLOAD_ENV_TEST_B=value with " quote\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('"unterminated');
    // 'value with " quote' — 头不是引号, 尾是引号 → 不 strip
    expect(process.env['LOAD_ENV_TEST_B']).toBe('value with " quote');
  });

  it('6. 空行 / 注释 / `export ` 前缀 跳过 + KEY 头尾空格 trim', () => {
    writeEnv(
      [
        '# 注释行',
        '',
        '   # 缩进注释',
        '',
        'export LOAD_ENV_TEST_A=exported',
        '   LOAD_ENV_TEST_B   =   trimmed key   ',
        'LOAD_ENV_TEST_C=value with spaces',
      ].join('\n') + '\n',
    );
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('exported');
    expect(process.env['LOAD_ENV_TEST_B']).toBe('trimmed key');
    expect(process.env['LOAD_ENV_TEST_C']).toBe('value with spaces');
  });

  it('7. KEY= (空 value) → 设为空字符串 (但仍占位置)', () => {
    writeEnv('LOAD_ENV_TEST_A=\nLOAD_ENV_TEST_B=nonempty\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('');
    expect(process.env['LOAD_ENV_TEST_B']).toBe('nonempty');
    // 关键: A 占了位置后, 二次 loader 不会动它 (跟 ??= 语义一致)
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('');
  });

  it('8. 没 `=` / `=` 在最前 / 空 KEY → 跳过', () => {
    writeEnv('NO_EQUALS\n=NO_KEY\n\nLOAD_ENV_TEST_A=valid\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('valid');
    // NO_EQUALS 不该进 process.env (没 =)
    expect(process.env['NO_EQUALS']).toBeUndefined();
  });

  it('9. 多行混合 (上面所有形态一次性跑) → 跟 1+2+3+4 组合语义一致', () => {
    delete process.env['INTEGRATION'];
    delete process.env['DEEPSEEK_API_KEY'];
    process.env['LOAD_ENV_TEST_H'] = 'shell-export-wins';
    writeEnv(
      [
        '# Integration test env (Sprint 1c-revive-2-D-7 example)',
        'INTEGRATION=1',
        '',
        '# API keys (跟 .gitignore 一致, 不入仓)',
        'DEEPSEEK_API_KEY="sk-fake-test-key"',
        "# ANTHROPIC_AUTH_TOKEN=sk-ant-fake",
        '',
        '# Misc',
        'export LOAD_ENV_TEST_H=should-not-override',
        'LOAD_ENV_TEST_I=simple',
      ].join('\n') + '\n',
    );
    loadProjectEnv(tmpDir);
    expect(process.env['INTEGRATION']).toBe('1');
    expect(process.env['DEEPSEEK_API_KEY']).toBe('sk-fake-test-key');
    // shell export 优先
    expect(process.env['LOAD_ENV_TEST_H']).toBe('shell-export-wins');
    expect(process.env['LOAD_ENV_TEST_I']).toBe('simple');
  });

  it('10. 多次调用 → 幂等 (no-op, 因为所有 key 都已存在)', () => {
    writeEnv('LOAD_ENV_TEST_A=first\n');
    loadProjectEnv(tmpDir);
    expect(process.env['LOAD_ENV_TEST_A']).toBe('first');

    // 改 .env 内容, 但**不**重新写 process.env
    writeEnv('LOAD_ENV_TEST_A=second\n');
    loadProjectEnv(tmpDir);
    // 关键: ??= 决定, 已有 key 不被 .env 第二次 load 覆盖
    expect(process.env['LOAD_ENV_TEST_A']).toBe('first');
  });
});
