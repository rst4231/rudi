# Partner finances below supplements

Request: move the last expense from the partner profile hero to a compact Finance section immediately below supplements. Show the partner's monthly category budget usage and largest purchase for the current Moscow calendar month.

Implementation:
- Extend the existing authenticated `partner-last-expense` response; reuse one finance-state read and existing request coalescing/offline response cache.
- Calculate budget with active category limits and all monthly expense amounts, matching `budget-status` (including balance adjustments). Select actual latest/largest purchases without manual adjustments; rank currencies by stored RUB value. Never return the full partner ledger.
- Move the existing last-expense node so live updates and restoration on closing the partner page continue to work. Insert the new section before the partner note.
- Keep existing budget color thresholds: green <50%, amber 50–99%, red >=100%. Clamp bar width to 100% and show actual percentage on overspend. Unset budget and no monthly purchases have explicit empty states.
- Keep release version unchanged until approved publication. Recheck production/latest commits before releasing; apply the package together in one deployment.

Validation:
- Build and JavaScript syntax checks pass.
- 21 focused Node tests pass (summary, currency ranking, actor isolation, Moscow month boundary, birthdays, plans, body metrics, existing expense integration, wishlist).
- Browser profile flows pass for both partner directions, including phone/tablet/desktop widths, restoration on close, stars/history, live updates, 0/65/120% budgets and unset-budget/no-purchase states.
- Full `npm test` stops at four pre-existing mood-picker-flow tests: dialog reuses weather dimensions; actual dialog clicks; custom answer form; keyboard focus. Two legacy profile suites additionally contain three pre-existing failures concerning removed contact controls and old profile layout. All seven also fail in a clean archive of production commit b2ae03b36574a64bd7e1a93a932b7e3290e05364. This task leaves unrelated mood and layout behavior unchanged.
