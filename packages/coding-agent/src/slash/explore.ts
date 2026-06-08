/**
 * /explore slash command — parse file → symbols → SymbolTree render (D-32.1.6).
 *
 * 拍板: standalone module, 返 { kind, file, symbols, error } 供 router 注入渲染.
 *   router 集成 (wire 到 dispatchSlashBuiltin) 留 D-32.2 (跟 /verify / /theme 同
 *   pattern 改 ctx, 改 repl-command-router 风险 大, 5 红线 范围).
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读).
 */

import { resolve } from 'node:path';
import { parseFile, extractSymbols, type LanguageId, type Symbol } from '@deepwhale/code-intel';

export type ExploreResult =
  | { kind: 'ok'; file: string; language: string; symbols: ReadonlyArray<Symbol> }
  | { kind: 'error'; file: string; message: string };

/** Parse `/explore <filepath>` invocation. Returns null if not /explore. */
export function parseExploreCommand(line: string): { file: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/explore')) return null;
  const rest = trimmed.slice('/explore'.length).trim();
  if (rest.length === 0) return null;
  // strip surrounding quotes
  const file = rest.replace(/^['"]|['"]$/g, '');
  return { file };
}

/** Run the /explore logic: parse file, extract symbols. */
export async function runExplore(file: string): Promise<ExploreResult> {
  const absPath = resolve(file);
  try {
    const parsed = await parseFile(absPath);
    const syms = extractSymbols(parsed.tree, parsed.language as LanguageId, absPath);
    return { kind: 'ok', file: absPath, language: parsed.language, symbols: syms };
  } catch (e) {
    return {
      kind: 'error',
      file: absPath,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
