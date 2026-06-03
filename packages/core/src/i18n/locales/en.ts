import type { TranslationKey } from '../types.js';

export const en: Record<TranslationKey, string> = {
  'cli.greeting': "Hello! I'm deepwhale {0} 🐋, current model {1}",
  'cli.prompt': 'deepwhale> ',
  'cli.goodbye': 'Goodbye!',
  'error.api_key_missing': 'DEEPSEEK_API_KEY is not set. Please set it in ~/.deepwhale/config.toml',
};
