import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SessionList } from '../src/components/SessionList.js';

describe('SessionList', () => {
  it('renders session rows', () => {
    const sessions = [
      { id: 'abc12345', firstUser: 'fix auth bug', messageCount: 12, createdAt: Date.now() },
    ];
    const { lastFrame } = render(
      <SessionList sessions={sessions} onLoad={() => {}} />
    );
    expect(lastFrame()).toContain('abc12345');
    expect(lastFrame()).toContain('fix auth bug');
    expect(lastFrame()).toContain('12');
  });
});