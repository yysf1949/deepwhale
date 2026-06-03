import type { TranslationKey } from '../types.js';

export const en: Record<TranslationKey, string> = {
  'cli.greeting': "Hello! I'm deepwhale {0} 🐋, current model {1}",
  'cli.prompt': 'deepwhale> ',
  'cli.goodbye': 'Goodbye!',
  'cli.no_api_key_hint': "Type 'exit' to quit.",
  'cli.error.network': 'Network error: {0}',
  'cli.error.auth': 'Authentication failed ({0}). Check your DEEPSEEK_API_KEY.',
  'cli.error.rate_limit': 'Rate limited. Please try again later.',
  'cli.error.unknown': 'Unexpected error: {0}',
  'cli.empty_input': '',
  'cli.builtin_help': 'Built-in commands: /help, /exit',
  'cli.builtin_exit': 'exit',
  'cli.builtin_unknown': 'Unknown command: {0}. Type /help for the list.',
  'error.api_key_missing': 'DEEPSEEK_API_KEY is not set. Please set it in ~/.deepwhale/config.toml',
};
