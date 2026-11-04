# Monthly finance plan implementation plan

> Native execution in this session, following the user's instruction to implement after the spacing deployment.

**Goal:** Automatically prepare next month's private budget proposal from recorded income, expenses and recurring obligations, with dated funding warnings and explicit acceptance of category limits.

**Architecture:** A shared pure browser/server calculator consumes the existing actor-scoped finance view. Existing finance list/mutation events update the proposal without extra polling; an authenticated apply operation recalculates and atomically saves month-specific limits. Housing carries the latest known actor share as an explicitly estimated obligation. No automatic overwrite of explicit next-month limits.

**Stack:** Existing CommonJS API, UMD browser scripts, D1-backed finance store, Node tests and Playwright.

**Constraints:** Actor isolation; native category currencies; unknown rates/income remain unknown; no double-counting fixed expenses or transfers; Moscow month boundaries; accept proposals before writing limits; one combined deployment with the queued weekly shopping feature. Receipt-based completion is explicitly excluded by the user.

**Review focus:** Missing/partial histories; future-dated or transferred money; bills before income; paid/prepaid obligations; concurrent plan/category edits and idempotent acceptance.

## Tasks

- [x] Calculator: add public/finance-monthly-plan-core.js and behavioral tests for complete/empty/single-month histories, housing carryover, fixed-spending deductions, FX, monthly rollover, income dates, manual limits and dated shortages.
- [x] Persistence/API: add build context on list, authenticated plan acceptance using a freshly recalculated proposal, atomic actor-scoped category updates and idempotency; test stale previews, actor spoofing and retained history.
- [x] UI: add a compact automatic monthly plan card to personal Finances, show assumptions and shortages, edit expected income/day, accept proposed limits, and refresh from existing finance events. Verify both accounts/themes and privacy on actor changes.
- [x] Verify build, focused regression tests and actual browser flow; then implement the weekly shopping feature and publish the combined packet only after final review/authorization.
