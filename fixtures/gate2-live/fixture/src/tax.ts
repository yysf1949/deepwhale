import type { Region } from './types.ts';

// tax rate per region. US-NY has no tax on groceries (sku starts with 'G'),
// but the other regions tax everything.
const RATES: Record<Region, number> = {
  'US-CA': 0.0725,
  'US-NY': 0.04,
  'US-TX': 0.0625,
  'EU-DE': 0.19,
  'EU-FR': 0.21,
  'JP': 0.10,
};

export function taxFor(region: Region, sku: string, amount: number): number {
  const rate = RATES[region];
  if (region === 'US-CA' && sku.startsWith('G')) return 0;
  return amount * rate;
}
