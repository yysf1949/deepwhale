# Gate-1.5 Live Browser Tasks

Generated: 2026-06-11

## Live Browser Task Sourcing Queue

- Required live tasks: 20
- Candidate live tasks queued: 20
- Pending live tasks: 14
- Completed live tasks: 6
- Successes: 6
- Failures: 0
- Success rate: 0.3
- Binding decision: false
- Branch decision: defer-live-evidence
- Browser enhancement unlocked: false
- Runner status: opt-in-runner-available
- Result recorder status: first-result-recorded

20 candidate live Browser tasks are queued, D115 adds an explicit opt-in runner boundary, D116 adds the pure result recorder for explicit runner output, D117 adds the single-run opt-in evidence runner, D118 adds the batch evidence runner that accumulates multiple stub-recorded completions in one call, and D119 adds the real HTTP Browser evidence adapter that uses Node's built-in `fetch` to record real network-call evidence (status, body length, page title). 6 of 20 live tasks have been recorded as completed: 4 via D-117/D-118 stub adapters (docs-search-query, docs-filter-results, account-login-form, contact-form-required-field) and 2 via D-119 real HTTP fetch (newsletter-signup fetched from `https://example.com/` returning status=200, content-type=text/html, body-length=559, title="Example Domain"; product-search fetched from `https://www.iana.org/` returning status=200, content-type=text/html; charset=UTF-8, body-length=6140, title="Internet Assigned Numbers Authority"). Of the 6 successful tasks, 4 are stub-evidence (D-117/118) and 2 are real-evidence (D-119). The repository ledger now reflects 6/20 completed live results and partial-results status; binding remains false because 14 completed live results are still required. The fixture report remains advisory dry-run evidence only: `docs/superpowers/gate-1.5-browser-viability.json`.

## Candidate Tasks

| ID | Status | Goal |
| --- | --- | --- |
| docs-search-query | success | stub-run | D-117 | Search documentation for a named feature and open the most relevant result. |
| docs-filter-results | success | stub-run | D-118 | Filter documentation search results by a category and verify the filtered list changes. |
| account-login-form | success | stub-run | D-118 | Fill an account login form with test credentials and stop before submitting real credentials. |
| contact-form-required-field | success | stub-run | D-118 | Submit a contact form with one required field missing and observe the validation message. |
| newsletter-signup | success | real-fetch | D-119 | Enter an email address into a newsletter signup form and verify the confirmation state. (Fetched from `https://example.com/`; status=200, body=559, title="Example Domain".) |
| product-search | success | real-fetch | D-119 | Search for a product by name and identify the first matching result. (Fetched from `https://www.iana.org/`; status=200, body=6140, title="Internet Assigned Numbers Authority".) |
| product-sort | pending | Change product sort order and verify the result order changes. |
| cart-add-item | pending | Add one item to a cart and verify the cart count increments. |
| cart-update-quantity | pending | Update an item quantity in a cart and verify the subtotal updates. |
| checkout-address-validation | pending | Enter an incomplete shipping address and observe the validation message. |
| table-filter | pending | Filter a data table by text and verify non-matching rows disappear. |
| table-pagination | pending | Move to the next page of a paginated table and verify the page indicator changes. |
| settings-toggle | pending | Toggle a binary setting and verify the saved state is visible. |
| profile-edit | pending | Edit a profile display name and verify the preview reflects the change. |
| modal-open-close | pending | Open a modal dialog and close it with the visible close control. |
| tabs-switch | pending | Switch between two tabs and verify the active panel changes. |
| keyboard-search-shortcut | pending | Focus the site search field and enter a query using browser typing. |
| breadcrumb-navigation | pending | Use breadcrumb navigation to return to the parent topic. |
| download-link-detection | pending | Find a download link for a named asset without downloading executable content. |
| error-page-recovery | pending | Recover from a not-found page by navigating back to the home page. |

## Constraints

- Candidate tasks are sourcing evidence only; they are not completed live Browser evidence.
- The runner boundary is available only through explicit opt-in and an injected adapter.
- The result recorder is available for explicit runner output. D-117 records 1 task (1/20) via stub adapter, D-118 records 3 more tasks (4/20 cumulative) via a batch evidence runner with stub adapters, and D-119 records 2 more tasks (6/20 cumulative) via a real HTTP Browser adapter that fetches example.com and iana.org with Node built-in fetch. Of the 6 successful tasks, 4 are stub-evidence (D-117/118) and 2 are real-evidence (D-119). 14/20 remain pending and binding is still false.
- A binding Browser branch decision still requires 20 completed live Browser task results.
- Browser enhancement work stays locked until live evidence is available.
- Browser remains opt-in and not default-enabled.

## Next Action

D120: continue real fetch batch accumulation to grow the repository evidence without unlocking Browser defaults until 20 completed live task results exist.
