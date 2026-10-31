# Smart home page

Approved in chat: replace the device accordion with a dedicated page following Car; show active devices and battery alerts on the home card. User approved quick power controls, room groups, priority for low batteries, explicit unavailable and stale states.

Keep the climate hero on home. New smart-home tab uses the existing router and back stack. Move the existing rooms/scenarios to the page with no duplicate IDs; share the snapshot and refresh so navigation adds no network request. Show up to three active devices, with direct light/socket controls; all devices remain on the page. Battery threshold remains the existing <10%. Unavailable devices never count as enabled. Keep actor filtering, camera restrictions and offline command locks.

Alternatives: an expanded accordion was rejected by the request; a separate app or independent fetching would add complexity and requests. Use the existing page navigation.

Base: production v4.374, commit 0c08697774be0ac028719991756ddad9f6d3fea0. No deploy or remote push before explicit release approval.
