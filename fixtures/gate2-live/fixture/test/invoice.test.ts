import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { subtotal, applyDiscount } from '../src/pricing.ts';
import { taxFor } from '../src/tax.ts';
import { formatInvoice } from '../src/format.ts';
import { buildInvoice } from '../src/invoice.ts';

// Tolerance for floating-point comparisons.
const EPS = 1e-9;
function eqApprox(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `expected ${expected} ± ${EPS}, got ${actual}`,
  );
}

test('subtotal sums unitPrice * quantity for each line', () => {
  assert.equal(subtotal([{ sku: 'A1', name: 'apple', unitPrice: 1.5, quantity: 4 }]), 6);
  assert.equal(subtotal([
    { sku: 'A1', name: 'apple', unitPrice: 1.5, quantity: 4 },
    { sku: 'B2', name: 'bread', unitPrice: 3, quantity: 2 },
  ]), 12);
});

test('subtotal returns 0 for empty items', () => assert.equal(subtotal([]), 0));

test('applyDiscount returns subtotal when no discount', () => {
  assert.equal(applyDiscount(100, null), 100);
});

test('applyDiscount applies percent discount', () => {
  assert.equal(applyDiscount(100, { kind: 'percent', value: 10 }), 90);
  assert.equal(applyDiscount(200, { kind: 'percent', value: 25 }), 150);
});

test('applyDiscount flat discount floors at 0', () => {
  assert.equal(applyDiscount(50, { kind: 'flat', value: 20 }), 30);
  assert.equal(applyDiscount(10, { kind: 'flat', value: 50 }), 0);
});

test('taxFor US-CA applies base rate', () => {
  eqApprox(taxFor('US-CA', 'A1', 100), 7.25);
});

test('taxFor US-CA grocery SKU is NOT tax-free (CA has no grocery exemption)', () => {
  // The buggy implementation accidentally exempts US-CA groceries; the test
  // expects the correct behavior of full tax.
  eqApprox(taxFor('US-CA', 'G-MILK', 100), 7.25);
  eqApprox(taxFor('US-CA', 'Grocery-x', 50), 50 * 0.0725);
});

test('taxFor US-NY applies base rate on non-grocery items', () => {
  assert.equal(taxFor('US-NY', 'A1', 100), 4);
});

test('taxFor US-NY grocery SKU (starts with G) is tax-free', () => {
  assert.equal(taxFor('US-NY', 'G-MILK', 50), 0);
  assert.equal(taxFor('US-NY', 'Grocery-x', 25), 0);
});

test('taxFor EU-DE applies 19%', () => {
  eqApprox(taxFor('EU-DE', 'A1', 100), 19);
});

test('taxFor EU-FR applies 20%', () => {
  eqApprox(taxFor('EU-FR', 'A1', 100), 20);
  eqApprox(taxFor('EU-FR', 'B2', 50), 10);
});

test('taxFor JP applies 10%', () => {
  assert.equal(taxFor('JP', 'A1', 100), 10);
});

test('formatInvoice prefixes invoice id and currency', () => {
  assert.equal(formatInvoice({ invoiceId: 'INV-001', total: 12.34, currency: 'USD' }), 'INV-001 | USD 12.34');
  assert.equal(formatInvoice({ invoiceId: 'INV-002', total: 0, currency: 'EUR' }), 'INV-002 | EUR 0.00');
});

test('formatInvoice shows negative sign', () => {
  assert.equal(formatInvoice({ invoiceId: 'INV-X', total: -5, currency: 'USD' }), 'INV-X | -USD 5.00');
});

test('buildInvoice produces correct total for US-CA no discount', () => {
  const inv = {
    invoiceId: 'INV-1', region: 'US-CA' as const,
    items: [{ sku: 'A1', name: 'apple', unitPrice: 10, quantity: 2 }],
    discount: null, currency: 'USD' as const,
  };
  const { total, formatted } = buildInvoice(inv);
  eqApprox(total, 20 + 20 * 0.0725);
  assert.equal(formatted, 'INV-1 | USD 21.45');
});

test('buildInvoice applies percent discount before tax (US-CA)', () => {
  const inv = {
    invoiceId: 'INV-2', region: 'US-CA' as const,
    items: [{ sku: 'A1', name: 'apple', unitPrice: 100, quantity: 1 }],
    discount: { kind: 'percent' as const, value: 10 }, currency: 'USD' as const,
  };
  // subtotal 100, after 10% discount = 90, tax = 90 * 0.0725 = 6.525
  const { total } = buildInvoice(inv);
  eqApprox(total, 90 + 90 * 0.0725);
});

test('buildInvoice NY grocery has zero grocery tax but tax on non-grocery', () => {
  const inv = {
    invoiceId: 'INV-3', region: 'US-NY' as const,
    items: [
      { sku: 'G-MILK', name: 'milk', unitPrice: 4, quantity: 2 },   // grocery, 0 tax
      { sku: 'A1', name: 'apple', unitPrice: 2, quantity: 3 },       // non-grocery, 4% tax
    ],
    discount: null, currency: 'USD' as const,
  };
  // subtotal 8 + 6 = 14; tax: 0 + 6 * 0.04 = 0.24; total = 14.24
  const { total } = buildInvoice(inv);
  eqApprox(total, 14.24);
});

test('buildInvoice EU-DE with flat discount', () => {
  const inv = {
    invoiceId: 'INV-4', region: 'EU-DE' as const,
    items: [{ sku: 'A1', name: 'apple', unitPrice: 100, quantity: 1 }],
    discount: { kind: 'flat' as const, value: 20 }, currency: 'EUR' as const,
  };
  // subtotal 100, after flat 20 = 80, tax 80 * 0.19 = 15.2
  const { total } = buildInvoice(inv);
  eqApprox(total, 80 + 80 * 0.19);
});

test('buildInvoice JP with percent discount formatted JPY', () => {
  const inv = {
    invoiceId: 'INV-5', region: 'JP' as const,
    items: [{ sku: 'A1', name: 'apple', unitPrice: 1000, quantity: 2 }],
    discount: { kind: 'percent' as const, value: 50 }, currency: 'JPY' as const,
  };
  // subtotal 2000, after 50% = 1000, tax 1000 * 0.10 = 100
  const { total, formatted } = buildInvoice(inv);
  eqApprox(total, 1100);
  assert.equal(formatted, 'INV-5 | JPY 1100.00');
});

test('buildInvoice empty items yields tax 0 and total 0', () => {
  const inv = {
    invoiceId: 'INV-0', region: 'US-CA' as const,
    items: [], discount: null, currency: 'USD' as const,
  };
  const { total } = buildInvoice(inv);
  assert.equal(total, 0);
});
