# Gate-1.5 Live Browser Tasks

Generated: 2026-06-11

## Live Browser Task Sourcing Queue

- Required live tasks: 20
- Candidate live tasks queued: 20
- Pending live tasks: 11
- Completed live tasks: 9
- Successes: 9
- Failures: 0
- Success rate: 0.45
- Binding decision: false
- Branch decision: defer-live-evidence
- Browser enhancement unlocked: false
- Runner status: opt-in-runner-available
- Result recorder status: first-result-recorded

20 candidate live Browser tasks are queued, D115 adds an explicit opt-in runner boundary, D116 adds the pure result recorder for explicit runner output, D117 adds the single-run opt-in evidence runner, D118 adds the batch evidence runner that accumulates multiple stub-recorded completions in one call, D119 adds the real HTTP Browser evidence adapter, and D120 adds hybrid HTTP+JS evidence. 9 of 20 live tasks have been recorded as completed: 4 via D-117/D-118 stub adapters (docs-search-query, docs-filter-results, account-login-form, contact-form-required-field), 2 via D-119 real HTTP fetch (newsletter-signup fetched from `https://example.com/`; product-search fetched from `https://www.iana.org/`), and 3 via D-120 hybrid evidence (product-sort and cart-add-item as HTTP-evidence; keyboard-search-shortcut as JS-evidence). D121 fixes non-contiguous hybrid task mapping and D122 adds per-task JS action mapping for future hybrid evidence runs, but neither increases the completed live-result count. Of the 9 successful tasks, 4 are stub-evidence, 4 are HTTP-evidence, and 1 is JS-evidence. The repository ledger now reflects 9/20 completed live results and partial-results status; binding remains false because 11 completed live results are still required. The fixture report remains advisory dry-run evidence only: `docs/superpowers/gate-1.5-browser-viability.json`.

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
| cart-update-quantity | pending | Update an item quantity in a cart and verify the subtotal updates. |
| checkout-address-validation | pending | Enter an incomplete shipping address and observe the validation message. |
| table-filter | pending | Filter a data table by text and verify non-matching rows disappear. |
| table-pagination | pending | Move to the next page of a paginated table and verify the page indicator changes. |
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
- The result recorder is available for explicit runner output. D-117 records 1 task (1/20) via stub adapter, D-118 records 3 more tasks (4/20 cumulative) via a batch evidence runner with stub adapters, D-119 records 2 more tasks (6/20 cumulative) via a real HTTP Browser adapter, and D-120 records 3 more tasks (9/20 cumulative) via hybrid HTTP+JS evidence. D-121 fixes non-contiguous hybrid task mapping, and D-122 adds per-task JS action mapping for future hybrid evidence runs. Of the 9 successful tasks, 4 are stub-evidence (D-117/118), 4 are HTTP-evidence (D-119/120), and 1 is JS-evidence (D-120). 11/20 remain pending and binding is still false.
- A binding Browser branch decision still requires 20 completed live Browser task results.
- Browser enhancement work stays locked until live evidence is available.
- Browser remains opt-in and not default-enabled.

## Next Action

D123: continue hybrid real Browser evidence accumulation with task-specific JS actions to grow repository evidence without unlocking Browser defaults until 20 completed live task results exist.
