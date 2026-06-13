# Gate-1 Preferred Target Inventory

Status: preferred-passed
Generated: 2026-06-13T00:00:00.000Z
Targets root: D:\App\openClaw\projects\deepwhale\.gate-targets
Minimum LOC: 50000
Preferred LOC: 100000

## Summary

- Total targets: 2
- Minimum-or-better targets: 2
- Preferred targets: 1
- Best available: react (753902 LOC, preferred-100k)

## Targets

- react: 753902 LOC, 4462 supported files, preferred-100k — **PASSED**
- vite: 86216 LOC, 1395 supported files, minimum-50k

## Interpretation

- `minimum-50k` is enough for the formal Gate-1 minimum.
- `preferred-100k` is required before claiming preferred Code Intel maturity.
- React passes Gate-1 with call chain: `createElement -> ReactElement` (same-file call, no barrel imports needed).
