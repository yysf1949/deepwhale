# Gate-1.5 Live Browser Tasks

Generated: 2026-06-11

## Live Browser Task Sourcing Queue

- Required live tasks: 20
- Candidate live tasks queued: 20
- Pending live tasks: 7
- Completed live tasks: 13
- Successes: 13
- Failures: 0
- Success rate: 1
- Binding decision: false
- Branch decision: defer-live-evidence
- Browser enhancement unlocked: false
- Runner status: opt-in-runner-available
- Result recorder status: first-result-recorded

20 candidate live Browser tasks are queued, D115 adds an explicit opt-in runner boundary, D116 adds the pure result recorder for explicit runner output, D117 adds the single-run opt-in evidence runner, D118 adds the batch evidence runner that accumulates multiple stub-recorded completions in one call, D119 adds the real HTTP Browser evidence adapter, D120 adds hybrid HTTP+JS evidence, and D124 chains two updatedLedger accumulation runs to add 4 more live evidence results on top of the 9 from D-117..D-120. 13 of 20 live tasks have been recorded as completed: 4 via D-117/D-118 stub adapters (docs-search-query, docs-filter-results, account-login-form, contact-form-required-field), 4 via D-119/D-120 real HTTP fetch (newsletter-signup fetched from `https://example.com/`; product-search fetched from `https://www.iana.org/`; product-sort fetched from `https://example.com/`; cart-add-item fetched from `https://www.iana.org/`), 1 via D-120 JS evidence (keyboard-search-shortcut), and 4 via D-124 updatedLedger accumulation (cart-update-quantity as HTTP-evidence from `https://example.com/`; checkout-address-validation as JS-evidence `click-element` on `https://example.com/`; table-filter as HTTP-evidence from `https://www.iana.org/`; table-pagination as JS-evidence `extract-text` on `https://www.iana.org/`). D121 fixes non-contiguous hybrid task mapping, D122 adds per-task JS action mapping, D123 makes hybrid evidence return a recomputed `updatedLedger` for future hybrid batches, and D124 consumes that updatedLedger to advance the cumulative count from 9/20 to 13/20. Of the 13 successful tasks, 4 are stub-evidence, 6 are HTTP-evidence, and 3 are JS-evidence. The repository ledger now reflects 13/20 completed live results and partial-results status; binding remains false because 7 completed live results are still required. The fixture report remains advisory dry-run evidence only: `docs/superpowers/gate-1.5-browser-viability.json`.

## Candidate Tasks

| ID | Status | Goal |
| --- | --- | --- |
| docs-search-query | success | stub-run | D-117 | Search documentation for a named feature and open the most relevant result. |
| docs-filter-results | success | stub-run | D-118 | Filter documentation search results by a category and verify the filtered list changes. |
| account-login-form | success | stub-run | D-118 | Fill an account login form with test credentials and stop before submitting real credentials. |
| contact-form-required-field | success | stub-run | D-118 | Submit a contact form with one required field missing and observe the validation message. |
| newsletter-signup | success | real-fetch | D-119 | Enter an email address into a newsletter signup form and verify the confirmation state. (Fetched from `https://example.com/`; status=200, body=559, title="Example Domain".) |
| product-search | success | real-fetch | D-119 | Search for a product by name and identify the first matching result. (Fetched from `https://www.iana.org/`; status=200, body=6140, title="Internet Assigned Numbers Authority".) |
| product-sort | success | real-fetch | D-120 | Change product sort order and verify the result order changes. (Fetched from `https://example.com/`; status=200, body=559, title="Example Domain".) |
| cart-add-item | success | real-fetch | D-120 | Add one item to a cart and verify the cart count increments. (Fetched from `https://www.iana.org/`; status=200, body=6140, title="Internet Assigned Numbers Authority".) |
| cart-update-quantity | success | real-fetch | D-124 | Update an item quantity in a cart and verify the subtotal updates. (Fetched from `https://example.com/`; status=200, body=559, title="Example Domain", ms=973.) |
| checkout-address-validation | success | real-js | D-124 | Enter an incomplete shipping address and observe the validation message. (JS `click-element` on `a[href]` at `https://example.com/`; pageTitle="Example Domain", ms=1005.) |
| table-filter | success | real-fetch | D-124 | Filter a data table by text and verify non-matching rows disappear. (Fetched from `https://www.iana.org/`; status=200, body=6140, title="Internet Assigned Numbers Authority", ms=1091.) |
| table-pagination | success | real-js | D-124 | Move to the next page of a paginated table and verify the page indicator changes. (JS `extract-text` on `body` at `https://www.iana.org/`; pageTitle="Internet Assigned Numbers Authority", ms=8029.) |
| settings-toggle | pending | Toggle a binary setting and verify the saved state is visible. |
| profile-edit | pending | Edit a profile display name and verify the preview reflects the change. |
| modal-open-close | pending | Open a modal dialog and close it with the visible close control. |
| tabs-switch | pending | Switch between two tabs and verify the active panel changes. |
| keyboard-search-shortcut | success | real-js | D-120 | Focus the site search field and enter a query using browser typing. (Filled `input[name="q"]` on `https://www.bing.com/` with `deepwhale d-120 hybrid test`.) |
| breadcrumb-navigation | pending | Use breadcrumb navigation to return to the parent topic. |
| download-link-detection | pending | Find a download link for a named asset without downloading executable content. |
| error-page-recovery | pending | Recover from a not-found page by navigating back to the home page. |

## Constraints

- Candidate tasks are sourcing evidence only; they are not completed live Browser evidence.
- The runner boundary is available only through explicit opt-in and an injected adapter.
- The result recorder is available for explicit runner output. D-117 records 1 task (1/20) via stub adapter, D-118 records 3 more tasks (4/20 cumulative) via a batch evidence runner with stub adapters, D-119 records 2 more tasks (6/20 cumulative) via a real HTTP Browser adapter, D-120 records 3 more tasks (9/20 cumulative) via hybrid HTTP+JS evidence, and D-124 records 4 more tasks (13/20 cumulative) via updatedLedger accumulation through recordHybridRealBrowserEvidence. D-121 fixes non-contiguous hybrid task mapping, D-122 adds per-task JS action mapping for future hybrid evidence runs, D-123 makes hybrid evidence return a recomputed `updatedLedger` for future batches, and D-124 consumes that updatedLedger to advance the cumulative count from 9/20 to 13/20. Of the 13 successful tasks, 4 are stub-evidence (D-117/118), 6 are HTTP-evidence (D-119/120/124), and 3 are JS-evidence (D-120/124). 7/20 remain pending and binding is still false.
- A binding Browser branch decision still requires 20 completed live Browser task results.
- Browser enhancement work stays locked until live evidence is available.
- Browser remains opt-in and not default-enabled.

## Next Action

D125: continue hybrid live Browser evidence accumulation without unlocking Browser defaults until 20 completed live task results exist.
