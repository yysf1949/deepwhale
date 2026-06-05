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
  'cli.error.stream': 'Stream interrupted: {0}',
  'cli.empty_input': '',
  'cli.builtin_help': 'Built-in commands: /help, /exit',
  'cli.builtin_exit': 'exit',
  'cli.builtin_unknown': 'Unknown command: {0}. Type /help for the list.',
  'cli.session_resumed': 'Resumed session with {0} messages from {1}',
  'cli.session_load_warning': 'Could not load session: {0}',
  'cli.session_write_warning': 'Could not write session event: {0}',
  'cli.tool_loop_limit': 'Tool loop hit max steps ({0}). Try a shorter task.',
  'cli.repl_force_exit_timeout': 'warning: in-flight turn did not finish within {0}ms, forcing REPL exit (audit may be incomplete)',
  'cli.turn_in_flight_deny': 'turn running, wait for finish (built-in command deferred)',
  'error.api_key_missing': 'DEEPSEEK_API_KEY is not set. Please set it in ~/.deepwhale/config.toml',
};
