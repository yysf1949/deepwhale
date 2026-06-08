import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ImagePreview } from '../src/components/ImagePreview.js';

describe('ImagePreview (D-31.3.9)', () => {
  it('renders image filename and size', () => {
    const { lastFrame } = render(
      <ImagePreview
        items={[
          { path: '/tmp/a.png', sizeBytes: 1024, kind: 'image' as const },
          { path: '/tmp/b.pdf', sizeBytes: 5120, kind: 'pdf' as const },
        ]}
        onOcr={() => {}}
      />
    );
    const text = lastFrame() ?? '';
    expect(text).toContain('a.png');
    expect(text).toContain('b.pdf');
    expect(text).toContain('1.0 KB');
  });

  it('shows empty state when no items', () => {
    const { lastFrame } = render(
      <ImagePreview items={[]} onOcr={() => {}} />
    );
    expect(lastFrame()).toMatch(/no attachments|empty/i);
  });

  it('renders ocr hint', () => {
    const { lastFrame } = render(
      <ImagePreview
        items={[{ path: '/tmp/a.png', sizeBytes: 100, kind: 'image' as const }]}
        onOcr={() => {}}
      />
    );
    expect(lastFrame()).toMatch(/ocr|press/i);
  });
});
