import type { TranslationKey } from '../types.js';

export const zh: Record<TranslationKey, string> = {
  'cli.greeting': '你好！我是 deepwhale {0} 🐋，当前模型 {1}',
  'cli.prompt': 'deepwhale> ',
  'cli.goodbye': '再见！',
  'error.api_key_missing': '未设置 DEEPSEEK_API_KEY，请在 ~/.deepwhale/config.toml 配置',
};
