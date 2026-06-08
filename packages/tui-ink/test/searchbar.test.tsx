import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SearchBar } from '../src/components/SearchBar.js';

describe('SearchBar (D-32.3.2)', () => {
  it('renders the prompt and placeholder', () => {
    const { lastFrame } = render(
      <SearchBar query="" results={[]} />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('?');
    expect(f).toMatch(/enter a query/);
  });

  it('shows N results in status', () => {
    const { lastFrame } = render(
      <SearchBar
        query="foo"
        results={[
          { file: 'a.ts', line: 1, col: 1, snippet: 'foo' },
          { file: 'b.ts', line: 2, col: 1, snippet: 'foo' },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('2 results');
  });

  it('shows (no results) when query is set but no results', () => {
    const { lastFrame } = render(
      <SearchBar query="nosuchthing" results={[]} />
    );
    const f = lastFrame() ?? '';
    expect(f).toMatch(/no results/i);
  });

  it('marks the selected index with ▶', () => {
    const { lastFrame } = render(
      <SearchBar
        query="foo"
        selectedIndex={1}
        results={[
          { file: 'a.ts', line: 1, col: 1, snippet: 'foo1' },
          { file: 'b.ts', line: 2, col: 1, snippet: 'foo2' },
        ]}
      />
    );
    const f = lastFrame() ?? '';
    expect(f).toContain('▶');
    expect(f).toContain('b.ts');
  });

  it('shows loading status', () => {
    const { lastFrame } = render(
      <SearchBar query="foo" results={[]} isLoading={true} />
    );
    const f = lastFrame() ?? '';
    expect(f).toMatch(/loading/);
  });
});
