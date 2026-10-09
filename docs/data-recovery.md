# RUDI: D1 recovery and backup safeguards

Primary database: Cloudflare D1 `rudi-db`; application API: `rudi-db-api`.

## Confirmed recovery method
Cloudflare D1 Time Travel maintains automatic restoration points. The read-only bookmark API returned a valid bookmark on 2026-10-09. This is not a separate long-term offsite SQL backup. Cloudflare Time Travel retention is plan-dependent. Monitor that bookmarks continue to be available.

## Before a release
1. Read current bookmark via Cloudflare D1 `GET /accounts/{account_id}/d1/database/{database_id}/time_travel/bookmark` and record timestamp and identifier in a secure location (not the public repository).
2. Run Node regression tests and CI quality job; verify no failed tests.
3. Verify `/api/health`, finance read-only API through normal authenticated UI, D1 API health, and recent runtime errors.
4. Do not restart or restore production based on an isolated transient error.

## Incident response
1. Stop harmful *writers* before recovery. Do not delete or reset the database.
2. Identify the last known good point using deployment/runtime logs and a D1 Time Travel bookmark.
3. Export an additional independent SQL copy if possible. **Warning:** D1 SQL export may temporarily block queries; schedule it in a maintenance window.
4. Restore only after explicit owner approval. D1 Time Travel is a **database-wide** operation and may undo unrelated legitimate writes.
5. Verify records, balances, and last finance operations after the restore; only then resume writers.

## Next upgrade
Implement server-side compare-and-swap in the Cloudflare Worker for the single-document finance store; local Node mutexes do not serialize across parallel Vercel function instances. Schedule an offsite encrypted backup to R2 with a separate retention policy, ownership controls, alerting and a tested restore path. Do not place finance exports, secrets or snapshots in this public repository.
