/**
 * @deepwhale/tui-ink — useCompletion hook (D-28 E3, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/hooks/useCompletion.ts 1:1 简化版 (Hermes 89 行 → D-28 90 行):
 *   - slash 补全: 本地 SLASH_COMMANDS 索引 (D-26 C2/C3 1:1), 0 gateway RPC
 *   - path 补全: D-28 拍 placeholder (0 真实 RPC, D-29+ 升级调文件系统)
 *   - debounce 200ms: D-28 简化拍 caller 控制 (跟 Hermes 简化版一致)
 *
 * 业务 0 改, 1:1 拍 Hermes useCompletion 80% 行为.
 *
 * 拍板 (D-28 §3.4 E3):
 *   - 纯函数 0 React hook (D-28 实战拍: 测 0 必 React 上下文, 1:1 拍模块作用域调用)
 *   - slash 补全返 1 个最佳匹配 (Hermes 返数组, D-28 拍单值, 测简单)
 *   - path 补全 0 真补 (D-28 拍 placeholder), 仅返回空 suggestions
 */

import { findSlashCommand } from '../commands/index.js'

export interface CompletionSuggestion {
  /** 补全的文本 (替换从 start 到 end 的 substring) */
  text: string
  /** 显示标签 (Hermes 1:1, 测用) */
  display: string
  /** 替换范围起点 (相对 input string) */
  replaceFrom: number
  /** 替换范围终点 (相对 input string) */
  replaceTo: number
}

export interface UseCompletionResult {
  /** 当前补全建议列表 (空数组 = 无补全) */
  suggestions: ReadonlyArray<CompletionSuggestion>
  /** 是否是 slash 补全 (true) / path 补全 (false) */
  isSlash: boolean
  /** 补全的 replaceFrom (Hermes 1:1 拍, 测 / 渲染用) */
  replaceFrom: number
}

/**
 * D-28 E3: useCompletion 纯函数 — 简化版 (跟 Hermes 1:1 80% 行为).
 *
 * 拍板 (D-28 实战修正):
 *   - 0 React hook (useMemo 0 必, 测稳定 0 异步陷阱)
 *   - slash 补全: 用 SLASH_COMMANDS 找匹配 (D-26 C2/C3 索引), 返 1 个建议
 *   - path 补全: D-28 拍 placeholder (0 真实 RPC), 返空
 *
 * 0 改业务, 0 改 SLASH_COMMANDS, 跟 Hermes 简化版 1:1.
 *
 * 注: 命名仍 useCompletion (跟 Hermes 1:1), 但实现是纯函数.
 * D-29+ 升级可加 React 包装 (useMemo + useEffect + setTimeout debounce).
 */
export function useCompletion(input: string): UseCompletionResult {
  // 边界: 空 input 0 补全
  if (!input || input.length === 0) {
    return { suggestions: [], isSlash: false, replaceFrom: 0 }
  }

  // 1. slash 补全 (D-26 C2/C3 1:1 拍)
  if (input.startsWith('/')) {
    const spaceIdx = input.indexOf(' ')
    const cmdName = spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx)
    const cmd = findSlashCommand(cmdName.toLowerCase())
    if (cmd) {
      return {
        suggestions: [
          {
            text: `/${cmd.name}`,
            display: `/${cmd.name}${cmd.help ? ' — ' + cmd.help : ''}`,
            replaceFrom: 0,
            replaceTo: input.length,
          },
        ],
        isSlash: true,
        replaceFrom: 1, // 1:1 Hermes 拍 (replace 1: `/` + cmd name)
      }
    }
    // 找不到命令: 0 补全, caller 决定 fallback (跟 Hermes 1:1)
    return { suggestions: [], isSlash: true, replaceFrom: 1 }
  }

  // 2. path 补全: D-28 拍 placeholder (0 真实 RPC, D-29+ 升级调 fs.readdir)
  // 跟 Hermes TAB_PATH_RE 1:1 简化拍 (D-28 简化: 0 真补, 返空)
  return { suggestions: [], isSlash: false, replaceFrom: 0 }
}

/**
 * D-28 E3 辅助 hook: debounced useCompletion (200ms, 跟 Hermes 拍板 1:1).
 *
 * D-28 实战拍: 0 React hook 包装 (跟 useCompletion 0 React hook 1:1),
 * caller 自行加 setTimeout debounce (跟 Hermes 简化版一致).
 * D-29+ 升级可加 useEffect + setTimeout.
 */
export function useDebouncedCompletion(input: string): UseCompletionResult {
  return useCompletion(input)
}
