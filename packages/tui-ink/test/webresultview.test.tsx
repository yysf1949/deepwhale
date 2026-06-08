import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { WebResultView } from '../src/components/WebResultView.js';

describe('WebResultView (D-31.4.5)', () => {
  it('renders web results with title + url + snippet', () => {
    const { lastFrame } = render(
      <WebResultView
        results={[
          { title: 'A', url: 'https://a.com', snippet: 'snippet A' },
          { title: 'B', url: 'https://b.com', snippet: 'snippet B' },
        ]}
      />
    );
    const text = lastFrame() ?? '';
    expect(text).toContain('A');
    expect(text).toContain('a.com');
    expect(text).toContain('snippet A');
  });

  it('shows empty state when no results', () => {
    const { lastFrame } = render(<WebResultView results={[]} />);
    expect(lastFrame()).toMatch(/no results|empty/i);
  });

  it('truncates long snippets', () => {
    const long = 'x'.repeat(500);
    const { lastFrame } = render(
      <WebResultView results={[{ title: 'T', url: 'https://x.com', snippet: long }]} maxSnippetChars={50} />
    );
    const text = lastFrame() ?? '';
    // Truncation marker (…) should be present; full 500-char snippet should NOT.
    expect(text).toContain('…');
    expect(text).not.toContain('x'.repeat(200));
  });
});
