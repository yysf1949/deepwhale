// gate2-live fixture (D-40): invoice domain. 5 source files, 5 hidden bugs.
// LLM must read tests to discover the expected behavior, then trace through
// the source to find the bugs. No "BUG" comments in source — the agent has
// to actually read the test file and the source.
export type LineItem = { sku: string; name: string; unitPrice: number; quantity: number };
export type Discount = { kind: 'percent' | 'flat'; value: number };
export type Region = 'US-CA' | 'US-NY' | 'US-TX' | 'EU-DE' | 'EU-FR' | 'JP';
