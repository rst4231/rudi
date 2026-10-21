# Live Artemyev scanner

User intent: the existing Artemyev scanner with OKX and Pionex API connections and automated real trading. Move the original virtual scanner into an expandable Archive while retaining all reports/history. Combine with the pending Pionex wallet integration and logo; one release, no deployment before explicit confirmation.

Reuse the existing parsed @ne_investor signal feed and existing scanner styles. The existing view shows connection/settings per exchange, real positions/order journal and the same 30-day feed. Real executions never use the virtual portfolio or its historical PNL.

Connections use separate encrypted trading credentials, disabled by default. User supplies margin per trade, aggregate margin cap and daily loss threshold before activation. Leverage 1–5, max positions 1–5. Only new explicit USDT perpetual signals after activation, with entry/TP/SL and valid geometry, can trade. No old-signal backfill, averaging or inferred partial closes. Full-close author updates close our position; explicit partial fraction closes that fraction once. Ambiguous signals are skipped visibly.

Orders use deterministic client IDs, atomic persistent claims, exchange order reconciliation and a per-exchange lease. A network timeout is unknown, never an instruction to resubmit. Exchange filters and quantity/price increments are checked before orders. Unrelated existing positions are never adopted or closed. OKX has exchange-native TP/SL; Pionex documented Futures order API has no native TP/SL fields, so its exits use one-minute server checks and require an explicit programmatic-stop acknowledgement in the UI. Pausing prevents new entries and keeps managing owned positions. Disconnect is disallowed until owned positions are closed. A live cron heartbeat is required for activation. Secrets are never in public reports/errors.

Schedule a Frankfurt function every minute, through the existing Cloudflare scheduler and authenticated Vercel finance handler, with a heartbeat. Disabled accounts cause no exchange requests. Existing feed refresh remains shared and budgeted; live checks consume cached signals. API outages keep exposure records and block new entries. Do not activate accounts or place real trades during development.

User steering: use OKX instead of Bybit for live scanner. Also add Gate read-only wallet synchronization and its logo. Keep existing Bybit wallet support.
