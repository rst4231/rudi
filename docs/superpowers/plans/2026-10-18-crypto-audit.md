# Crypto audit completion plan

Goal: complete the pending simulator audit and correctly recognize the author's AVA partial and final closes.

Architecture: keep historical balances intact and label execution limitations. Fix candle ordering/gap fills in the forward simulator. Recognize author lifecycle independently of price-source availability; never infer an unknown partial percentage or claim an exact result.

Constraints: current production base 82ea9a90; 40-market budget; no exchange orders; no deployment without user confirmation; no unrelated edits.

- [x] Reproduce the unfinished patch tests, then fix entry-candle ordering, stop gaps, and ambiguous exits in api/crypto-algorithms.cjs. Preserve legacy results with explicit evidence labels.
- [x] Reproduce AVA wording in tests/crypto-author-closure.test.cjs: reversed partial phrasing, passive residual closure, future/negated closure, and a stale saved result while market data is unavailable.
- [x] Fix api/crypto-trade-events.cjs and crypto-signals.cjs. Keep the known virtual entry and show unresolved author-closed positions without a fabricated PNL in crypto-virtual.cjs/public/crypto-signals.js.
- [x] Run crypto regressions, build and npm test. Document the 44-trade audit and remaining evidence limits. Commit locally, then ask once before deployment.
