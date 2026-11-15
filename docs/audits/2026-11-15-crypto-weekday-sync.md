# Crypto balance synchronization and finance UI

Prepared from production v4.77 / 230b5f0dd78f9b5c20ad232e6fb03461c5fcf918.

- Automatic linked-wallet balance reads run Monday through Friday using Europe/Moscow, paused at Saturday 00:00 and resume Monday 00:00. Owner can additionally disable automatic synchronization using the crypto-page switch. Explicit manual refresh remains available. This controls wallet balances, not exchange order safety monitoring or paper strategy scanning.
- Preference is stored separately in rudi-crypto-sync-preferences-v1 / rustam, defaults enabled, ownership checked server-side. Automatic provider synchronization is gated on the server as well as UI. Existing balances and snapshots are retained on pause.
- Alternative.me daily Bitcoin Fear/Greed is validated, cached for one hour in isolated state, displays source and date, retains last value with stale label on outage. Documentation: https://alternative.me/crypto/fear-and-greed-index/#api
- Monthly planning card host and its two client scripts removed from the page; stored finance data and existing limits preserved.

Validation: 13 new behavior tests pass (Moscow weekend boundaries, switch persistence/auth/error rollback, provider calls skipped while paused, manual override and weekday resumption, live sentiment/cache/stale/error handling and UI). All 86 runnable local tests pass. daily-question-recovery.test.cjs and daily-question.test.cjs cannot start in this partial checkout due to missing products-bought.cjs (after pg installed to temporary test dependencies). Browser screenshot unavailable: Chromium denied process singleton socket. JavaScript syntax checks pass. Live Alternative.me endpoint successfully verified through the new module.

No deployment started. User approval required before deployment. One production deployment for the combined package.
