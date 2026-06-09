// gate2-live fixture (D-39): 6 buggy functions, intended to require ~30 tool calls
// (read, list, find, multiple patches, run tests, verify, possibly retry).
//
// Bugs:
//   1. subtract   : a + b       (should be a - b)
//   2. multiply   : a + b       (should be a * b)
//   3. divide     : a * b       (should be a / b)
//   4. power      : base * exp  (should be base ** exp)
//   5. squareRoot : Math.abs    (should be Math.sqrt)
//   6. clamp      : returns max (should be Math.min(max, Math.max(min, v)))
export function add(a: number, b: number): number { return a + b; }
export function subtract(a: number, b: number): number { return a + b; /* BUG 1 */ }
export function multiply(a: number, b: number): number { return a + b; /* BUG 2 */ }
export function divide(a: number, b: number): number { return a * b; /* BUG 3 */ }
export function power(base: number, exponent: number): number { return base * exponent; /* BUG 4 */ }
export function squareRoot(n: number): number { return Math.abs(n); /* BUG 5 */ }
export function clamp(value: number, min: number, max: number): number { return Math.max(min, max); /* BUG 6 */ }
export function factorial(n: number): number {
  if (n < 0) throw new Error('negative input');
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}
