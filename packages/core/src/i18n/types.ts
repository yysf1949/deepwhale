export type Locale = 'en' | 'zh-CN';

/**
 * 翻译 key 联合类型。Sprint 0 占位 4 个 key，sprint 1+ 扩展。
 * 新增 key 必须先在这里加，否则 t() 会回退到 key 字符串。
 */
export type TranslationKey =
  | 'cli.greeting'
  | 'cli.prompt'
  | 'cli.goodbye'
  | 'error.api_key_missing';
