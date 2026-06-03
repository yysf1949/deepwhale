import type { TranslationKey } from '../types.js';

export const zh: Record<TranslationKey, string> = {
  'cli.greeting': '你好！我是 deepwhale {0} 🐋，当前模型 {1}',
  'cli.prompt': 'deepwhale> ',
  'cli.goodbye': '再见！',
  'cli.no_api_key_hint': "输入 'exit' 退出。",
  'cli.error.network': '网络错误：{0}',
  'cli.error.auth': '认证失败（{0}）。请检查 DEEPSEEK_API_KEY。',
  'cli.error.rate_limit': '请求过于频繁，请稍后再试。',
  'cli.error.unknown': '未知错误：{0}',
  'cli.empty_input': '',
  'cli.builtin_help': '内建命令：/help、/exit',
  'cli.builtin_exit': 'exit',
  'cli.builtin_unknown': '未知命令：{0}。输入 /help 查看列表。',
  'error.api_key_missing': '未设置 DEEPSEEK_API_KEY，请在 ~/.deepwhale/config.toml 配置',
};
