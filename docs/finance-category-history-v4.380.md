# Category history totals, v4.380

Category tiles counted saved manualAdjustment records while category history excluded them. Restore these existing amounts to category history, day totals, month totals and search. Display legacy aggregate rows as Расход without internal storage terminology. Preserve stored values and wallet balances; no data migration or financial writes.

Legacy aggregate rows do not open the individual purchase editor, which requires a wallet-backed purchase. Ordinary rows carry their expense ID so the editor resolves the correct record. Existing delete behavior is unchanged.

Validation:

- Regression tests failed before the fix because saved additional amounts were omitted. Four tests now pass: monthly and daily totals, date range, signed amounts, search.
- 28 focused tests pass across category history, CoinKeeper, month rollover, expense editor and release version.
- npm run build, node --check public/app.js and git diff --check pass.
- npm test stops at four pre-existing mood-picker-flow failures: dialog reuses weather dimensions and contains no emoji rendering; actual dialog clicks show text, retain analyzer, save final draft and restore scroll; actual custom answer form saves text; analyzer and Escape never save drafts; keyboard focus stays inside dialog; busy save ignores cancel and duplicate clicks.
- finance-store.test.cjs has two additional baseline failures: personal finances are isolated by actor; personal finances and debts are private to their author. Both reproduced from unmodified HEAD in a separate temporary checkout. Backend finance code is unchanged by this fix.

Production deployment awaits approval. No real user records are included in test fixtures.

## Planned limits and previous-month spending

The category editor now offers the selected month, current month and next month for setting a limit. A dated limit takes effect in its chosen month and carries forward until another dated change. Existing monthlyLimit remains the baseline for earlier months. Zero is an explicit no-limit override. The monthlyLimits map is normalized and persisted with the existing actor-specific category; no migration or new database is needed.

The browser tiles, monthly budget line, server home budget badge and partner budget summary use the same resolver. Existing month rollover refreshes the view without a deployment or scheduled write. User-interface text under the limit shows the category's actual previous-month spending, including saved additional amounts and available archive totals. Selecting November shows October; selecting October shows September.

Changing a limit does not send the spending field when it is unchanged from opening the editor, preventing a budget-only save from changing expense totals. The existing individual category editor and API are reused; a separate planning dashboard was unnecessary for this request. Category saving retains its existing online-only behavior.

Additional validation:

- Six new tests pass: persistence and actor isolation, zero and independent plans, invalid-month rejection, effective-month/year-boundary resolution, editor month selection/prior spending, and save payload without expense mutation.
- 36 focused financial tests and 4 release tests pass; one mobile browser test passes and the screenshot was inspected for overflow.
- Build, syntax checks and whitespace checks pass. New resolver is linked before app.js and included in the service-worker asset list.
- Full npm test still stops at the four mood-picker-flow baseline failures listed above.
- web-assets.test.cjs has one additional pre-existing failure: read-only sections prefer live API online and use snapshots only as fallback. Its test and public/pwa-extras.js are unchanged from HEAD; the other six asset tests pass.
