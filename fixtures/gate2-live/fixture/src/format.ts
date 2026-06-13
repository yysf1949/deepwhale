// format an invoice as a single string for printing / display.
export function formatInvoice(opts: {
  invoiceId: string;
  total: number;
  currency: 'USD' | 'EUR' | 'JPY';
}): string {
  const id = opts.invoiceId;
  const sign = opts.total < 0 ? '-' : '';
  const abs = Math.abs(opts.total);
  const fixed = abs.toFixed(2);
  return `${id} ${sign}${opts.currency} ${fixed}`;
}
