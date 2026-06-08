import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SubagentIndicator } from '../src/components/SubagentIndicator.js';

describe('SubagentIndicator (D-31.1.8)', () => {
  it('renders kanban board summary', () => {
    const cards = [
      { id: 'c1', title: 'ship D-31', lane: 'in_progress' as const },
      { id: 'c2', title: 'write tests', lane: 'done' as const },
      { id: 'c3', title: 'review', lane: 'review' as const },
    ];
    const { lastFrame } = render(<SubagentIndicator cards={cards} />);
    const text = lastFrame() ?? '';
    expect(text).toContain('Subagents');
    expect(text).toContain('ship D-31');
    expect(text).toContain('done');
  });

  it('shows empty state when no cards', () => {
    const { lastFrame } = render(<SubagentIndicator cards={[]} />);
    expect(lastFrame()).toContain('no subagents');
  });

  it('highlights failed cards', () => {
    const cards = [
      { id: 'c1', title: 'broken', lane: 'failed' as const },
    ];
    const { lastFrame } = render(<SubagentIndicator cards={cards} />);
    const text = lastFrame() ?? '';
    expect(text).toContain('broken');
    expect(text).toContain('failed');
  });
});
