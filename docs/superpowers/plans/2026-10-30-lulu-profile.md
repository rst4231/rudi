# Lulu monthly profile implementation

Goal: Stool selection after poop; avatar/name opens profile with monthly history and counts by actor.
Architecture: Extend existing shared Lulu state, existing home handlers and profile page styles. No new network polling or endpoints.
Constraints: Base production v4.376; current Moscow calendar month only; cancel own walks today only; preserve offline sync and undo; deploy only after user confirmation.
Decisions: Five descriptive stool types; optional selection for compatibility with old clients. No historical data can be reconstructed beyond existing retained walks.

- [x] Add behavior tests for monthly history, retention, Moscow boundaries, cancellation, undo and offline idempotency; observe failure.
- [x] Extend api/lulu-store.cjs, pass stool through api/partner-message.js. Prune stale data on reads, writes and backup restoration with TTL at month end.
- [x] Extend public/app.js and app.css: stool picker, profile page, monthly counts, grouped walk list, today-only cancel, history/back and offline updates.
- [x] Build, run targeted behavior and browser checks, run existing suite, review diff. Commit locally, no deployment or push that triggers deployment before confirmation.

Additional requested scope: current shared health problems (persist until edited), Diana veterinary expenses with separate food/vet subtotals and total.

Verification: build succeeded; 31 targeted Node tests and 2 offline queue tests passed; 4 mobile Chromium browser tests passed, including light/dark screenshots. Final review corrected expired backup version handling, out-of-order cancellation timestamps, and expired offline walk queue pruning.

Existing failures reproduced at production base 7b0b113: npm test stops on four tests in mood-picker-flow.test.cjs (dialog dimensions/emoji, dialog clicks, custom answer, focus/busy save). Baseline rudi-backup.test.cjs has six obsolete source-string checks (bootstrap registration, shell visibility, backup previews, UI order sync, immediate refresh, browser auth); content-offline.test.cjs has one obsolete home-note source check. Lulu toilet alert baseline has one pre-existing curve expectation mismatch (Diana before shift). None are introduced by this package.

Limit: history previously discarded by the daily-only store cannot be reconstructed; monthly history accumulates with this update. Finance matching uses category/label/note for dog food and veterinary purchases; existing transaction ledger remains intact.

Release prepared locally. No push or deployment performed.
