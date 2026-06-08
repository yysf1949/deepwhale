import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ProfileSwitcher } from '../src/components/ProfileSwitcher.js';

describe('ProfileSwitcher (D-31.4.6)', () => {
  it('lists profiles with current marker', () => {
    const { lastFrame } = render(
      <ProfileSwitcher
        profiles={[
          { name: 'work', config: { model: 'gpt-4o' } },
          { name: 'home', config: { model: 'deepseek' } },
        ]}
        current="work"
        onSwitch={() => {}}
      />
    );
    const text = lastFrame() ?? '';
    expect(text).toContain('work');
    expect(text).toContain('home');
    expect(text).toContain('*'); // current marker
  });

  it('shows empty state when no profiles', () => {
    const { lastFrame } = render(
      <ProfileSwitcher profiles={[]} current={null} onSwitch={() => {}} />
    );
    expect(lastFrame()).toMatch(/no profiles|empty/i);
  });

  it('marks current profile with model info', () => {
    const { lastFrame } = render(
      <ProfileSwitcher
        profiles={[{ name: 'work', config: { model: 'gpt-4o' } }]}
        current="work"
        onSwitch={() => {}}
      />
    );
    expect(lastFrame()).toContain('gpt-4o');
  });
});
