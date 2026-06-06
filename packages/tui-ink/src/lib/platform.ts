/**
 * @deepwhale/tui-ink — platform 工具 (D-26 C1, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/lib/platform.ts 1:1 (15 行).
 * 用途: D-26 C4 useInputHandlers 跟 C3 slash command 调 isActionMod / isAction
 * 判定 Ctrl / Cmd 修饰键.
 *
 * 拍板 (跟 Hermes 1:1):
 *   - macOS: action modifier = Cmd (key.meta)
 *   - 其它: action modifier = Ctrl (key.ctrl)
 *   - Ctrl+C 永远 interrupt, 任何平台都 0 remap (跟 D-19 SIGINT 链兼容红线)
 *
 * 业务 0 改, 1:1 抄 Hermes + JSDoc 中文.
 */

/** 是否 macOS. 跟 Hermes 1:1. */
export const isMac: boolean = process.platform === 'darwin'

/** Action modifier 是否按下 (Cmd on macOS, Ctrl elsewhere). 跟 Hermes 1:1. */
export const isActionMod = (key: { ctrl: boolean; meta: boolean }): boolean =>
  isMac ? key.meta : key.ctrl

/**
 * 匹配 action-modifier + 1 字符 (大小写不敏感). 跟 Hermes 1:1.
 * 用途: useInputHandlers 判定 'ctrl+c' / 'cmd+k' 等快捷键.
 */
export const isAction = (key: { ctrl: boolean; meta: boolean }, ch: string, target: string): boolean =>
  isActionMod(key) && ch.toLowerCase() === target
