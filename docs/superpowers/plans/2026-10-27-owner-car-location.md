# Owner-only last car location

Approved scope: Settings → Admin panel → password → separate Rudi connection page. Rudi Car section connects one headunit and displays its last point only. Reuse existing production Rudi car-device service and owner authorization. Preserve all launcher licensing, package and signing identity.

1. Add server-only salted scrypt password verifier and short admin sessions bound to an installation ID; atomic durable login budget. Owner-authenticated Rudi connection controls can set the supplied password. Without configured password, admin login fails closed. Require admin session plus single-use pairing code on public enrollment. Keep device write-only location tokens and revoke epochs.
2. Restore owner-only Rudi connection and last-point UI; no polling outside Car, no location history. Show capture time/accuracy, pairing expiry, disconnect and Yandex route.
3. Add native encrypted token storage, network executor, fresh GPS validation, single newest pending point, startup and hourly upload/retry. Location foreground service independent of trip tracking; start only from visible activity after explicit pairing. No exact-sleep guarantee or forced background start. Stop on disconnect/revocation.
4. Add standalone centered password dialog and separate admin page to packaged WebView, no secrets through generic preferences/JS status. Keep old WebView-compatible CSS.
5. Behavioral tests for password/session/owner and hourly/startup/queue rules; UI checks at 960x360, 1280x480, 1920x720; build signed 1.2.4 versionCode 36 in parallel mode and verify old certificate. Save source and APK. No Cloudflare publication requested.

Execution: inline in existing restored release and fresh Rudi feature branch based on live production df920f28. User explicitly requested implementation; no extra design approval pause. Password not supplied yet; never invent a default. Any production deployment awaits supplied password or owner setup and verified diff.
