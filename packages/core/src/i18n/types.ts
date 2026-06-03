export type Locale = 'en' | 'zh-CN';

/**
 * 翻译 key 联合类型。Sprint 0 占位 4 个 key，sprint 1+ 扩展。
 * 新增 key 必须先在这里加，否则 t() 会回退到 key 字符串。
 */
export type TranslationKey =
  | 'cli.greeting'
  | 'cli.prompt'
  | 'cli.goodbye'
  | 'cli.no_api_key_hint'
  | 'cli.error.network'
  | 'cli.error.auth'
  | 'cli.error.rate_limit'
  | 'cli.error.unknown'
  | 'cli.empty_input'
  | 'cli.builtin_help'
  | 'cli.builtin_exit'
  | 'cli.builtin_unknown'
  | 'error.api_key_missing';
