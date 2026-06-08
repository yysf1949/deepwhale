/**
 * @deepwhale/coding-agent — Mermaid → ASCII 渲染器 (D-30.5.1, 2026-06-08).
 *
 * 极简子集: 3 shape (box / diamond / circle) + arrow + label.
 * 业务不在此: 这是给 /plan / diagram 等 slash 命令用的预览 renderer.
 *
 * 红线: 不调 LLM, 不接 network, 不写文件 — 纯 string → string.
 */

export type MermaidShape = 'box' | 'diamond' | 'circle';

export interface MermaidNode {
  id: string;
  label: string;
  shape: MermaidShape;
}

export type MermaidEdge = readonly [string, string] | readonly [string, string, string];

const SHAPE_RE = /^(\w+)\s*(\[|\{)\s*([^}\]{]+?)\s*(\]|\})$/;

function parseNode(token: string): MermaidNode | null {
  const t = token.trim();
  const m = t.match(SHAPE_RE);
  if (!m) return null;
  const id = m[1]!;
  const open = m[2]!;
  const label = m[3] ?? '';
  const close = m[4]!;
  if (open === '{' && close === '}') {
    return { id, label: label.trim(), shape: 'diamond' };
  }
  return { id, label: label.trim(), shape: 'box' };
}

function parseBareNode(token: string): MermaidNode {
  const t = token.trim();
  return { id: t, label: t, shape: 'box' };
}

function parseArrow(line: string): { left: string; right: string; label: string | undefined } | null {
  const idx = line.indexOf('-->');
  if (idx === -1) return null;
  const left = line.slice(0, idx).trim();
  const right = line.slice(idx + 3).trim();
  const pipeIdx = right.indexOf('|');
  if (pipeIdx === -1) {
    return { left, right, label: undefined };
  }
  const closePipe = right.indexOf('|', pipeIdx + 1);
  if (closePipe === -1) {
    return { left, right: right.slice(0, pipeIdx).trim(), label: right.slice(pipeIdx + 1).trim() };
  }
  return {
    left,
    right: right.slice(0, pipeIdx).trim(),
    label: right.slice(pipeIdx + 1, closePipe).trim() || undefined,
  };
}

export function renderMermaid(src: string): string {
  const trimmed = (src ?? '').trim();
  if (!trimmed) return '(empty diagram)';

  const lines = trimmed
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^(graph|flowchart)\s/i.test(l));

  const nodes = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];

  for (const line of lines) {
    const parts = parseArrow(line);
    if (!parts) continue;
    const fromNode = parseNode(parts.left) ?? parseBareNode(parts.left);
    nodes.set(fromNode.id, fromNode);
    const toNode = parseNode(parts.right) ?? parseBareNode(parts.right);
    nodes.set(toNode.id, toNode);
    if (parts.label !== undefined) {
      edges.push([fromNode.id, toNode.id, parts.label]);
    } else {
      edges.push([fromNode.id, toNode.id]);
    }
  }

  if (nodes.size === 0) return '(unparseable diagram)';

  const out: string[] = [];
  const rendered = new Set<string>();

  const renderNode = (n: MermaidNode): string[] => {
    if (n.shape === 'diamond') {
      const inner = `${n.id}: ${n.label}`;
      const w = '─'.repeat(inner.length + 2);
      return [`┌${w}┐`, `│ ${inner} │`, `└${w}┘`];
    }
    return [`[${n.id}: ${n.label}]`];
  };

  for (const [from, to, label] of edges) {
    const fn = nodes.get(from)!;
    const tn = nodes.get(to)!;
    if (!rendered.has(from)) {
      rendered.add(from);
      out.push(...renderNode(fn));
    }
    const arrow = label ? `── ${label} ──▶` : '────────▶';
    out.push(arrow);
    if (!rendered.has(to)) {
      rendered.add(to);
      out.push(...renderNode(tn));
    }
  }

  for (const [id, n] of nodes) {
    if (!rendered.has(id)) {
      rendered.add(id);
      out.push(...renderNode(n));
    }
  }

  return out.join('\n');
}
