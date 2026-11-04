# Weather page and two-month forecast

Goal: keep the current weather design on an app page, open it from both weather triggers, make it selectable as startup, and fill current/next month with clearly marked long-range temperatures.

Approach: retain the existing Open-Meteo short-range feed. Fetch ECMWF seamless ensemble-mean daily minima/maxima lazily for the month view through the existing weather route (range=months); cache for six hours, retain at most two days during outages, partition by Moscow month. Short-range values win overlaps; missing and long-range values stay distinguishable. No additional polling, database changes or new dependencies.

- [x] Add behavioral tests and implement monthly server/client caches, timeout, validation, outage and December rollover.
- [x] Reuse the forecast tabs/rows/grids on a normal weather app route. Native app back/history replaces the dialog; smart-home weather becomes a button. Preserve precise calendar-day summaries.
- [x] Enable weather startup preference in both client and actor-scoped server storage; verify both accounts.
- [x] Build, regression tests, DOM flow and live provider check; save one release and request deployment once.

Review focus: failed long-range source never breaks current weather; stale responses never reopen a left page; nulls never become zero; current/next month across years; no duplicate requests; header/back and app scroll; close/month state races.

User additions: include the forecast in startup settings; show current-hour ☔ probability and 💨 wind in m/s in the home greeting. User explicitly authorized one deployment after all changes and checks.
