import { describe, it, expect } from 'vitest';
import { renderMermaid } from '../../src/util/mermaid-render.js';

describe('renderMermaid', () => {
  it('renders simple graph box + arrow', () => {
    const out = renderMermaid('graph LR\n  A[Start] --> B[End]');
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out).toContain('──▶');
  });
  it('renders with labels on arrows', () => {
    const out = renderMermaid('graph LR\n  A -->|yes| B');
    expect(out).toContain('yes');
  });
  it('renders decision diamond', () => {
    const out = renderMermaid('graph TD\n  X{OK?} -->|yes| Y');
    expect(out).toContain('X');
    expect(out).toContain('OK?');
  });
  it('returns fallback for empty input', () => {
    expect(renderMermaid('')).toContain('(empty diagram)');
  });
});