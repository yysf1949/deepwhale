/**
 * i18n 模块 — 必须在 Sprint 0 第 1 行定对路径。
 *
 * 命名空间: `core.i18n`（不是 `gateway.i18n`，避免 Hermes 教训）。
 * 所有包都用 `import { t } from '@deepwhale/core/i18n'` 引入。
 */

import { en } from './locales/en.js';
import { zh } from './locales/zh.js';
import type { Locale, TranslationKey } from './types.js';

const locales: Record<Locale, Record<TranslationKey, string>> = {
  en,
  'zh-CN': zh,
};

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
  const env = process.env['DEEPWHALE_LANG'] ?? process.env['LANG'] ?? '';
  if (env.toLowerCase().startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * 翻译函数。Key 不存在时回退英文，英文也不存在时返回 key 本身。
 *
 * @example
 *   t('cli.greeting')  // "Hello! I'm deepwhale"
 */
export function t(key: TranslationKey, ...args: unknown[]): string {
  const dict = locales[currentLocale] ?? locales['en']!;
  const template = dict[key] ?? locales['en']?.[key] ?? key;
  return format(template, args);
}

function format(template: string, args: unknown[]): string {
  if (args.length === 0) return template;
  return template.replace(/\{(\d+)\}/g, (_match, idx: string) => {
    const i = Number.parseInt(idx, 10);
    return String(args[i] ?? '');
  });
}

export type { Locale, TranslationKey } from './types.js';
