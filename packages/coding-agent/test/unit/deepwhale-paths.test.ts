/**
 * D-30.1δ.1: deepwhale-paths 统一路径解析.
 *
 * 拍板 (D-30.1δ): 抽 ~/.deepwhale/ 4 路径 (memory / skills / cron / sessions.db) 到
 * 单一 util, 跟 tui-history (D-25 B4) 形态 1:1 (优先 DEEPWHALE_HOME env, 退到
 * HOME/USERPROFILE). 0 改业务, 5 红线 0 触碰.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  deepwhaleRoot,
  deepwhaleMemoryDir,
  deepwhaleSkillsDir,
  deepwhaleCronDir,
  deepwhaleSessionsDbPath,
  deepwhaleMemoryFile,
  deepwhaleUserFile,
  deepwhaleCronJobsFile,
} from '../../src/util/deepwhale-paths.js';

describe('deepwhale-paths (D-30.1δ.1)', () => {
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalDwh: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    originalDwh = process.env.DEEPWHALE_HOME;
    delete process.env.DEEPWHALE_HOME;
  });
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalUserProfile !== undefined) process.env.USERPROFILE = originalUserProfile;
    else delete process.env.USERPROFILE;
    if (originalDwh !== undefined) process.env.DEEPWHALE_HOME = originalDwh;
    else delete process.env.DEEPWHALE_HOME;
  });

  it('root uses homeOverride first (1:1 跟 tui-history 行为)', () => {
    expect(deepwhaleRoot('/tmp/test-home')).toBe(join('/tmp/test-home', '.deepwhale'));
  });

  it('DEEPWHALE_HOME env takes priority over HOME', () => {
    process.env.DEEPWHALE_HOME = '/custom/dw';
    process.env.HOME = '/tmp/other';
    expect(deepwhaleRoot()).toBe(join('/custom/dw', '.deepwhale'));
  });

  it('falls back to HOME when DEEPWHALE_HOME and USERPROFILE unset', () => {
    process.env.HOME = '/tmp/h';
    delete process.env.USERPROFILE;
    expect(deepwhaleRoot()).toBe(join('/tmp/h', '.deepwhale'));
  });

  it('memory dir = root/memory', () => {
    expect(deepwhaleMemoryDir('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'memory'));
  });

  it('memory file = root/memory/MEMORY.md', () => {
    expect(deepwhaleMemoryFile('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'memory', 'MEMORY.md'));
  });

  it('user file = root/memory/USER.md', () => {
    expect(deepwhaleUserFile('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'memory', 'USER.md'));
  });

  it('skills dir = root/skills', () => {
    expect(deepwhaleSkillsDir('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'skills'));
  });

  it('cron dir = root/cron', () => {
    expect(deepwhaleCronDir('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'cron'));
  });

  it('cron jobs file = root/cron/jobs.json', () => {
    expect(deepwhaleCronJobsFile('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'cron', 'jobs.json'));
  });

  it('sessions db = root/sessions.db', () => {
    expect(deepwhaleSessionsDbPath('/tmp/h')).toBe(join('/tmp/h', '.deepwhale', 'sessions.db'));
  });
});
