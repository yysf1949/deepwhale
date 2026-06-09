import { describe, expect, it } from 'vitest';
import { planBrowserAction } from '../../src/browser/planner.js';

describe('browser strategic recovery', () => {
  it('returns a different action when the previous click on a button failed', () => {
    const obs = {
      url: 'https://example.com',
      title: 'Example',
      domSummary: '<main>: 1 button, 1 input',
      visibleElements: [
        { tag: 'button', text: 'Submit', label: 'Submit', confidence: 0.9 },
        { tag: 'input', ariaLabel: 'Email', label: 'Email', confidence: 0.9 },
      ],
      actionHistory: [],
    };
    const recovery = planBrowserAction({
      userIntent: 'submit the form',
      observation: obs,
      failureHistory: [
        { action: { type: 'click', target: 'Submit' }, failureReason: 'element-not-clickable' },
      ],
    });
    expect(recovery.type).not.toBe('click');
    expect(['type', 'navigate', 'skip']).toContain(recovery.type);
  });

  it('returns a skip action when the same target has more than 2 failures', () => {
    const obs = {
      url: 'https://example.com',
      title: 'Example',
      domSummary: '<main>: 1 button',
      visibleElements: [{ tag: 'button', text: 'X', label: 'X', confidence: 0.9 }],
      actionHistory: [],
    };
    const result = planBrowserAction({
      userIntent: 'click the X button',
      observation: obs,
      failureHistory: [
        { action: { type: 'click', target: 'X' }, failureReason: 'timeout' },
        { action: { type: 'click', target: 'X' }, failureReason: 'timeout' },
        { action: { type: 'click', target: 'X' }, failureReason: 'timeout' },
      ],
    });
    expect(result.type).toBe('skip');
    expect(result.reason).toBe('too-many-failures');
  });
});
