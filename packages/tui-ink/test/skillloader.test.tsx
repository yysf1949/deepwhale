import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SkillLoader } from '../src/components/SkillLoader.js';

describe('SkillLoader', () => {
  it('lists skills with loaded marker', () => {
    const skills = [
      { name: 'writing-plans', loaded: true },
      { name: 'systematic-debugging', loaded: false },
    ];
    const { lastFrame } = render(<SkillLoader skills={skills} onToggle={() => {}} />);
    expect(lastFrame()).toContain('writing-plans');
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('systematic-debugging');
    expect(lastFrame()).toContain('○');
  });
});