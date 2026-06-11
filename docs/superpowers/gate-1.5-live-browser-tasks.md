# Gate-1.5 Live Browser Tasks

Generated: 2026-06-11

## Live Browser Task Sourcing Queue

- Required live tasks: 20
- Candidate live tasks queued: 20
- Pending live tasks: 20
- Completed live tasks: 0
- Successes: 0
- Failures: 0
- Success rate: not available
- Binding decision: false
- Branch decision: defer-live-evidence
- Browser enhancement unlocked: false
- Runner status: opt-in-runner-available
- Result recorder status: available

20 candidate live Browser tasks are queued, D115 adds an explicit opt-in runner boundary, and D116 adds the pure result recorder for explicit runner output. This is sourcing, runner-boundary, and result-recorder evidence only: it proves queued tasks can be consumed only with `optIn=true` plus an injected adapter and that accepted result rows can update ledger accounting, not that any repository live Browser task has passed. The fixture report remains advisory dry-run evidence only: `docs/superpowers/gate-1.5-browser-viability.json`.

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
- The result recorder is available for explicit runner output, but the repository ledger still has 0 completed live results.
- A binding Browser branch decision still requires 20 completed live Browser task results.
- Browser enhancement work stays locked until live evidence is available.
- Browser remains opt-in and not default-enabled.

## Next Action

D117: run and record opt-in Gate-1.5 Browser evidence through the live result recorder without unlocking Browser defaults until 20 completed live task results exist.
