import { describe, it, expect, vi } from 'vitest';
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

describe('MemoryEditor edit mode (D-31.3.8)', () => {
  it('renders in edit mode shows editor hint', () => {
    const onChange = vi.fn();
    const { lastFrame } = render(
      <MemoryEditor content="x" onSave={() => {}} onChange={onChange} mode="edit" />
    );
    const text = lastFrame() ?? '';
    expect(text).toMatch(/edit|cursor/i);
  });

  it('renders in view mode shows read-only hint', () => {
    const { lastFrame } = render(
      <MemoryEditor content="x" onSave={() => {}} mode="view" />
    );
    const text = lastFrame() ?? '';
    expect(text).toMatch(/view|read/i);
  });

  it('view mode is the default', () => {
    const { lastFrame } = render(
      <MemoryEditor content="x" onSave={() => {}} />
    );
    expect(lastFrame()).toMatch(/view|read/i);
  });
});
