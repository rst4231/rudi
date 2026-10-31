# Smart home verification, v4.375

Base production: v4.374, 0c08697774be0ac028719991756ddad9f6d3fea0. Production checked again before release preparation and remains unchanged. No deployments or remote pushes performed.

- Build: npm run build passed.
- Syntax and git diff --check passed; no duplicate HTML IDs.
- 29 relevant tests passed across smart-home-page, smart-home-resilience, home-offline, offline-release-assets, rudi-version, unified page headers and navigation/motion.
- Real Chromium with mocked external API: full authenticated app; main card, dedicated page, page back and browser back; quick switch updates both views. One list call and one switch call. No page errors. Dark/light, widths 320/390/768: no horizontal overflow.
- Independent review identified stale label expiry and hidden home command errors. Both reproduced by failing behavioral tests, fixed and verified green. Freshness timeout is local, with no polling or added network requests.

## Pre-existing test failures

The full npm test run stops at four mood-picker-flow failures. The same four reproduce on a clean archive of production v4.374:
- dialog reuses weather dimensions and contains no emoji rendering
- actual dialog clicks show text, retain analyzer, save final draft and restore scroll
- actual custom answer form saves text; analyzer and Escape never save drafts
- keyboard focus stays inside dialog; busy save ignores cancel and duplicate clicks

Additional checks reveal these unchanged failures on the original production code too:
- seasonal temperature warnings match the existing climate assessment at boundaries (legacy VM harness lacks window.addEventListener)
- read-only sections prefer live API online and use snapshots only as fallback (outdated source assertion)
- car tile uses the same movable collapsible system without forcing saved layout positions (outdated source assertion)
- delayed iPhone Face ID enrollment wakes Smart Home and Car without polling (outdated source assertion)

No fixes to unrelated application behavior included. Relevant old accordion/header assertions were updated for the dedicated page and existing battery test harness now includes the production battery validator.
