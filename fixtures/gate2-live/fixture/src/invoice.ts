import type { LineItem, Discount, Region } from './types.ts';
import { subtotal, applyDiscount } from './pricing.ts';
import { taxFor } from './tax.ts';
import { formatInvoice } from './format.ts';

export type Invoice = {
  invoiceId: string;
  region: Region;
  items: LineItem[];
  discount: Discount | null;
  currency: 'USD' | 'EUR' | 'JPY';
};

export function buildInvoice(inv: Invoice): { total: number; formatted: string } {
  const sub = subtotal(inv.items);
  const after = applyDiscount(sub, inv.discount);
  // Apply the discount proportionally to each line so that per-line tax
  // exemptions (e.g. US-NY grocery) are still respected when a discount is
  // present.
  const discountFactor = sub === 0 ? 1 : after / sub;
  let tax = 0;
  for (const it of inv.items) {
    const lineAmount = it.unitPrice * it.quantity;
    const discountedLine = lineAmount * discountFactor;
    tax += taxFor(inv.region, it.sku, discountedLine);
  }
  const total = after - tax;
  return { total, formatted: formatInvoice({ invoiceId: inv.invoiceId, total, currency: inv.currency }) };
}
