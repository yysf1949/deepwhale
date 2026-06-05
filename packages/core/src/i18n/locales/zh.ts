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
  'cli.error.stream': '流式响应中断：{0}',
  'cli.empty_input': '',
  'cli.builtin_help': '内建命令：/help、/exit',
  'cli.builtin_exit': 'exit',
  'cli.builtin_unknown': '未知命令：{0}。输入 /help 查看列表。',
  'cli.session_resumed': '已恢复会话：从 {1} 加载 {0} 条消息',
  'cli.session_load_warning': '加载会话失败：{0}',
  'cli.session_write_warning': '写入会话失败：{0}',
  'cli.tool_loop_limit': '工具循环达到最大步数（{0}）。请尝试更短的任务。',
  'cli.repl_force_exit_timeout': 'warning: 当前 turn 未在 {0}ms 内收束, 强制退出 REPL (审计可能不完整)',
  'cli.turn_in_flight_deny': 'turn 正在运行, 请等待完成 (内建命令已拒绝)',
  'error.api_key_missing': '未设置 DEEPSEEK_API_KEY，请在 ~/.deepwhale/config.toml 配置',
};
