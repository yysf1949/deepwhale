import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { MemoryEditor } from '../src/components/MemoryEditor.js';

describe('MemoryEditor', () => {
  it('renders MEMORY.md content', () => {
    const { lastFrame } = render(
      <MemoryEditor content="user prefers Chinese" onSave={() => {}} />
    );
    expect(lastFrame()).toContain('MEMORY');
    expect(lastFrame()).toContain('user prefers Chinese');
  });
  it('shows save button hint', () => {
    const { lastFrame } = render(
      <MemoryEditor content="x" onSave={() => {}} />
    );
    expect(lastFrame()).toMatch(/save|ctrl/i);
  });
});