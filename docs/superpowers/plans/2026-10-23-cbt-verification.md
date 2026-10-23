# RUDI CBT v4.304 verification

Production baseline: ed709b36 (v4.303). Isolated branch: codex/cbt-21-days.

## Implemented
- 21 distinct lessons with explanations, examples, exercises and takeaways; free pacing.
- Home shortcut directly after games; responsive reference palette; root light/dark/system theme.
- Private actor-scoped records using existing RUDI authentication and durable state.
- Immediate offline drafts, compact unsent updates, immutable sent ids, batched writes, retry, expected actor protection.
- Three-way field merging, explicit conflicts, preserved versions on server, independent historic cycles.
- Weekly reflections, completion dates, factual reports, graphs, comparison, restart confirmation.
- Four CBT assets in mandatory service-worker install cache; validated server copy overrides with offline bundle.

## Evidence
- `node build.cjs`: passed.
- CBT domain/API: 19 tests passed.
- Focused integration/regression command: 66 tests passed, 0 failed (CBT, authentication, syntax, mood picker, custom mood history, home shortcuts, themes and offline assets).
- `playwright tests/ui/cbt.spec.cjs`: 10 passed in mobile Chromium, including every lesson, restart, read-only history, drafts/reload, same-field conflicts, stale focused editor, lost server reply, long offline typing, actual service-worker offline script load.
- 320px horizontal overflow check passed; light/dark screenshots visually inspected with existing RUDI styles loaded.
- Independent review found four important issues (retry payload identity, actor changes, displayed field base, incomplete completion). Fixed and covered by regression tests.
- `git diff --check`: passed.

## Existing suite failures
`npm test` reaches the same two pre-existing failures in tests/v4.205-ios-date-time.test.cjs:
- iPhone task editor has exactly one native date and one native time input, with no overlay buttons
- date selection still disables time when task has no date
Both were reproduced before CBT changes. The editor files were not modified.
`npm run test:current` also stops on the pre-existing static picker assertion in tests/v4.207-notification-and-picker-dedup.test.cjs.
Broader optional selection found pre-existing assertions in home-agenda-scope.test.cjs and web-assets.test.cjs; none concern modified CBT logic.

## Limits
Browser checks use mobile emulation, not a physical iPhone. Server storage/authentication are tested through the real handler with an injected durable-state substitute; no private production diary was read or modified during QA. Deployment smoke checks must confirm the public shell version, CBT assets and route availability.

## Changed files
- `VERSION`
- `api/cbt-handler.cjs`
- `api/index.js`
- `build.cjs`
- `package.json`
- `public/cbt-content.js`
- `public/cbt-core.js`
- `public/cbt.js`
- `public/cbt.css`
- `public/home-reference-layout.js`
- `public/index.html`
- `public/sw.js`
- `public/version.json`
- `rudi-version.json`
- `vercel.json`
- `tests/cbt.test.cjs`
- `tests/cbt-handler.test.cjs`
- `tests/ui/cbt.spec.cjs`
- `docs/superpowers/plans/2026-10-23-cbt-21-days.md`
- `docs/superpowers/plans/2026-10-23-cbt-verification.md`

## Release history
The user explicitly authorized source publication to the existing public rst4231/rudi repository. v4.304 was deployed once from e2ebd2d39ad70aad34825b5ef60db6185e721e0e and confirmed READY on the original production domain. The public version, CBT JavaScript, service worker and API route were checked.

## v4.305 interface stability follow-up
- Removed the visible CBT caption below the home icon and centered its SVG; accessible name retained.
- Fixed navigation outside the inner scrolling area; fixed-body lock restores the underlying app scroll exactly on close.
- Opted the CBT page out of existing global pull-to-refresh and edge-swipe handlers through their supported data attributes.
- Added boundary touch containment and visual-viewport sizing for the mobile keyboard.
- Removed repeated card entrance transforms; unchanged sync responses retain the same DOM nodes. Details remain open during changed background refreshes.
- 66 focused unit/regression checks passed.
- 14 mobile browser scenarios passed, including the four new stability, boundary, unchanged-sync and keyboard/scroll-restoration checks.
- JavaScript syntax, local build and diff whitespace checks passed. Light/dark mobile screenshots inspected.
- Changes are based on production v4.304; CBT answers, history and backend logic were not changed.
