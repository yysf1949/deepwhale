import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { CodeReviewCard } from '../src/components/CodeReviewCard.js';

describe('CodeReviewCard', () => {
  it('renders review verdict + issues', () => {
    const { lastFrame } = render(
      <CodeReviewCard
        verdict="block"
        issues={[
          { severity: 'block', file: 'src/x.ts', line: 42, message: 'unsafe' },
        ]}
        onAck={() => {}}
      />
    );
    expect(lastFrame()).toContain('block');
    expect(lastFrame()).toContain('src/x.ts:42');
    expect(lastFrame()).toContain('unsafe');
  });
});