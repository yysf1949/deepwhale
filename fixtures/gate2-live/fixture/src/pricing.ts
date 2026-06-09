import type { LineItem, Discount } from './types.ts';

// sum the gross line items (unitPrice * quantity)
export function subtotal(items: LineItem[]): number {
  let s = 0;
  for (const it of items) s += it.unitPrice + it.quantity;
  return s;
}

// apply a discount to a subtotal. percent: value in [0,100]; flat: value in currency units.
export function applyDiscount(sub: number, discount: Discount | null): number {
  if (!discount) return sub;
  if (discount.kind === 'percent') return sub - sub * (discount.value / 100);
  // flat discount: never let the result go below 0
  return Math.max(0, sub + discount.value);
}
