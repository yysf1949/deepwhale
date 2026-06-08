import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { CallGraph } from '../src/components/CallGraph.js';

describe('CallGraph (D-32.2.3)', () => {
  it('renders a header with edge count', () => {
    const { lastFrame } = render(
      <CallGraph
        edges={[
          { caller: 'a.ts:foo', callee: 'b.ts:bar', line: 1, file: 'a.ts' },
          { caller: 'a.ts:foo', callee: 'b.ts:baz', line: 2, file: 'a.ts' },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('Call graph (2)');
  });

  it('renders caller → callee per line', () => {
    const { lastFrame } = render(
      <CallGraph
        edges={[
          { caller: 'a.ts:foo', callee: 'b.ts:bar', line: 5, file: 'a.ts' },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('foo');
    expect(f).toContain('bar');
    expect(f).toContain('a.ts:5');
  });

  it('shows empty state when edges is empty', () => {
    const { lastFrame } = render(<CallGraph edges={[]} />);
    const f = lastFrame() ?? '';
    expect(f).toContain('Call graph (0)');
    expect(f).toMatch(/no edges/i);
  });

  it('filters by symbol (caller or callee includes the symbol)', () => {
    const { lastFrame } = render(
      <CallGraph
        symbol="foo"
        edges={[
          { caller: 'a.ts:foo', callee: 'b.ts:bar', line: 1, file: 'a.ts' },
          { caller: 'a.ts:other', callee: 'b.ts:foo', line: 2, file: 'b.ts' },
          { caller: 'a.ts:unrelated', callee: 'b.ts:unrelated', line: 3, file: 'a.ts' },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain("centered on 'foo'");
    expect(f).toContain('Call graph (2');
  });
});
