import { describe, expect, it } from 'vitest';
import { t, setLocale, getLocale } from '../src/i18n/index.js';

describe('Sprint 0.0: i18n (core.i18n path locked at Sprint 0 line 1)', () => {
  it('defaults to English', () => {
    expect(getLocale()).toBe('en');
  });

  it('t() renders English template', () => {
    const out = t('cli.greeting', '🐋', 'deepseek-v4-flash');
    expect(out).toContain('Hello');
    expect(out).toContain('deepwhale');
    expect(out).toContain('deepseek-v4-flash');
  });

  it('setLocale(zh-CN) renders Chinese', () => {
    setLocale('zh-CN');
    expect(t('cli.greeting', '🐋', 'deepseek-v4-flash')).toContain('你好');
    setLocale('en');
  });

  it('t() falls back to key when translation missing', () => {
    // 强制制造不存在的 key（type-safe 防止，运行时保险）
    const out = t('non.existent' as unknown as Parameters<typeof t>[0]);
    expect(out).toBe('non.existent');
  });

  it('format() handles {0} {1} placeholders', () => {
    const out = t('cli.greeting', 'A', 'B');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });
});
