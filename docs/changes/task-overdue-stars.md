# Task deadline penalties

A scored task costs each of its reward recipients one star (10 score units) if it is not completed before the Moscow midnight following its scheduled date. Individually assigned scored tasks affect their assignee; unassigned scored tasks affect both users. Private tasks which do not earn stars are excluded because they live outside the scored native task store.

A date change committed before midnight exempts the old date. A later date change preserves an immutable missed-occurrence snapshot, including when the scheduler has not run yet. Applied penalties are never refunded on rescheduling. Completion timestamps before the deadline, including offline completion timestamps, exempt the occurrence. Unknown legacy completion timestamps are exempt rather than presumed late.

Each occurrence/recipient has a persistent receipt and an independent score dedupe key. The score write precedes the receipt, allowing safe retries after a partial failure. A distributed job lock prevents simultaneous scheduled checks; the existing authenticated 15-minute job runs the new finalizer independently of other notifications.

Configuration: config/task-overdue-stars.json, enabled and startDate. The initial date is 2026-11-03, so earlier deadlines are not charged retroactively. Recurring tasks are evaluated per occurrence, not per job invocation. The rules dialog documents these conditions.

Validation: task-overdue-stars tests cover cutoff, assignment, recurrence, completions, moves through both APIs, repeated/concurrent checks, partial-write retries, and endpoint authorization. Native task/calendar, finance percentage, syntax and offline asset tests protect the current release.
