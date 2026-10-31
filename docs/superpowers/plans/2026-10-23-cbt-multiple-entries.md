# Multiple observations and calendar days

The user requested several separate observations during one program day and clarified that a day closes at actual midnight, rather than after filling an exercise. Existing source publication and production deployment are authorized.

- Keep the first answer record compatible with existing stored days and offline operations. Give additional records independent IDs, timestamps, drafts, saved state and conflict versions.
- Store the cycle's IANA timezone and local starting date. Calendar boundaries determine closed days and current day. Saving an observation changes its saved state only. Keep drafts and complete observations separate from elapsed-day progress.
- Migrate active legacy cycles once, preserving every answer and computing progress from actual calendar dates. Preserve interrupted/completed histories. Reuse existing authenticated state storage, actor isolation and outbox.
- Show an entry selector and add/save observation controls. All saved entries appear in weekly/history views. Charts show daily averages and report the number of entries separately.
- Verify multiple observations, reload, offline upload/retries, same-entry conflicts, DST, midnight, last-day completion, legacy migration and mobile layout. Build and check the release before one production deployment.
