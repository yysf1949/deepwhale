# Gate-1.5 Live Browser Tasks

Generated: 2026-06-11

## Live Browser Task Sourcing Queue

- Required live tasks: 20
- Candidate live tasks queued: 20
- Pending live tasks: 19
- Completed live tasks: 1
- Successes: 1
- Failures: 0
- Success rate: 0.05
- Binding decision: false
- Branch decision: defer-live-evidence
- Browser enhancement unlocked: false
- Runner status: opt-in-runner-available
- Result recorder status: first-result-recorded

20 candidate live Browser tasks are queued, D115 adds an explicit opt-in runner boundary, D116 adds the pure result recorder for explicit runner output, and D117 adds the opt-in live Browser evidence runner that orchestrates the chain end-to-end. 1 of 20 live tasks (docs-search-query) has been recorded as completed through the new evidence runner with a stub adapter. This is sourcing, runner-boundary, result-recorder, AND first-recorded-evidence evidence: it proves the chain can produce a real completed-task increment, not that any real Browser automation has passed. The repository ledger now reflects 1/20 completed live results and partial-results status; binding remains false because 20 completed live results are still required. The fixture report remains advisory dry-run evidence only: `docs/superpowers/gate-1.5-browser-viability.json`.

## Candidate Tasks

| ID | Status | Goal |
| --- | --- | --- |
| docs-search-query | pending | Search documentation for a named feature and open the most relevant result. |
| docs-filter-results | pending | Filter documentation search results by a category and verify the filtered list changes. |
| account-login-form | pending | Fill an account login form with test credentials and stop before submitting real credentials. |
| contact-form-required-field | pending | Submit a contact form with one required field missing and observe the validation message. |
| newsletter-signup | pending | Enter an email address into a newsletter signup form and verify the confirmation state. |
| product-search | pending | Search for a product by name and identify the first matching result. |
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
- The result recorder is available for explicit runner output. D-117 records the first opt-in live Browser evidence (1/20 completed) but 19/20 remain pending and binding is still false.
- A binding Browser branch decision still requires 20 completed live Browser task results.
- Browser enhancement work stays locked until live evidence is available.
- Browser remains opt-in and not default-enabled.

## Next Action

D118: continue opt-in evidence run to accumulate completed results without unlocking Browser defaults until 20 completed live task results exist.
