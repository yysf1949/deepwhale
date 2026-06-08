import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SymbolTree } from '../src/components/SymbolTree.js';

describe('SymbolTree (D-32.1.5)', () => {
  it('renders a flat list of symbols with kind + name + line:col', () => {
    const { lastFrame } = render(
      <SymbolTree
        symbols={[
          { name: 'hello', kind: 'function', line: 1, col: 0 },
          { name: 'Greeter', kind: 'class', line: 5, col: 0 },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('Symbols (2)');
    expect(f).toContain('hello');
    expect(f).toContain('Greeter');
    expect(f).toContain('1:0');
  });

  it('shows empty state when symbols is empty', () => {
    const { lastFrame } = render(<SymbolTree symbols={[]} />);
    const f = lastFrame() ?? '';
    expect(f).toContain('Symbols (0)');
    expect(f).toMatch(/no symbols/i);
  });

  it('renders nested scope (method inside class) as path.name', () => {
    const { lastFrame } = render(
      <SymbolTree
        symbols={[
          { name: 'outerFn', kind: 'function', line: 1, col: 0 },
          { name: 'innerMethod', kind: 'method', line: 3, col: 2, scope: 'outerFn' },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('outerFn.innerMethod');
  });

  it('shows per-kind count summary in header', () => {
    const { lastFrame } = render(
      <SymbolTree
        symbols={[
          { name: 'a', kind: 'function', line: 1, col: 0 },
          { name: 'b', kind: 'function', line: 2, col: 0 },
          { name: 'C', kind: 'class', line: 3, col: 0 },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('function=2');
    expect(f).toContain('class=1');
  });
});
