/**
 * 3-hex TAG 快照系统 — hashline 协议核心
 *
 * 设计：
 * - 每行计算 FNV-1a 32-bit hash，取低 12-bit → 3-hex 字符
 * - 短 hash 优点：模型生成容错率高
 * - 短 hash 代价：~4096 分之一碰撞概率（1 万行项目平均 2-3 次碰撞）
 * - 缓解：Sprint 1 加 mid-anchor 校验，把碰撞概率降到 10^-12 量级
 */

export function computeLineHashes(text: string): string[] {
  const lines = text.split('\n');
  return lines.map(hashLine);
}

export function hashLine(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) & 0xfff).toString(16).padStart(3, '0');
}

export function findAnchor(
  file: { text: string; lineHashes?: ReadonlyArray<string> },
  line: number,
  hash: string,
): boolean {
  if (line < 1) return false;
  const hashes = file.lineHashes ?? computeLineHashes(file.text);
  if (line > hashes.length) return false;
  return hashes[line - 1] === hash;
}
