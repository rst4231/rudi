# v4.376 verification

Base production: v4.375, 3fddc83d00648f4132a4e9f35807ac97b16ea47a. User authorized publication/deployment of the completed package in this conversation. Production was checked before preparing the release and still points to the base.

- Build and syntax checks passed; no duplicate HTML IDs or broken references to retired feature modules.
- 33 relevant checks passed: retired APIs/background work, compact smart-home summary, offline shell, page headers, fasting calendar/durations and finance period rollover.
- Independent code review found no important or critical blockers.
- Old dedicated feature tests were removed with their deleted implementations. Shared recipe storage and history data remain intact. Legacy For Di and Dates routes return Gone rather than triggering background work.
- Full npm test still stops at the same four pre-existing mood-picker-flow failures: dialog dimensions/emoji; dialog save/scroll; custom answer/Escape; keyboard focus/busy cancel. This is unchanged from the base.
- rudi-backup.test.cjs has the same six pre-existing source-assertion failures in the clean v4.375 baseline and edited tree: auth restore/register order; hidden shell bootstrap; backup previews/home-only; home preference source assertion; persistent mutation backup assertion; browser-auth backup assertion.

Calendar: sessions belong to their Moscow completion date. Month navigation and day selection are local. Totals use two units, a 30-day approximate month and a 365-day year. No server-side fasting data changed.

Finance: a local timer capped at 24 hours and foreground events detect the Moscow calendar boundary. Only selectors that followed the prior current month advance. Historical selection and dirty shared financial drafts are preserved. Existing month-change handlers update the metrics.

Final real-browser verification passed with mocked external services: compact dot summary, removed routes/tiles, unique photo link between memory and grid, saved recipes, fasting month/day interactions, and actual finance foreground rollover through the app input handlers. Historical financial selection was preserved. No JavaScript page errors. Calendar fits at 320/390/768px in both themes; Home/Photos/Products do not overflow. Existing decorative fasting background can extend a few pixels beyond the viewport at narrow widths; calendar/content bounds were checked separately.
