# Artemyev exit and candidate queue fixes

Goal: correct the three reproduced production v4.298 failures without changing account settings or replaying old signals.

Implementation: keep the existing scanner and persisted order journal. Prioritize market protection/manual exits above an author-priced exit. Persist a fixed target quantity per new partial-close event and subtract confirmed fills across capped orders. Skip unavailable contracts before requesting their price; stop on service/authentication failures.

- [x] Reproduce unavailable-contract starvation, author-price overriding a stop/manual close, and incomplete capped partial exits.
- [x] Add regression tests for those cases, zero fills, pending exits, protection interrupting a partial close, and legacy exit journals.
- [x] Implement changes in api/crypto-live.cjs.
- [x] Correct signal badges and entry/exit explanation in public/crypto-signals.js and public/index.html.
- [x] Update stale route/scheduler tests to exercise the existing dedicated runner and bypass binding.
- [x] Run all crypto tests, build and review the diff. Run npm test and report pre-existing unrelated failures.
- [ ] Recheck production head, publish one version, verify main-domain version and normal scheduler heartbeat without manually invoking trading.

Review focus: unknown exit outcomes must never cause duplicate orders; partial quantities must not overshoot the author fraction; old journals must retain their completed partials; network errors must not be treated as unsupported contracts; stop/manual exits must not inherit an author's price.
