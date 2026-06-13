import { describe, expect, it } from 'vitest';
import {
  recordProductionBrowserProof,
  type ProductionBrowserAdapter,
  type ProductionBrowserProofScenario,
} from '../../src/browser/production-proof.js';

const scenario: ProductionBrowserProofScenario = {
  id: 'd129-checkout-proof',
  url: 'https://example.test/checkout',
  goal: 'Complete a checkout form with visual grounding',
  steps: [
    { kind: 'navigate', url: 'https://example.test/checkout' },
    { kind: 'type', selector: 'input[name="email"]', value: 'agent@example.test' },
    { kind: 'click', selector: 'button[type="submit"]', label: 'Submit' },
    { kind: 'observe', selector: 'main' },
    { kind: 'visual-snapshot', selector: 'button[type="submit"]' },
  ],
};

function okAdapter(): ProductionBrowserAdapter {
  return async (command, context) => ({
    status: 'success',
    kind: command.kind,
    target: 'selector' in command ? command.selector : command.url,
    urlAfter: context.currentUrl ?? scenario.url,
    titleAfter: 'Checkout',
    ms: 12,
    summary: `${command.kind} ok`,
    ...(command.kind === 'visual-snapshot'
      ? {
          visual: {
            width: 1280,
            height: 720,
            sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            nonBlankRatio: 0.42,
            targetRects: [
              {
                selector: 'button[type="submit"]',
                x: 40,
                y: 80,
                width: 120,
                height: 32,
              },
            ],
          },
        }
      : {}),
  });
}

describe('production Browser proof recorder (D129)', () => {
  it('records a passing production automation transcript with visual grounding', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: true,
      scenario,
      adapter: okAdapter(),
    });

    expect(proof.passed).toBe(true);
    expect(proof.automationStatus).toBe('pass');
    expect(proof.visualGroundingStatus).toBe('pass');
    expect(proof.transcript.map((step) => step.kind)).toEqual([
      'navigate',
      'type',
      'click',
      'observe',
      'visual-snapshot',
    ]);
    expect(proof.transcript.every((step) => step.status === 'success')).toBe(true);
    expect(proof.visualSnapshots).toHaveLength(1);
    expect(proof.blockers).toEqual([]);
  });

  it('skips without opt-in', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: false,
      scenario,
      adapter: okAdapter(),
    });

    expect(proof.passed).toBe(false);
    expect(proof.automationStatus).toBe('blocked');
    expect(proof.visualGroundingStatus).toBe('blocked');
    expect(proof.skipReason).toBe('opt-in-required');
    expect(proof.blockers).toContain('production Browser proof requires explicit opt-in');
  });

  it('blocks automation when an adapter step fails', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: true,
      scenario,
      adapter: async (command, context) => ({
        status: command.kind === 'click' ? 'failed' : 'success',
        kind: command.kind,
        target: 'selector' in command ? command.selector : command.url,
        urlAfter: context.currentUrl ?? scenario.url,
        titleAfter: 'Checkout',
        ms: 12,
        summary: `${command.kind} attempted`,
        error: command.kind === 'click' ? 'button detached' : null,
      }),
    });

    expect(proof.passed).toBe(false);
    expect(proof.automationStatus).toBe('fail');
    expect(proof.blockers).toContain('production Browser transcript contains failed steps');
  });

  it('blocks visual grounding when the snapshot metadata is invalid', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: true,
      scenario,
      adapter: async (command, context) => ({
        status: 'success',
        kind: command.kind,
        target: 'selector' in command ? command.selector : command.url,
        urlAfter: context.currentUrl ?? scenario.url,
        titleAfter: 'Checkout',
        ms: 12,
        summary: `${command.kind} ok`,
        ...(command.kind === 'visual-snapshot'
          ? { visual: { width: 0, height: 720, sha256: 'bad', nonBlankRatio: 0, targetRects: [] } }
          : {}),
      }),
    });

    expect(proof.passed).toBe(false);
    expect(proof.automationStatus).toBe('pass');
    expect(proof.visualGroundingStatus).toBe('blocked');
    expect(proof.blockers).toContain('valid visual snapshot evidence is missing');
  });
});
